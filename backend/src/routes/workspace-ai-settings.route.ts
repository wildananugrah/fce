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

const ALLOWED_PROVIDERS = new Set(["anthropic", "gemini", "openrouter"]);

const OPENROUTER_FIELDS = new Set([
	"openrouterApiKey",
	"openrouterModel",
	"openrouterContentModel",
	"openrouterCampaignModel",
	"openrouterTopicModel",
	"openrouterBrandScraperModel",
	"openrouterChatModel",
	"openrouterImageModel",
	"openrouterVideoModel",
]);
const LEGACY_FIELDS = new Set([
	"aiProvider",
	"aiContentProvider",
	"aiCampaignProvider",
	"aiTopicProvider",
	"aiBrandScraperProvider",
	"aiChatProvider",
	"anthropicApiKey",
	"anthropicModel",
	"geminiApiKey",
	"geminiModel",
	"geminiImageModel",
]);

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
				mode: resolved.mode,
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
					openrouterModel: record?.openrouterModel ?? null,
					openrouterContentModel: record?.openrouterContentModel ?? null,
					openrouterCampaignModel: record?.openrouterCampaignModel ?? null,
					openrouterTopicModel: record?.openrouterTopicModel ?? null,
					openrouterBrandScraperModel: record?.openrouterBrandScraperModel ?? null,
					openrouterChatModel: record?.openrouterChatModel ?? null,
					openrouterImageModel: record?.openrouterImageModel ?? null,
					openrouterVideoModel: record?.openrouterVideoModel ?? null,
				},
				credentials: {
					anthropic: maskKey(record?.anthropicApiKey),
					gemini: maskKey(record?.geminiApiKey),
					openrouter: maskKey(record?.openrouterApiKey),
				},
				source: resolved.source,
				effectiveModels: {
					anthropic: resolved.anthropic.model,
					gemini: resolved.gemini.model,
					geminiImage: resolved.gemini.imageModel,
					openrouter: resolved.openrouter.defaultModel,
					openrouterContent: resolved.openrouter.contentModel,
					openrouterCampaign: resolved.openrouter.campaignModel,
					openrouterTopic: resolved.openrouter.topicModel,
					openrouterBrandScraper: resolved.openrouter.brandScraperModel,
					openrouterChat: resolved.openrouter.chatModel,
					openrouterImage: resolved.openrouter.imageModel,
					openrouterVideo: resolved.openrouter.videoModel,
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
			"openrouterApiKey",
			"openrouterModel",
			"openrouterContentModel",
			"openrouterCampaignModel",
			"openrouterTopicModel",
			"openrouterBrandScraperModel",
			"openrouterChatModel",
			"openrouterImageModel",
			"openrouterVideoModel",
		] as const;
		for (const f of stringFields) {
			const v = sanitizeString(body[f]);
			if (v !== undefined) patch[f] = v;
		}

		const mode = aiFactory.mode;
		for (const key of Object.keys(patch)) {
			if (mode === "openrouter" && LEGACY_FIELDS.has(key)) {
				return c.json(
					{ error: `Field '${key}' is not accepted in openrouter mode` },
					400,
				);
			}
			if (mode === "legacy" && OPENROUTER_FIELDS.has(key)) {
				return c.json(
					{ error: `Field '${key}' is not accepted in legacy mode` },
					400,
				);
			}
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

	// POST /test-openrouter — verify an OpenRouter API key + model.
	// body: { apiKey: string; model: string }
	app.post("/test-openrouter", async (c) => {
		const body = (await c.req.json()) as { apiKey?: unknown; model?: unknown };
		const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
		const model = typeof body.model === "string" ? body.model : "";
		if (!apiKey || !model) {
			return c.json({ data: { connected: false, error: "apiKey and model are required" } }, 400);
		}

		try {
			// 1-token completion validates both the key and the model id in one call.
			const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [{ role: "user", content: "ping" }],
					max_tokens: 1,
				}),
			});
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				return c.json({
					data: { connected: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` },
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
