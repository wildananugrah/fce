import type { WorkspaceSetting } from "@prisma/client";
import { MissingApiKeyError } from "../errors/ai-key-missing-error";
import { AnthropicProvider } from "../providers/anthropic.provider";
import { GeminiProvider } from "../providers/gemini.provider";
import { AnthropicChatProvider } from "../providers/anthropic-chat.provider";
import { GeminiChatProvider } from "../providers/gemini-chat.provider";
import { GeminiImageProvider } from "../providers/gemini-image.provider";
import { GeminiVideoAnalyzerProvider } from "../providers/gemini-video.provider";
import { OpenRouterProvider } from "../providers/openrouter.provider";
import { OpenRouterChatProvider } from "../providers/openrouter-chat.provider";
import { OpenRouterImageProvider } from "../providers/openrouter-image.provider";
import { OpenRouterVideoAnalyzerProvider } from "../providers/openrouter-video.provider";
import type { MinioStorageProvider } from "../providers/minio.provider";
import type { IBrandScraper } from "../interfaces/providers/brand-scraper.interface";
import type { ICampaignBriefSummarizer } from "../interfaces/providers/campaign-brief-summarizer.interface";
import type { ICampaignGenerator } from "../interfaces/providers/campaign-generator.interface";
import type { IChatAiProvider } from "../interfaces/providers/chat-ai.provider.interface";
import type { IContentGenerator } from "../interfaces/providers/content-generator.interface";
import type { IImageGenerator } from "../interfaces/providers/image-generator.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { IVideoAnalyzer } from "../interfaces/providers/video-analyzer.interface";
import type { WorkspaceSettingRepository } from "../repositories/workspace-setting.repository";

export type ProviderName = "anthropic" | "gemini" | "openrouter";
export type AiMode = "openrouter" | "legacy";

export interface ResolvedAiSettings {
	mode: AiMode;
	providers: {
		default: ProviderName;
		content: ProviderName;
		campaign: ProviderName;
		topic: ProviderName;
		brandScraper: ProviderName;
		chat: ProviderName;
	};
	anthropic: { apiKey: string; model: string };
	gemini: { apiKey: string; model: string; imageModel: string };
	openrouter: {
		apiKey: string;
		defaultModel: string;
		contentModel: string;
		campaignModel: string;
		topicModel: string;
		brandScraperModel: string;
		chatModel: string;
		imageModel: string;
		videoModel: string;
	};
	source: {
		aiProvider: "workspace" | "env";
		aiContentProvider: "workspace" | "env";
		aiCampaignProvider: "workspace" | "env";
		aiTopicProvider: "workspace" | "env";
		aiBrandScraperProvider: "workspace" | "env";
		aiChatProvider: "workspace" | "env";
		anthropicApiKey: "workspace" | "env";
		anthropicModel: "workspace" | "env";
		geminiApiKey: "workspace" | "env";
		geminiModel: "workspace" | "env";
		geminiImageModel: "workspace" | "env";
		// new openrouter source fields
		openrouterApiKey: "workspace" | "env";
		openrouterModel: "workspace" | "env";
		openrouterContentModel: "workspace" | "env";
		openrouterCampaignModel: "workspace" | "env";
		openrouterTopicModel: "workspace" | "env";
		openrouterBrandScraperModel: "workspace" | "env";
		openrouterChatModel: "workspace" | "env";
		openrouterImageModel: "workspace" | "env";
		openrouterVideoModel: "workspace" | "env";
	};
}

export interface EnvAiDefaults {
	aiProvider: string;
	aiContentProvider: string;
	aiCampaignProvider: string;
	aiTopicProvider: string;
	aiBrandScraperProvider: string;
	aiChatProvider: string;
	anthropicApiKey: string;
	anthropicModel: string;
	geminiApiKey: string;
	geminiModel: string;
	geminiImageModel: string;
	// new
	openrouterApiKey: string;
	openrouterModel: string;
	openrouterContentModel: string;
	openrouterCampaignModel: string;
	openrouterTopicModel: string;
	openrouterBrandScraperModel: string;
	openrouterChatModel: string;
	openrouterImageModel: string;
	openrouterVideoModel: string;
}

/**
 * Resolves AI provider configuration per workspace and constructs provider
 * instances on demand. Resolution order for each field:
 *   workspace setting → env default → built-in default.
 *
 * Cache stores only the *resolved settings* per workspace (cheap to keep,
 * avoids a DB round trip on every call). Provider instances themselves are
 * built fresh per call because providers track transient state (last token
 * usage) on the instance, which can't be safely shared between concurrent
 * jobs from the same workspace.
 *
 * On settings change callers must invoke `invalidate(workspaceId)` so the
 * next access picks up the new values — no backend restart required.
 */
