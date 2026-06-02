import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import type { MinioStorageProvider } from "../providers/minio.provider";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

const SIGNED_URL_TTL_SECONDS = 86400; // 24 hours
const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface TokenUsageExportJobData {
	workspaceId: string;
	userId: string;
	dateFrom: string; // ISO date string
	dateTo: string;   // ISO date string
	jobId: string;
}

export class TokenUsageExportJob {
	constructor(
		private prisma: PrismaClient,
		private storage: MinioStorageProvider,
		private bucket: string,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TokenUsageExportJobData): Promise<void> {
		const { workspaceId, userId, dateFrom, dateTo, jobId } = data;
		const filename = `token-usage-${dateFrom}-${dateTo}.xlsx`;
		const key = `exports/${workspaceId}/${jobId}-token-usage.xlsx`;

		try {
			this.logger.info("token-usage-export: starting", { workspaceId, userId, dateFrom, dateTo });

			const [detail, byUser, byDay, byModel] = await Promise.all([
				this.queryDetail(workspaceId, dateFrom, dateTo),
				this.queryByUser(workspaceId, dateFrom, dateTo),
				this.queryByDay(workspaceId, dateFrom, dateTo),
				this.queryByModel(workspaceId, dateFrom, dateTo),
			]);

			const workbook = new ExcelJS.Workbook();
			workbook.creator = "FCE Dashboard";
			workbook.created = new Date();

			this.buildDetailSheet(workbook, detail as Record<string, unknown>[]);
			this.buildByUserSheet(workbook, byUser as Record<string, unknown>[]);
			this.buildByDaySheet(workbook, byDay as Record<string, unknown>[]);
			this.buildByModelSheet(workbook, byModel as Record<string, unknown>[]);

			const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
			await this.storage.upload(this.bucket, key, buffer, CONTENT_TYPE);
			const url = await this.storage.getSignedUrl(this.bucket, key, SIGNED_URL_TTL_SECONDS);

			this.logger.info("token-usage-export: complete", { workspaceId, key });
			this.notificationService.notify(userId, {
				type: "export_ready",
				data: { url, filename, workspaceId },
			});
		} catch (err) {
			this.logger.error("token-usage-export: failed", {
				workspaceId,
				error: err instanceof Error ? err.message : String(err),
			});
			this.notificationService.notify(userId, {
				type: "export_failed",
				data: { workspaceId },
			});
		}
	}

	// ─── Sheet 1: Detail Log ───────────────────────────────────────────────

