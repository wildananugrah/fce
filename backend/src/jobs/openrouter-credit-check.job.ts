import type { PrismaClient } from "@prisma/client";
import type { IEmailProvider } from "../interfaces/providers/email.provider.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface KeyInfoResponse {
	data: {
		limit: number | null;
		usage: number;
	};
}

export class OpenRouterCreditCheckJob {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private email: IEmailProvider,
		private logger: ILogger,
		private fetchFn: FetchFn = fetch,
	) {}

	async handle(): Promise<void> {
		// Collect targets from workspaces that have openrouterCreditAlertEmail set.
		const workspaceTargets = await this.prisma.workspaceSetting.findMany({
			where: { openrouterCreditAlertEmail: { not: null } },
			select: {
				workspaceId: true,
				openrouterCreditAlertEmail: true,
				openrouterCreditAlertThreshold: true,
			},
		});

		const targets: Array<{ workspaceId: string | null; alertEmail: string; thresholdUsd: number }> = [];

		for (const ws of workspaceTargets) {
			if (!ws.openrouterCreditAlertEmail) continue;
			targets.push({
				workspaceId: ws.workspaceId,
				alertEmail: ws.openrouterCreditAlertEmail,
				thresholdUsd:
					ws.openrouterCreditAlertThreshold ??
					parseFloat(process.env.OPENROUTER_CREDIT_ALERT_THRESHOLD ?? "5"),
			});
		}

		// Env-level fallback: only used when no workspace has individually configured an alert.
		const envEmail = process.env.OPENROUTER_CREDIT_ALERT_EMAIL;
		const envApiKey = process.env.OPENROUTER_API_KEY;
		if (envEmail && envApiKey && targets.length === 0) {
			targets.push({
				workspaceId: null,
				alertEmail: envEmail,
				thresholdUsd: parseFloat(process.env.OPENROUTER_CREDIT_ALERT_THRESHOLD ?? "5"),
			});
		}

		if (targets.length === 0) {
			this.logger.info("openrouter-credit-check: no alert targets configured, skipping");
			return;
		}

		for (const target of targets) {
			await this.checkTarget(target);
		}
	}

	private async checkTarget(target: {
		workspaceId: string | null;
		alertEmail: string;
		thresholdUsd: number;
	}): Promise<void> {
		// Resolve API key: workspace setting → env fallback
		let apiKey: string | null = null;
		if (target.workspaceId) {
			const settings = await this.aiFactory.getSettings(target.workspaceId);
			apiKey = settings.openrouter.apiKey || null;
		}
		if (!apiKey) apiKey = process.env.OPENROUTER_API_KEY ?? null;

		if (!apiKey) {
			this.logger.warn("openrouter-credit-check: no API key for target, skipping", {
				workspaceId: target.workspaceId,
			});
			return;
		}

		let res: Response;
		try {
			res = await this.fetchFn(OPENROUTER_KEY_URL, {
				headers: { Authorization: `Bearer ${apiKey}` },
			});
		} catch (err) {
			this.logger.error("openrouter-credit-check: fetch failed", {
				workspaceId: target.workspaceId,
				error: err instanceof Error ? err.message : String(err),
			});
			return;
		}

		if (!res.ok) {
			this.logger.error("openrouter-credit-check: API returned error", {
				workspaceId: target.workspaceId,
				status: res.status,
			});
			return;
		}

		const body = (await res.json()) as KeyInfoResponse;
		const { limit, usage } = body.data;

		if (limit === null) {
			this.logger.info("openrouter-credit-check: key has no limit (unlimited), skipping alert", {
				workspaceId: target.workspaceId,
			});
			return;
		}

		const remainingUsd = limit - usage;

		this.logger.info("openrouter-credit-check: balance checked", {
			workspaceId: target.workspaceId,
			remainingUsd: remainingUsd.toFixed(2),
			thresholdUsd: target.thresholdUsd,
			alertRequired: remainingUsd <= target.thresholdUsd,
		});

		if (remainingUsd <= target.thresholdUsd) {
			try {
				await this.email.sendCreditAlert({
					to: target.alertEmail,
					remainingUsd,
					thresholdUsd: target.thresholdUsd,
				});
				this.logger.info("openrouter-credit-check: alert email sent", {
					to: target.alertEmail,
					workspaceId: target.workspaceId,
				});
			} catch (err) {
				this.logger.error("openrouter-credit-check: failed to send alert email", {
					workspaceId: target.workspaceId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
}