export class AiProviderFactory {
	private settingsCache = new Map<string, ResolvedAiSettings>();

	constructor(
		private repo: WorkspaceSettingRepository,
		private envDefaults: EnvAiDefaults,
		private mode: AiMode,
		private minio: MinioStorageProvider,
		private minioBucket: string,
	) {}

	invalidate(workspaceId: string): void {
		this.settingsCache.delete(workspaceId);
	}

	invalidateAll(): void {
		this.settingsCache.clear();
	}

	async getSettings(workspaceId: string): Promise<ResolvedAiSettings> {
		const cached = this.settingsCache.get(workspaceId);
		if (cached) return cached;
		const record = await this.repo.findByWorkspace(workspaceId);
		const resolved = this.resolve(record);
		this.settingsCache.set(workspaceId, resolved);
		return resolved;
	}

	async getContentGenerator(workspaceId: string): Promise<IContentGenerator & { lastUsage?: unknown }> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.contentModel);
		}
		return this.buildGenerator(s, s.providers.content);
	}

	async getCampaignGenerator(workspaceId: string): Promise<ICampaignGenerator & { lastUsage?: unknown }> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.campaignModel);
		}
		return this.buildGenerator(s, s.providers.campaign);
	}

	async getBriefSummarizer(workspaceId: string): Promise<ICampaignBriefSummarizer & { lastUsage?: unknown }> {
		// Brief summary reuses the campaign provider selection.
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.campaignModel);
		}
		return this.buildGenerator(s, s.providers.campaign);
	}

	async getTopicGenerator(workspaceId: string): Promise<ITopicGenerator & { lastUsage?: unknown }> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.topicModel);
		}
		return this.buildGenerator(s, s.providers.topic);
	}

	async getBrandScraper(workspaceId: string): Promise<IBrandScraper & { lastUsage?: unknown }> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.brandScraperModel);
		}
		return this.buildGenerator(s, s.providers.brandScraper);
	}

	async getChatProvider(workspaceId: string): Promise<IChatAiProvider> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterChatProvider(s.openrouter.apiKey, s.openrouter.chatModel);
		}
		if (s.providers.chat === "anthropic") {
			this.requireKey("anthropic", s.anthropic.apiKey);
			return new AnthropicChatProvider(s.anthropic.apiKey, s.anthropic.model);
		}
		this.requireKey("gemini", s.gemini.apiKey);
		return new GeminiChatProvider(s.gemini.apiKey, s.gemini.model);
	}

	async getImageProvider(workspaceId: string): Promise<IImageGenerator | null> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterImageProvider(s.openrouter.apiKey, s.openrouter.imageModel);
		}
		// Legacy path — preserve current behavior of getGeminiImageProvider.
		if (!s.gemini.apiKey) return null;
		return new GeminiImageProvider(s.gemini.apiKey, s.gemini.imageModel);
	}

	async getVideoAnalyzer(workspaceId: string): Promise<IVideoAnalyzer> {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterVideoAnalyzerProvider(
				s.openrouter.apiKey,
				s.openrouter.videoModel,
				this.minio,
				this.minioBucket,
			);
		}
		// Legacy path — Gemini video analyzer.
		if (!s.gemini.apiKey) {
			throw new MissingApiKeyError("Gemini");
		}
		return new GeminiVideoAnalyzerProvider(s.gemini.apiKey, s.gemini.model);
	}

	// ─── Internals ────────────────────────────────────────────────

	private resolve(record: WorkspaceSetting | null): ResolvedAiSettings {
		const env = this.envDefaults;

		const pick = (ws: string | null | undefined, envVal: string): { value: string; source: "workspace" | "env" } => {
			if (ws && ws.length > 0) return { value: ws, source: "workspace" };
			return { value: envVal, source: "env" };
		};

		const defaultProvider = pick(record?.aiProvider, env.aiProvider || "anthropic");
		const contentProvider = pick(record?.aiContentProvider, env.aiContentProvider);
		const campaignProvider = pick(record?.aiCampaignProvider, env.aiCampaignProvider);
		const topicProvider = pick(record?.aiTopicProvider, env.aiTopicProvider);
		const brandScraperProvider = pick(record?.aiBrandScraperProvider, env.aiBrandScraperProvider);
		const chatProvider = pick(record?.aiChatProvider, env.aiChatProvider);

		const anthropicApiKey = pick(record?.anthropicApiKey, env.anthropicApiKey);
		const anthropicModel = pick(record?.anthropicModel, env.anthropicModel);
		const geminiApiKey = pick(record?.geminiApiKey, env.geminiApiKey);
		const geminiModel = pick(record?.geminiModel, env.geminiModel);
		const geminiImageModel = pick(record?.geminiImageModel, env.geminiImageModel);

		// OpenRouter fields
		const openrouterApiKey = pick(record?.openrouterApiKey, env.openrouterApiKey);
		const openrouterModel = pick(record?.openrouterModel, env.openrouterModel);
		const orContentModel = pick(record?.openrouterContentModel, env.openrouterContentModel);
		const orCampaignModel = pick(record?.openrouterCampaignModel, env.openrouterCampaignModel);
		const orTopicModel = pick(record?.openrouterTopicModel, env.openrouterTopicModel);
		const orBrandModel = pick(record?.openrouterBrandScraperModel, env.openrouterBrandScraperModel);
		const orChatModel = pick(record?.openrouterChatModel, env.openrouterChatModel);
		const orImageModel = pick(record?.openrouterImageModel, env.openrouterImageModel);
		const orVideoModel = pick(record?.openrouterVideoModel, env.openrouterVideoModel);

		const fallbackToDefault = (
			val: { value: string; source: "workspace" | "env" },
		): { value: string; source: "workspace" | "env" } =>
			val.value && val.value.length > 0 ? val : openrouterModel;

		const orContent = fallbackToDefault(orContentModel);
		const orCampaign = fallbackToDefault(orCampaignModel);
		const orTopic = fallbackToDefault(orTopicModel);
		const orBrand = fallbackToDefault(orBrandModel);
		const orChat = fallbackToDefault(orChatModel);
		const orImage = fallbackToDefault(orImageModel);
		const orVideo = fallbackToDefault(orVideoModel);

		const normalize = (name: string, fallback: ProviderName): ProviderName => {
			if (name === "anthropic" || name === "gemini" || name === "openrouter") return name;
			return fallback;
		};

		const effectiveDefault = normalize(defaultProvider.value, "anthropic");
		const override = (o: { value: string }): ProviderName =>
			normalize(o.value || effectiveDefault, effectiveDefault);

		return {
			mode: this.mode,
			providers: {
				default: effectiveDefault,
				content: override(contentProvider),
				campaign: override(campaignProvider),
				topic: override(topicProvider),
				brandScraper: override(brandScraperProvider),
				chat: override(chatProvider),
			},
			anthropic: { apiKey: anthropicApiKey.value, model: anthropicModel.value },
			gemini: {
				apiKey: geminiApiKey.value,
				model: geminiModel.value,
				imageModel: geminiImageModel.value,
			},
			openrouter: {
				apiKey: openrouterApiKey.value,
				defaultModel: openrouterModel.value,
				contentModel: orContent.value,
				campaignModel: orCampaign.value,
				topicModel: orTopic.value,
				brandScraperModel: orBrand.value,
				chatModel: orChat.value,
				imageModel: orImage.value,
				videoModel: orVideo.value,
			},
			source: {
				aiProvider: defaultProvider.source,
				aiContentProvider: contentProvider.source,
				aiCampaignProvider: campaignProvider.source,
				aiTopicProvider: topicProvider.source,
				aiBrandScraperProvider: brandScraperProvider.source,
				aiChatProvider: chatProvider.source,
				anthropicApiKey: anthropicApiKey.source,
				anthropicModel: anthropicModel.source,
				geminiApiKey: geminiApiKey.source,
				geminiModel: geminiModel.source,
				geminiImageModel: geminiImageModel.source,
				openrouterApiKey: openrouterApiKey.source,
				openrouterModel: openrouterModel.source,
				openrouterContentModel: orContent.source,
				openrouterCampaignModel: orCampaign.source,
				openrouterTopicModel: orTopic.source,
				openrouterBrandScraperModel: orBrand.source,
				openrouterChatModel: orChat.source,
				openrouterImageModel: orImage.source,
				openrouterVideoModel: orVideo.source,
			},
		};
	}

	private buildGenerator(
		settings: ResolvedAiSettings,
		provider: ProviderName,
	): AnthropicProvider | GeminiProvider {
		if (provider === "anthropic") {
			this.requireKey("anthropic", settings.anthropic.apiKey);
			return new AnthropicProvider(settings.anthropic.apiKey, settings.anthropic.model);
		}
		this.requireKey("gemini", settings.gemini.apiKey);
		return new GeminiProvider(settings.gemini.apiKey, settings.gemini.model);
	}

	private requireKey(provider: ProviderName, apiKey: string): void {
		if (apiKey && apiKey.length > 0) return;
		const label =
			provider === "anthropic" ? "Anthropic" : provider === "gemini" ? "Gemini" : "OpenRouter";
		throw new MissingApiKeyError(label);
	}
}
