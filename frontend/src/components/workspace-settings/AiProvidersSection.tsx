import { useEffect, useState } from "react";
import { useSystemContext } from "../../contexts/SystemContext";
import { api } from "../../services/api";
import { OpenRouterModelPicker } from "../settings/OpenRouterModelPicker";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

type Provider = "anthropic" | "gemini";
type Source = "workspace" | "env";

interface AiSettings {
	mode: "openrouter" | "legacy";
	providers: {
		default: Provider;
		content: Provider;
		campaign: Provider;
		topic: Provider;
		brandScraper: Provider;
		chat: Provider;
	};
	workspaceValues: {
		aiProvider: string | null;
		aiContentProvider: string | null;
		aiCampaignProvider: string | null;
		aiTopicProvider: string | null;
		aiBrandScraperProvider: string | null;
		aiChatProvider: string | null;
		anthropicModel: string | null;
		geminiModel: string | null;
		geminiImageModel: string | null;
		openrouterModel: string | null;
		openrouterContentModel: string | null;
		openrouterCampaignModel: string | null;
		openrouterTopicModel: string | null;
		openrouterBrandScraperModel: string | null;
		openrouterChatModel: string | null;
		openrouterImageModel: string | null;
		openrouterVideoModel: string | null;
	};
	credentials: {
		anthropic: { configured: boolean; masked: string | null };
		gemini: { configured: boolean; masked: string | null };
		openrouter: { configured: boolean; masked: string | null };
	};
	source: Record<string, Source>;
	effectiveModels: {
		anthropic: string;
		gemini: string;
		geminiImage: string;
		openrouter: string;
		openrouterContent: string;
		openrouterCampaign: string;
		openrouterTopic: string;
		openrouterBrandScraper: string;
		openrouterChat: string;
		openrouterImage: string;
		openrouterVideo: string;
	};
}

const GENERATOR_ROWS: Array<{
	key: "aiContentProvider" | "aiCampaignProvider" | "aiTopicProvider" | "aiBrandScraperProvider" | "aiChatProvider";
	label: string;
}> = [
	{ key: "aiContentProvider", label: "Content Generator" },
	{ key: "aiCampaignProvider", label: "Campaign Generator" },
	{ key: "aiTopicProvider", label: "Topic Generator" },
	{ key: "aiBrandScraperProvider", label: "Brand / Product Scraper" },
	{ key: "aiChatProvider", label: "Campaign Chat" },
];

