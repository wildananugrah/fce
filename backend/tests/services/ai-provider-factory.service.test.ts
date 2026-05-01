import { describe, expect, it } from "bun:test";
import {
	AiProviderFactory,
	type AiMode,
	type EnvAiDefaults,
} from "../../src/services/ai-provider-factory.service";

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeEnvDefaults(over: Partial<EnvAiDefaults>): EnvAiDefaults {
	return {
		aiProvider: "anthropic",
		aiContentProvider: "",
		aiCampaignProvider: "",
		aiTopicProvider: "",
		aiBrandScraperProvider: "",
		aiChatProvider: "",
		anthropicApiKey: "",
		anthropicModel: "claude-sonnet-4",
		geminiApiKey: "",
		geminiModel: "gemini-2.5-flash",
		geminiImageModel: "gemini-2.5-flash-image-preview",
		openrouterApiKey: "",
		openrouterModel: "",
		openrouterContentModel: "",
		openrouterCampaignModel: "",
		openrouterTopicModel: "",
		openrouterBrandScraperModel: "",
		openrouterChatModel: "",
		openrouterImageModel: "",
		openrouterVideoModel: "",
		...over,
	};
}

function makeFactory(
	repo: any,
	env: EnvAiDefaults,
	mode: AiMode = "legacy",
	minio: any = {},
	bucket: string = "fce-documents",
): AiProviderFactory {
	return new AiProviderFactory(repo, env, mode, minio, bucket);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("AiProviderFactory", () => {
	describe("getSettings — resolution", () => {
		it("workspace anthropic key takes priority over env", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "anthropic",
					anthropicApiKey: "ws-key",
					anthropicModel: null,
				}),
			} as any;
			const env = makeEnvDefaults({ anthropicApiKey: "env-key", anthropicModel: "claude-sonnet-4" });
			const factory = makeFactory(repo, env);
			const s = await factory.getSettings("ws-1");
			expect(s.anthropic.apiKey).toBe("ws-key");
			expect(s.anthropic.model).toBe("claude-sonnet-4");
			expect(s.source.anthropicApiKey).toBe("workspace");
			expect(s.source.anthropicModel).toBe("env");
		});

		it("env key used when workspace has none", async () => {
			const repo = {
				findByWorkspace: async () => ({ aiProvider: "gemini" }),
			} as any;
			const env = makeEnvDefaults({ geminiApiKey: "env-gemini", geminiModel: "gemini-2.5-flash" });
			const factory = makeFactory(repo, env);
			const s = await factory.getSettings("ws-2");
			expect(s.gemini.apiKey).toBe("env-gemini");
			expect(s.source.geminiApiKey).toBe("env");
		});

		it("null workspace setting record falls back entirely to env", async () => {
			const repo = { findByWorkspace: async () => null } as any;
			const env = makeEnvDefaults({ anthropicApiKey: "env-ant", anthropicModel: "claude-sonnet-4" });
			const factory = makeFactory(repo, env);
			const s = await factory.getSettings("ws-3");
			expect(s.anthropic.apiKey).toBe("env-ant");
			expect(s.providers.default).toBe("anthropic");
		});

		it("caches settings after first call", async () => {
			let calls = 0;
			const repo = {
				findByWorkspace: async () => {
					calls++;
					return { aiProvider: "anthropic", anthropicApiKey: "key" };
				},
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			await factory.getSettings("ws-4");
			await factory.getSettings("ws-4");
			expect(calls).toBe(1);
		});

		it("invalidate clears cache for specific workspace", async () => {
			let calls = 0;
			const repo = {
				findByWorkspace: async () => {
					calls++;
					return { aiProvider: "anthropic", anthropicApiKey: "key" };
				},
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			await factory.getSettings("ws-5");
			factory.invalidate("ws-5");
			await factory.getSettings("ws-5");
			expect(calls).toBe(2);
		});

		it("invalidateAll clears all cached workspaces", async () => {
			let calls = 0;
			const repo = {
				findByWorkspace: async () => {
					calls++;
					return { aiProvider: "anthropic", anthropicApiKey: "key" };
				},
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			await factory.getSettings("ws-a");
			await factory.getSettings("ws-b");
			factory.invalidateAll();
			await factory.getSettings("ws-a");
			await factory.getSettings("ws-b");
			expect(calls).toBe(4);
		});
	});

	describe("getContentGenerator — legacy mode", () => {
		it("returns AnthropicProvider when aiProvider=anthropic", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "anthropic",
					anthropicApiKey: "ant-key",
					anthropicModel: "claude-sonnet-4",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			const provider = await factory.getContentGenerator("ws-1");
			expect(provider.constructor.name).toBe("AnthropicProvider");
		});

		it("returns GeminiProvider when aiProvider=gemini", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "gemini",
					geminiApiKey: "gem-key",
					geminiModel: "gemini-2.5-flash",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			const provider = await factory.getContentGenerator("ws-1");
			expect(provider.constructor.name).toBe("GeminiProvider");
		});

		it("throws MissingApiKeyError when anthropic key missing", async () => {
			const repo = {
				findByWorkspace: async () => ({ aiProvider: "anthropic", anthropicApiKey: null }),
			} as any;
			const env = makeEnvDefaults({ anthropicApiKey: "" });
			const factory = makeFactory(repo, env);
			await expect(factory.getContentGenerator("ws-1")).rejects.toThrow(/Anthropic/);
		});

		it("per-generator content override uses aiContentProvider", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "anthropic",
					aiContentProvider: "gemini",
					geminiApiKey: "gem-key",
					geminiModel: "gemini-2.5-flash",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			const provider = await factory.getContentGenerator("ws-1");
			expect(provider.constructor.name).toBe("GeminiProvider");
		});
	});

	describe("getChatProvider — legacy mode", () => {
		it("returns AnthropicChatProvider for anthropic", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "anthropic",
					aiChatProvider: "anthropic",
					anthropicApiKey: "ant-key",
					anthropicModel: "claude-sonnet-4",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			const provider = await factory.getChatProvider("ws-1");
			expect(provider.constructor.name).toBe("AnthropicChatProvider");
		});

		it("returns GeminiChatProvider for gemini", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "gemini",
					aiChatProvider: "gemini",
					geminiApiKey: "gem-key",
					geminiModel: "gemini-2.5-flash",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			const provider = await factory.getChatProvider("ws-1");
			expect(provider.constructor.name).toBe("GeminiChatProvider");
		});
	});

	describe("getImageProvider", () => {
		it("legacy mode: returns GeminiImageProvider when gemini key present", async () => {
			const repo = {
				findByWorkspace: async () => ({
					geminiApiKey: "gem-key",
					geminiImageModel: "gemini-2.5-flash-image",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}));
			const provider = await factory.getImageProvider("ws-1");
			expect(provider).not.toBeNull();
			expect(provider!.constructor.name).toBe("GeminiImageProvider");
		});

		it("legacy mode: returns null when no gemini key", async () => {
			const repo = { findByWorkspace: async () => ({ geminiApiKey: null }) } as any;
			const factory = makeFactory(repo, makeEnvDefaults({ geminiApiKey: "" }));
			const provider = await factory.getImageProvider("ws-1");
			expect(provider).toBeNull();
		});

		it("openrouter mode: returns OpenRouterImageProvider", async () => {
			const repo = {
				findByWorkspace: async () => ({
					openrouterApiKey: "or-key",
					openrouterModel: "anthropic/claude-sonnet-4.5",
					openrouterImageModel: "openai/gpt-image-1",
				}),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}), "openrouter");
			const provider = await factory.getImageProvider("ws-1");
			expect(provider).not.toBeNull();
			expect(provider!.constructor.name).toBe("OpenRouterImageProvider");
		});
	});

	// ─── OpenRouter mode branching tests ────────────────────────────────────

	describe("openrouter mode", () => {
		it("returns OpenRouterProvider regardless of record.aiProvider", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "anthropic", // explicitly set, but mode overrides
					openrouterApiKey: "or-key",
					openrouterModel: "anthropic/claude-sonnet-4.5",
					openrouterContentModel: null,
				}),
			} as any;
			const env = makeEnvDefaults({ openrouterApiKey: "", openrouterModel: "" });
			const factory = makeFactory(repo, env, "openrouter");

			const provider = await factory.getContentGenerator("ws-1");
			expect(provider.constructor.name).toBe("OpenRouterProvider");
		});

		it("per-generator override falls back to default openrouter model", async () => {
			const repo = {
				findByWorkspace: async () => ({
					openrouterApiKey: "or-key",
					openrouterModel: "default-model",
					openrouterContentModel: "content-model",
					openrouterTopicModel: null,
				}),
			} as any;
			const env = makeEnvDefaults({});
			const factory = makeFactory(repo, env, "openrouter");

			const settings = await factory.getSettings("ws-1");
			expect(settings.openrouter.contentModel).toBe("content-model");
			expect(settings.openrouter.topicModel).toBe("default-model");
		});

		it("legacy mode: behaves exactly like before (regression guard)", async () => {
			const repo = {
				findByWorkspace: async () => ({
					aiProvider: "anthropic",
					anthropicApiKey: "ant-key",
					anthropicModel: "claude-sonnet-4",
				}),
			} as any;
			const env = makeEnvDefaults({});
			const factory = makeFactory(repo, env, "legacy");

			const provider = await factory.getContentGenerator("ws-1");
			expect(provider.constructor.name).toBe("AnthropicProvider");
		});

		it("missing API key throws MissingApiKeyError(\"OpenRouter\")", async () => {
			const repo = { findByWorkspace: async () => ({ openrouterApiKey: null }) } as any;
			const env = makeEnvDefaults({ openrouterApiKey: "" });
			const factory = makeFactory(repo, env, "openrouter");

			await expect(factory.getContentGenerator("ws-1")).rejects.toThrow(/OpenRouter/);
		});

		it("openrouter mode: source.contentModel reflects the actually-resolved field, not the blank per-generator field", async () => {
			const repo = {
				findByWorkspace: async () => ({
					openrouterApiKey: "or-key",
					openrouterModel: "default-from-workspace",
					openrouterContentModel: null, // blank → falls back to openrouterModel
				}),
			} as any;
			const env = makeEnvDefaults({ openrouterModel: "" });
			const factory = makeFactory(repo, env, "openrouter");

			const settings = await factory.getSettings("ws-1");
			expect(settings.openrouter.contentModel).toBe("default-from-workspace");
			// openrouterModel was sourced from "workspace", so contentModel should also report "workspace"
			expect(settings.source.openrouterContentModel).toBe("workspace");
		});
	});

	describe("ResolvedAiSettings — mode field", () => {
		it("mode field reflects factory mode in legacy", async () => {
			const repo = { findByWorkspace: async () => null } as any;
			const factory = makeFactory(repo, makeEnvDefaults({}), "legacy");
			const s = await factory.getSettings("ws-1");
			expect(s.mode).toBe("legacy");
		});

		it("mode field reflects factory mode in openrouter", async () => {
			const repo = {
				findByWorkspace: async () => ({ openrouterApiKey: "k", openrouterModel: "m" }),
			} as any;
			const factory = makeFactory(repo, makeEnvDefaults({}), "openrouter");
			const s = await factory.getSettings("ws-1");
			expect(s.mode).toBe("openrouter");
		});
	});
});