	private async queryDetail(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				apl.created_at        AS "timestamp",
				u.email               AS "user_email",
				u.full_name           AS "user_name",
				w.name                AS "workspace",
				apl.generator,
				apl.provider          AS "ai_provider",
				apl.model,
				b.name                AS "brand",
				p.name                AS "product",
				apl.platform,
				apl.content_type,
				apl.system_prompt,
				apl.user_prompt,
				apl.response_text,
				apl.input_tokens,
				apl.output_tokens,
				(COALESCE(apl.input_tokens,0) + COALESCE(apl.output_tokens,0)) AS "total_tokens",
				apl.estimated_cost    AS "estimated_cost_usd",
				apl.duration_ms,
				apl.status,
				apl.error_message,
				apl.id                AS "log_id",
				apl.request_id        AS "generation_request_id"
			FROM ai_provider_logs apl
			LEFT JOIN workspaces w ON w.id = apl.workspace_id
			LEFT JOIN users      u ON u.id = apl.user_id
			LEFT JOIN brands     b ON b.id = apl.brand_id
			LEFT JOIN products   p ON p.id = apl.product_id
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			ORDER BY apl.created_at DESC`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildDetailSheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("Detail Log");
		sheet.columns = [
			{ header: "Timestamp",             key: "timestamp",              width: 22 },
			{ header: "User Email",             key: "user_email",             width: 28 },
			{ header: "User Name",              key: "user_name",              width: 20 },
			{ header: "Workspace",              key: "workspace",              width: 20 },
			{ header: "Generator",              key: "generator",              width: 16 },
			{ header: "AI Provider",            key: "ai_provider",            width: 14 },
			{ header: "Model",                  key: "model",                  width: 30 },
			{ header: "Brand",                  key: "brand",                  width: 20 },
			{ header: "Product",                key: "product",                width: 20 },
			{ header: "Platform",               key: "platform",               width: 14 },
			{ header: "Content Type",           key: "content_type",           width: 18 },
			{ header: "System Prompt",          key: "system_prompt",          width: 60 },
			{ header: "User Prompt",            key: "user_prompt",            width: 60 },
			{ header: "Response",               key: "response_text",          width: 60 },
			{ header: "Input Tokens",           key: "input_tokens",           width: 14 },
			{ header: "Output Tokens",          key: "output_tokens",          width: 14 },
			{ header: "Total Tokens",           key: "total_tokens",           width: 14 },
			{ header: "Cost (USD)",             key: "estimated_cost_usd",     width: 12 },
			{ header: "Duration (ms)",          key: "duration_ms",            width: 14 },
			{ header: "Status",                 key: "status",                 width: 10 },
			{ header: "Error",                  key: "error_message",          width: 40 },
			{ header: "Log ID",                 key: "log_id",                 width: 38 },
			{ header: "Generation Request ID",  key: "generation_request_id",  width: 38 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(row);
	}

	// ─── Sheet 2: By User ──────────────────────────────────────────────────

	private async queryByUser(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				u.email           AS "user_email",
				u.full_name       AS "user_name",
				w.name            AS "workspace",
				COUNT(*)          AS "total_calls",
				SUM(COALESCE(apl.input_tokens,0))                                        AS "total_input_tokens",
				SUM(COALESCE(apl.output_tokens,0))                                       AS "total_output_tokens",
				SUM(COALESCE(apl.input_tokens,0)+COALESCE(apl.output_tokens,0))          AS "total_tokens",
				SUM(COALESCE(apl.estimated_cost,0))                                      AS "total_cost_usd",
				MIN(apl.created_at) AS "first_call",
				MAX(apl.created_at) AS "last_call"
			FROM ai_provider_logs apl
			LEFT JOIN workspaces w ON w.id = apl.workspace_id
			LEFT JOIN users      u ON u.id = apl.user_id
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			GROUP BY u.email, u.full_name, w.name
			ORDER BY total_tokens DESC`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildByUserSheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("By User");
		sheet.columns = [
			{ header: "User Email",          key: "user_email",           width: 28 },
			{ header: "User Name",           key: "user_name",            width: 20 },
			{ header: "Workspace",           key: "workspace",            width: 20 },
			{ header: "Total Calls",         key: "total_calls",          width: 14 },
			{ header: "Input Tokens",        key: "total_input_tokens",   width: 16 },
			{ header: "Output Tokens",       key: "total_output_tokens",  width: 16 },
			{ header: "Total Tokens",        key: "total_tokens",         width: 16 },
			{ header: "Total Cost (USD)",    key: "total_cost_usd",       width: 16 },
			{ header: "First Call",          key: "first_call",           width: 22 },
			{ header: "Last Call",           key: "last_call",            width: 22 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(bigIntToNumber(row));
	}

	// ─── Sheet 3: Daily Usage ──────────────────────────────────────────────

	private async queryByDay(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				DATE(apl.created_at) AS "day",
				w.name               AS "workspace",
				apl.generator,
				COUNT(*)             AS "calls",
				SUM(COALESCE(apl.input_tokens,0))                               AS "input_tokens",
				SUM(COALESCE(apl.output_tokens,0))                              AS "output_tokens",
				SUM(COALESCE(apl.input_tokens,0)+COALESCE(apl.output_tokens,0)) AS "total_tokens",
				SUM(COALESCE(apl.estimated_cost,0))                             AS "total_cost_usd"
			FROM ai_provider_logs apl
			LEFT JOIN workspaces w ON w.id = apl.workspace_id
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			GROUP BY DATE(apl.created_at), w.name, apl.generator
			ORDER BY day DESC, total_tokens DESC`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildByDaySheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("Daily Usage");
		sheet.columns = [
			{ header: "Day",             key: "day",            width: 14 },
			{ header: "Workspace",       key: "workspace",      width: 20 },
			{ header: "Generator",       key: "generator",      width: 16 },
			{ header: "Calls",           key: "calls",          width: 10 },
			{ header: "Input Tokens",    key: "input_tokens",   width: 14 },
			{ header: "Output Tokens",   key: "output_tokens",  width: 14 },
			{ header: "Total Tokens",    key: "total_tokens",   width: 14 },
			{ header: "Cost (USD)",      key: "total_cost_usd", width: 14 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(bigIntToNumber(row));
	}

	// ─── Sheet 4: By Model ─────────────────────────────────────────────────

	private async queryByModel(workspaceId: string, dateFrom: string, dateTo: string) {
		return this.prisma.$queryRawUnsafe(
			`SELECT
				apl.provider         AS "provider",
				apl.model,
				apl.generator,
				COUNT(*)             AS "calls",
				SUM(COALESCE(apl.input_tokens,0))  AS "input_tokens",
				SUM(COALESCE(apl.output_tokens,0)) AS "output_tokens",
				SUM(COALESCE(apl.estimated_cost,0)) AS "total_cost_usd",
				ROUND(AVG(apl.duration_ms))         AS "avg_duration_ms"
			FROM ai_provider_logs apl
			WHERE apl.workspace_id = $1
			  AND apl.created_at >= $2::timestamptz
			  AND apl.created_at <  $3::timestamptz + INTERVAL '1 day'
			GROUP BY apl.provider, apl.model, apl.generator
			ORDER BY total_cost_usd DESC NULLS LAST`,
			workspaceId, dateFrom, dateTo,
		);
	}

	private buildByModelSheet(workbook: ExcelJS.Workbook, rows: Record<string, unknown>[]) {
		const sheet = workbook.addWorksheet("By Model");
		sheet.columns = [
			{ header: "Provider",         key: "provider",       width: 14 },
			{ header: "Model",            key: "model",          width: 36 },
			{ header: "Generator",        key: "generator",      width: 16 },
			{ header: "Calls",            key: "calls",          width: 10 },
			{ header: "Input Tokens",     key: "input_tokens",   width: 14 },
			{ header: "Output Tokens",    key: "output_tokens",  width: 14 },
			{ header: "Total Cost (USD)", key: "total_cost_usd", width: 16 },
			{ header: "Avg Duration (ms)",key: "avg_duration_ms",width: 18 },
		];
		styleHeaderRow(sheet);
		for (const row of rows) sheet.addRow(bigIntToNumber(row));
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
	const headerRow = sheet.getRow(1);
	headerRow.font = { bold: true };
	headerRow.fill = {
		type: "pattern",
		pattern: "solid",
		fgColor: { argb: "FFE8EAED" },
	};
	headerRow.commit();
}

// Prisma $queryRawUnsafe returns COUNT(*) as BigInt — Excel can't serialise it.
function bigIntToNumber(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		out[k] = typeof v === "bigint" ? Number(v) : v;
	}
	return out;
}