interface Props {
	workspaceId: string;
	showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function AiProvidersSection({ workspaceId, showToast }: Props) {
	const { aiMode, loading: modeLoading } = useSystemContext();

	const [settings, setSettings] = useState<AiSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState<Provider | null>(null);

	// Editable form state mirrors workspaceValues; empty string means "use env fallback".
	const [draft, setDraft] = useState<{
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
	}>({
		aiProvider: "",
		aiContentProvider: "",
		aiCampaignProvider: "",
		aiTopicProvider: "",
		aiBrandScraperProvider: "",
		aiChatProvider: "",
		anthropicApiKey: "",
		anthropicModel: "",
		geminiApiKey: "",
		geminiModel: "",
		geminiImageModel: "",
	});
	const [showAnthropicKey, setShowAnthropicKey] = useState(false);
	const [showGeminiKey, setShowGeminiKey] = useState(false);

	const [openrouterDraft, setOpenrouterDraft] = useState({
		openrouterApiKey: "",
		openrouterModel: "",
		openrouterContentModel: "",
		openrouterCampaignModel: "",
		openrouterTopicModel: "",
		openrouterBrandScraperModel: "",
		openrouterChatModel: "",
		openrouterImageModel: "",
		openrouterVideoModel: "",
	});
	const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
	const [openrouterTesting, setOpenrouterTesting] = useState(false);
	const [openrouterTestResult, setOpenrouterTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

	const load = async () => {
		setLoading(true);
		try {
			const data = await api<AiSettings>(`/api/workspaces/${workspaceId}/ai-settings`);
			setSettings(data);
			setDraft({
				aiProvider: data.workspaceValues.aiProvider ?? "",
				aiContentProvider: data.workspaceValues.aiContentProvider ?? "",
				aiCampaignProvider: data.workspaceValues.aiCampaignProvider ?? "",
				aiTopicProvider: data.workspaceValues.aiTopicProvider ?? "",
				aiBrandScraperProvider: data.workspaceValues.aiBrandScraperProvider ?? "",
				aiChatProvider: data.workspaceValues.aiChatProvider ?? "",
				anthropicApiKey: "",
				anthropicModel: data.workspaceValues.anthropicModel ?? "",
				geminiApiKey: "",
				geminiModel: data.workspaceValues.geminiModel ?? "",
				geminiImageModel: data.workspaceValues.geminiImageModel ?? "",
			});
			setOpenrouterDraft({
				openrouterApiKey: "",
				openrouterModel: data.workspaceValues.openrouterModel ?? "",
				openrouterContentModel: data.workspaceValues.openrouterContentModel ?? "",
				openrouterCampaignModel: data.workspaceValues.openrouterCampaignModel ?? "",
				openrouterTopicModel: data.workspaceValues.openrouterTopicModel ?? "",
				openrouterBrandScraperModel: data.workspaceValues.openrouterBrandScraperModel ?? "",
				openrouterChatModel: data.workspaceValues.openrouterChatModel ?? "",
				openrouterImageModel: data.workspaceValues.openrouterImageModel ?? "",
				openrouterVideoModel: data.workspaceValues.openrouterVideoModel ?? "",
			});
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Failed to load AI settings", "error");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, [workspaceId]);

	const saveLegacy = async () => {
		setSaving(true);
		try {
			const patch: Record<string, string | null> = {
				// Providers: empty string in the form means "inherit" → send null to clear.
				aiProvider: draft.aiProvider === "" ? null : draft.aiProvider,
				aiContentProvider: draft.aiContentProvider === "" ? null : draft.aiContentProvider,
				aiCampaignProvider: draft.aiCampaignProvider === "" ? null : draft.aiCampaignProvider,
				aiTopicProvider: draft.aiTopicProvider === "" ? null : draft.aiTopicProvider,
				aiBrandScraperProvider: draft.aiBrandScraperProvider === "" ? null : draft.aiBrandScraperProvider,
				aiChatProvider: draft.aiChatProvider === "" ? null : draft.aiChatProvider,
				anthropicModel: draft.anthropicModel === "" ? null : draft.anthropicModel,
				geminiModel: draft.geminiModel === "" ? null : draft.geminiModel,
				geminiImageModel: draft.geminiImageModel === "" ? null : draft.geminiImageModel,
			};
			// Only send keys if the user typed a new one — empty keeps the existing stored key.
			if (draft.anthropicApiKey.trim() !== "") patch.anthropicApiKey = draft.anthropicApiKey.trim();
			if (draft.geminiApiKey.trim() !== "") patch.geminiApiKey = draft.geminiApiKey.trim();

			await api(`/api/workspaces/${workspaceId}/ai-settings`, {
				method: "PUT",
				body: JSON.stringify(patch),
			});
			showToast("AI settings saved", "success");
			await load();
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Failed to save", "error");
		} finally {
			setSaving(false);
		}
	};

	const saveOpenRouter = async () => {
		setSaving(true);
		setOpenrouterTestResult(null);
		try {
			const patch: Record<string, string | null> = {};
			if (openrouterDraft.openrouterApiKey.trim() !== "") {
				patch.openrouterApiKey = openrouterDraft.openrouterApiKey.trim();
			}
			const modelKeys = [
				"openrouterModel",
				"openrouterContentModel",
				"openrouterCampaignModel",
				"openrouterTopicModel",
				"openrouterBrandScraperModel",
				"openrouterChatModel",
				"openrouterImageModel",
				"openrouterVideoModel",
			] as const;
			for (const k of modelKeys) {
				const v = openrouterDraft[k];
				patch[k] = v === "" ? null : v;
			}
			await api(`/api/workspaces/${workspaceId}/ai-settings`, {
				method: "PUT",
				body: JSON.stringify(patch),
			});
			showToast("AI settings saved", "success");
			await load();
			setShowOpenrouterKey(false);
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Failed to save", "error");
		} finally {
			setSaving(false);
		}
	};

	const testOpenRouter = async () => {
		setOpenrouterTesting(true);
		setOpenrouterTestResult(null);
		try {
			const apiKeyToTest = openrouterDraft.openrouterApiKey.trim();
			const modelToTest =
				openrouterDraft.openrouterModel ||
				(settings ? settings.effectiveModels.openrouter : "");
			if (!apiKeyToTest) {
				setOpenrouterTestResult({ ok: false, msg: "Enter an API key first" });
				return;
			}
			if (!modelToTest) {
				setOpenrouterTestResult({ ok: false, msg: "Set a default model first" });
				return;
			}
			const res = await api<{ connected: boolean; error?: string }>(
				`/api/workspaces/${workspaceId}/ai-settings/test-openrouter`,
				{
					method: "POST",
					body: JSON.stringify({ apiKey: apiKeyToTest, model: modelToTest }),
				},
			);
			setOpenrouterTestResult({
				ok: res.connected,
				msg: res.error ?? "",
			});
		} catch (e) {
			setOpenrouterTestResult({
				ok: false,
				msg: e instanceof Error ? e.message : "Test failed",
			});
		} finally {
			setOpenrouterTesting(false);
		}
	};

	const clearKey = async (provider: Provider) => {
		if (!confirm(`Remove the ${provider === "anthropic" ? "Anthropic" : "Gemini"} API key for this workspace? The env fallback will take over.`)) return;
		try {
			await api(`/api/workspaces/${workspaceId}/ai-settings`, {
				method: "PUT",
				body: JSON.stringify({
					[provider === "anthropic" ? "anthropicApiKey" : "geminiApiKey"]: null,
				}),
			});
			showToast("Key removed", "info");
			await load();
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Failed to remove", "error");
		}
	};

	const testProvider = async (provider: Provider) => {
		setTesting(provider);
		try {
			const result = await api<{ connected: boolean; error?: string }>(
				`/api/workspaces/${workspaceId}/ai-settings/test`,
				{ method: "POST", body: JSON.stringify({ provider }) },
			);
			if (result.connected) {
				showToast(`${provider === "anthropic" ? "Anthropic" : "Gemini"} connection OK`, "success");
			} else {
				showToast(result.error || "Connection failed", "error");
			}
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Connection failed", "error");
		} finally {
			setTesting(null);
		}
	};

	if (modeLoading || loading) {
		return (
			<div className="flex justify-center py-8">
				<Spinner />
			</div>
		);
	}

	if (aiMode === "openrouter") {
		return renderOpenRouterUI();
	}
	return renderLegacyUI();

	function renderOpenRouterUI() {
		if (!settings) return null;
		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-lg font-semibold text-black">AI Providers</h2>
					<p className="text-sm text-gray-500 mt-0.5">
						All generators are powered by OpenRouter. Pick the model for each generator below.
					</p>
				</div>

				<div className="border border-gray-200 rounded-lg p-5 bg-white space-y-5">
					<div className="flex items-center justify-between">
						<h3 className="text-base font-semibold text-black">OpenRouter</h3>
						{settings.credentials.openrouter.configured && (
							<span className="text-xs text-green-600">
								{settings.credentials.openrouter.masked}
							</span>
						)}
					</div>

					<div>
						<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
							API Key
						</label>
						<div className="flex gap-2">
							<input
								type={showOpenrouterKey ? "text" : "password"}
								value={openrouterDraft.openrouterApiKey}
								onChange={(e) =>
									setOpenrouterDraft((p) => ({ ...p, openrouterApiKey: e.target.value }))
								}
								placeholder={settings.credentials.openrouter.masked ?? "sk-or-v1-..."}
								className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
							/>
							<button
								type="button"
								onClick={() => setShowOpenrouterKey((v) => !v)}
								className="px-3 py-2 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
							>
								{showOpenrouterKey ? "Hide" : "Show"}
							</button>
						</div>
					</div>

					<div>
						<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
							Default model
						</label>
						<OpenRouterModelPicker
							value={openrouterDraft.openrouterModel}
							onChange={(v) => setOpenrouterDraft((p) => ({ ...p, openrouterModel: v }))}
							placeholder="anthropic/claude-sonnet-4.5"
						/>
						<p className="text-xs text-gray-500 mt-1">Used when a generator has no override.</p>
					</div>

					<div className="border-t pt-4 space-y-3">
						<h4 className="text-sm font-semibold text-gray-700">
							Per-generator overrides (optional)
						</h4>
						{[
							{ key: "openrouterContentModel" as const, label: "Content" },
							{ key: "openrouterCampaignModel" as const, label: "Campaign" },
							{ key: "openrouterTopicModel" as const, label: "Topic" },
							{ key: "openrouterBrandScraperModel" as const, label: "Brand Scraper" },
							{ key: "openrouterChatModel" as const, label: "Chat" },
						].map(({ key, label }) => (
							<div key={key} className="grid grid-cols-[140px_1fr] gap-3 items-center">
								<label className="text-sm text-gray-700">{label}</label>
								<OpenRouterModelPicker
									value={openrouterDraft[key]}
									onChange={(v) =>
										setOpenrouterDraft((p) => ({ ...p, [key]: v }))
									}
									placeholder={`(default: ${settings.effectiveModels.openrouter || "—"})`}
								/>
							</div>
						))}
					</div>

					<div className="border-t pt-4 space-y-3">
						<h4 className="text-sm font-semibold text-gray-700">Media</h4>
						<div className="grid grid-cols-[140px_1fr] gap-3 items-center">
							<label className="text-sm text-gray-700">Image model</label>
							<OpenRouterModelPicker
								value={openrouterDraft.openrouterImageModel}
								onChange={(v) =>
									setOpenrouterDraft((p) => ({ ...p, openrouterImageModel: v }))
								}
								placeholder="google/gemini-2.5-flash-image-preview"
								category="image"
							/>
						</div>
						<div className="grid grid-cols-[140px_1fr] gap-3 items-center">
							<label className="text-sm text-gray-700">Video model</label>
							<OpenRouterModelPicker
								value={openrouterDraft.openrouterVideoModel}
								onChange={(v) =>
									setOpenrouterDraft((p) => ({ ...p, openrouterVideoModel: v }))
								}
								placeholder="google/gemini-2.5-flash"
								category="video"
							/>
						</div>
						<p className="text-xs text-gray-500">
							Image model must be image-capable. Video model must accept video URL input.
						</p>
					</div>

					<div className="border-t pt-4 flex items-center justify-between">
						<div>
							{openrouterTestResult && (
								<span
									className={`text-xs px-2 py-0.5 rounded ${
										openrouterTestResult.ok
											? "bg-green-100 text-green-700"
											: "bg-red-100 text-red-700"
									}`}
								>
									{openrouterTestResult.ok
										? "Connected"
										: `Failed: ${openrouterTestResult.msg}`}
								</span>
							)}
						</div>
						<Button
							size="sm"
							variant="secondary"
							disabled={openrouterTesting}
							onClick={testOpenRouter}
						>
							{openrouterTesting ? "Testing…" : "Test connection"}
						</Button>
					</div>
				</div>

				<div className="flex justify-end">
					<Button onClick={saveOpenRouter} disabled={saving}>
						{saving ? "Saving…" : "Save AI settings"}
					</Button>
				</div>
			</div>
		);
	}

	function renderLegacyUI() {
		if (!settings) return null;

		const fallbackTag = (source: Source) =>
			source === "env" ? (
				<span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded">
					Env fallback
				</span>
			) : (
				<span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
					Workspace
				</span>
			);

		return (
			<div className="space-y-6">
				<div>
					<h2 className="text-sm font-semibold text-gray-900 mb-1">AI Providers</h2>
					<p className="text-xs text-gray-500">
						Configure which AI provider powers each generator for this workspace. Leave fields blank to inherit the system defaults from the server&apos;s environment.
					</p>
				</div>

				{/* Default + per-generator overrides */}
				<div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
					<div className="flex items-center gap-3">
						<label className="text-xs font-medium text-gray-700 w-44 shrink-0">Default provider</label>
						<select
							value={draft.aiProvider}
							onChange={(e) => setDraft({ ...draft, aiProvider: e.target.value })}
							className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
						>
							<option value="">— Inherit from system —</option>
							<option value="anthropic">Anthropic</option>
							<option value="gemini">Gemini</option>
						</select>
						{fallbackTag(settings.source.aiProvider)}
						<span className="text-[11px] text-gray-500">
							Currently using: <strong>{settings.providers.default}</strong>
						</span>
					</div>

					<div className="pt-2 border-t border-gray-200 space-y-2">
						<p className="text-[11px] font-medium text-gray-600 uppercase tracking-wide">
							Per-generator overrides
						</p>
						{GENERATOR_ROWS.map((row) => {
							const effective =
								row.key === "aiContentProvider"
									? settings.providers.content
									: row.key === "aiCampaignProvider"
									? settings.providers.campaign
									: row.key === "aiTopicProvider"
									? settings.providers.topic
									: row.key === "aiBrandScraperProvider"
									? settings.providers.brandScraper
									: settings.providers.chat;
							return (
								<div key={row.key} className="flex items-center gap-3">
									<label className="text-xs text-gray-700 w-44 shrink-0">{row.label}</label>
									<select
										value={draft[row.key]}
										onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
										className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
									>
										<option value="">— Use default —</option>
										<option value="anthropic">Anthropic</option>
										<option value="gemini">Gemini</option>
									</select>
									{fallbackTag(settings.source[row.key])}
									<span className="text-[11px] text-gray-500">
										Using: <strong>{effective}</strong>
									</span>
								</div>
							);
						})}
					</div>
				</div>

				{/* Anthropic section */}
				<div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-gray-900">Anthropic</h3>
						{settings.credentials.anthropic.configured && (
							<span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
								Key stored
							</span>
						)}
					</div>

					<div className="space-y-2">
						<label className="text-xs font-medium text-gray-700">API Key</label>
						{settings.credentials.anthropic.configured && draft.anthropicApiKey === "" ? (
							<div className="flex items-center gap-2">
								<span className="flex-1 px-3 py-2 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md">
									{settings.credentials.anthropic.masked}
								</span>
								<Button size="sm" variant="secondary" onClick={() => clearKey("anthropic")}>
									Remove
								</Button>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<div className="flex-1 relative">
									<input
										type={showAnthropicKey ? "text" : "password"}
										placeholder="sk-ant-..."
										value={draft.anthropicApiKey}
										onChange={(e) => setDraft({ ...draft, anthropicApiKey: e.target.value })}
										className="w-full px-3 py-2 text-xs font-mono bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
									/>
									<button
										type="button"
										onClick={() => setShowAnthropicKey(!showAnthropicKey)}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 hover:text-gray-600"
									>
										{showAnthropicKey ? "Hide" : "Show"}
									</button>
								</div>
							</div>
						)}
					</div>

					<div className="flex items-center gap-3">
						<label className="text-xs font-medium text-gray-700 w-16 shrink-0">Model</label>
						<input
							type="text"
							placeholder={settings.effectiveModels.anthropic}
							value={draft.anthropicModel}
							onChange={(e) => setDraft({ ...draft, anthropicModel: e.target.value })}
							className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
						/>
						{fallbackTag(settings.source.anthropicModel)}
					</div>

					<div className="flex justify-end">
						<Button
							size="sm"
							variant="secondary"
							onClick={() => testProvider("anthropic")}
							loading={testing === "anthropic"}
						>
							Test connection
						</Button>
					</div>
				</div>

				{/* Gemini section */}
				<div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-gray-900">Gemini</h3>
						{settings.credentials.gemini.configured && (
							<span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
								Key stored
							</span>
						)}
					</div>

					<div className="space-y-2">
						<label className="text-xs font-medium text-gray-700">API Key</label>
						{settings.credentials.gemini.configured && draft.geminiApiKey === "" ? (
							<div className="flex items-center gap-2">
								<span className="flex-1 px-3 py-2 text-xs font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded-md">
									{settings.credentials.gemini.masked}
								</span>
								<Button size="sm" variant="secondary" onClick={() => clearKey("gemini")}>
									Remove
								</Button>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<div className="flex-1 relative">
									<input
										type={showGeminiKey ? "text" : "password"}
										placeholder="AIza..."
										value={draft.geminiApiKey}
										onChange={(e) => setDraft({ ...draft, geminiApiKey: e.target.value })}
										className="w-full px-3 py-2 text-xs font-mono bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
									/>
									<button
										type="button"
										onClick={() => setShowGeminiKey(!showGeminiKey)}
										className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 hover:text-gray-600"
									>
										{showGeminiKey ? "Hide" : "Show"}
									</button>
								</div>
							</div>
						)}
					</div>

					<div className="flex items-center gap-3">
						<label className="text-xs font-medium text-gray-700 w-28 shrink-0">Text model</label>
						<input
							type="text"
							placeholder={settings.effectiveModels.gemini}
							value={draft.geminiModel}
							onChange={(e) => setDraft({ ...draft, geminiModel: e.target.value })}
							className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
						/>
						{fallbackTag(settings.source.geminiModel)}
					</div>

					<div className="flex items-center gap-3">
						<label className="text-xs font-medium text-gray-700 w-28 shrink-0">Image model</label>
						<input
							type="text"
							placeholder={settings.effectiveModels.geminiImage}
							value={draft.geminiImageModel}
							onChange={(e) => setDraft({ ...draft, geminiImageModel: e.target.value })}
							className="flex-1 px-3 py-1.5 text-xs font-mono bg-white border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
						/>
						{fallbackTag(settings.source.geminiImageModel)}
					</div>

					<div className="flex justify-end">
						<Button
							size="sm"
							variant="secondary"
							onClick={() => testProvider("gemini")}
							loading={testing === "gemini"}
						>
							Test connection
						</Button>
					</div>
				</div>

				<div className="flex justify-end">
					<Button onClick={saveLegacy} loading={saving}>
						Save AI settings
					</Button>
				</div>
			</div>
		);
	}
}
