import { Hono } from "hono";
import type { IAuditService } from "../interfaces/services/audit.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import type { AiSettingsPatch, WorkspaceSettingRepository } from "../repositories/workspace-setting.repository";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

/**
 * Return the raw workspace values alongside the effective values (after env
 * fallback) and per-field "source" tags so the UI can show "using environment
 * fallback" badges without leaking the env values themselves.
 */
function maskKey(key: string | null | undefined): { configured: boolean; masked: string | null } {
	if (!key) return { configured: false, masked: null };
	const last4 = key.slice(-4);
	return { configured: true, masked: `••••••••${last4}` };
}

const ALLOWED_PROVIDERS = new Set(["anthropic", "gemini"]);

function sanitizeProvider(value: unknown): string | null | undefined {
	if (value === null) return null; // clear
	if (typeof value !== "string") return undefined; // ignore
	if (value === "") return null; // treat empty string as clear
	if (!ALLOWED_PROVIDERS.has(value)) return undefined; // reject invalid
	return value;
}

function sanitizeString(value: unknown): string | null | undefined {
	if (value === null) return null;
	if (typeof value !== "string") return undefined;
	if (value === "") return null;
	return value;
}

export function createWorkspaceAiSettingsRoutes(
	settingRepo: WorkspaceSettingRepository,
	aiFactory: AiProviderFactory,
	auditService: IAuditService,
) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — effective settings + what's stored on the workspace.
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const resolved = await aiFactory.getSettings(workspaceId);
		const record = await settingRepo.findByWorkspace(workspaceId);

		return c.json({
			data: {
				providers: resolved.providers,
				workspaceValues: {
					aiProvider: record?.aiProvider ?? null,
					aiContentProvider: record?.aiContentProvider ?? null,
					aiCampaignProvider: record?.aiCampaignProvider ?? null,
					aiTopicProvider: record?.aiTopicProvider ?? null,
					aiBrandScraperProvider: record?.aiBrandScraperProvider ?? null,
					aiChatProvider: record?.aiChatProvider ?? null,
					anthropicModel: record?.anthropicModel ?? null,
					geminiModel: record?.geminiModel ?? null,
					geminiImageModel: record?.geminiImageModel ?? null,
				},
				credentials: {
					anthropic: maskKey(record?.anthropicApiKey),
					gemini: maskKey(record?.geminiApiKey),
				},
				source: resolved.source,
				effectiveModels: {
					anthropic: resolved.anthropic.model,
					gemini: resolved.gemini.model,
					geminiImage: resolved.gemini.imageModel,
				},
			},
		});
	});

	// PUT / — partial patch. Passing `null` for a field clears it (revert to env).
	app.put("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = (await c.req.json()) as Record<string, unknown>;

		const patch: AiSettingsPatch = {};
		const providerFields = [
			"aiProvider",
			"aiContentProvider",
			"aiCampaignProvider",
			"aiTopicProvider",
			"aiBrandScraperProvider",
			"aiChatProvider",
		] as const;
		for (const f of providerFields) {
			const v = sanitizeProvider(body[f]);
			if (v !== undefined) patch[f] = v;
		}
		const stringFields = [
			"anthropicApiKey",
			"anthropicModel",
			"geminiApiKey",
			"geminiModel",
			"geminiImageModel",
		] as const;
		for (const f of stringFields) {
			const v = sanitizeString(body[f]);
			if (v !== undefined) patch[f] = v;
		}

		if (Object.keys(patch).length === 0) {
			return c.json({ error: "No valid fields to update" }, 400);
		}

		await settingRepo.upsertAiSettings(workspaceId, patch);
		// Evict cache so the next provider request sees the new values without
		// requiring a backend restart.
		aiFactory.invalidate(workspaceId);

		// Audit: record only the field NAMES that changed. API keys and other
		// secret values must never enter audit metadata.
		await auditService.log({
			workspaceId,
			userId: c.get("userId"),
			action: "workspace.ai_settings_update",
			entityType: "workspace_ai_settings",
			entityId: workspaceId,
			metadata: { changedFields: Object.keys(patch) },
		});

		return c.json({ data: { updated: true } });
	});

	// POST /test — quick ping to verify a provider's credentials work.
	// body: { provider: "anthropic" | "gemini" }
	app.post("/test", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = (await c.req.json()) as { provider?: unknown };
		const provider = body?.provider;
		if (provider !== "anthropic" && provider !== "gemini") {
			return c.json({ error: "provider must be 'anthropic' or 'gemini'" }, 400);
		}

		const settings = await aiFactory.getSettings(workspaceId);
		const apiKey = provider === "anthropic" ? settings.anthropic.apiKey : settings.gemini.apiKey;
		if (!apiKey) {
			return c.json({ data: { connected: false, error: "No API key configured" } });
		}

		try {
			if (provider === "anthropic") {
				// Cheapest verification: the SDK's message API doesn't have a
				// standalone ping, so we do a tiny completion with max_tokens=1.
				const Anthropic = (await import("@anthropic-ai/sdk")).default;
				const client = new Anthropic({ apiKey });
				await client.messages.create({
					model: settings.anthropic.model,
					max_tokens: 1,
					messages: [{ role: "user", content: "ping" }],
				});
			} else {
				const { GoogleGenAI } = await import("@google/genai");
				const genai = new GoogleGenAI({ apiKey });
				await genai.models.generateContent({
					model: settings.gemini.model,
					contents: "ping",
					config: { maxOutputTokens: 1 },
				});
			}
			return c.json({ data: { connected: true } });
		} catch (e) {
			return c.json({
				data: {
					connected: false,
					error: e instanceof Error ? e.message : "Connection failed",
				},
			});
		}
	});

	return app;
}
