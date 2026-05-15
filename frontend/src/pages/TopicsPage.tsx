import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { useSSE } from "../hooks/useSSE";
import { useUnsavedAsync } from "../hooks/useUnsavedAsync";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { CoachMark } from "../components/onboarding/CoachMark";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { ReferenceImageUpload, type ImageRef } from "../components/ui/ReferenceImageUpload";
import { UrlInspirationChips } from "../components/url-inspiration/UrlInspirationChips";
import { SkillsAppliedStrip } from "../components/skills/SkillsAppliedStrip";
import { ScrapeLanguageToggle } from "../components/ui/ScrapeLanguageToggle";
import { Check, Zap } from "lucide-react";
import type { ScrapeLanguage } from "../types";

interface Brand {
	id: string;
	name: string;
	language?: string;
}

interface Product {
	id: string;
	name: string;
	brandId: string;
}

interface BrainVersion {
	id: string;
	isActive: boolean;
	vocabulary?: {
		contentPillars?: string[];
	};
}

interface GeneratedTopic {
	id: string;
	title: string;
	description?: string;
	pillar?: string;
	platform?: string;
	format?: string;
	objective?: string;
	publishDate?: string;
	status: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

const PLATFORMS = [
	{ value: "instagram", label: "Instagram" },
	{ value: "tiktok", label: "TikTok" },
	{ value: "youtube", label: "YouTube" },
	{ value: "twitter", label: "Twitter/X" },
	{ value: "linkedin", label: "LinkedIn" },
	{ value: "facebook", label: "Facebook" },
];

const OBJECTIVES = [
	{ value: "awareness", label: "Awareness" },
	{ value: "engagement", label: "Engagement" },
	{ value: "education", label: "Education" },
	{ value: "conversion", label: "Conversion" },
	{ value: "retention", label: "Retention" },
];

const PLATFORM_FORMATS: Record<string, { value: string; label: string; icon: string; badge?: string }[]> = {
	instagram: [
		{ value: "single_image", label: "Single Image", icon: "🖼️" },
		{ value: "carousel", label: "Carousel", icon: "🎠", badge: "SLIDES" },
		{ value: "reels", label: "Reels", icon: "🎬", badge: "VIDEO" },
		{ value: "story_image", label: "Story – Image", icon: "📱" },
		{ value: "story_video", label: "Story – Video", icon: "📹", badge: "VIDEO" },
	],
	tiktok: [
		{ value: "tiktok_video", label: "TikTok Video", icon: "🎵", badge: "VIDEO" },
		{ value: "tiktok_carousel", label: "TikTok Carousel", icon: "🎠", badge: "SLIDES" },
	],
	youtube: [
		{ value: "long_video", label: "Long Video", icon: "📺", badge: "VIDEO" },
		{ value: "youtube_shorts", label: "YouTube Shorts", icon: "⚡", badge: "VIDEO" },
	],
	twitter: [
		{ value: "single_tweet", label: "Single Tweet", icon: "💬" },
		{ value: "thread", label: "Thread", icon: "📝", badge: "SLIDES" },
		{ value: "video_tweet", label: "Video Tweet", icon: "🎬", badge: "VIDEO" },
	],
	linkedin: [
		{ value: "single_post", label: "Single Post", icon: "💼" },
		{ value: "carousel_post", label: "Carousel Post", icon: "🎠", badge: "SLIDES" },
		{ value: "linkedin_video", label: "LinkedIn Video", icon: "🎬", badge: "VIDEO" },
		{ value: "article", label: "Article", icon: "📝" },
	],
	facebook: [
		{ value: "feed_post", label: "Feed Post", icon: "📰" },
		{ value: "carousel_ad", label: "Carousel Ad", icon: "🎠", badge: "SLIDES" },
		{ value: "reel_short_video", label: "Reel / Short Video", icon: "🎬", badge: "VIDEO" },
		{ value: "story", label: "Story", icon: "📱" },
	],
};

const PILLAR_COLORS = [
	"bg-emerald-50 text-emerald-700 border-emerald-200",
	"bg-violet-50 text-violet-700 border-violet-200",
	"bg-amber-50 text-amber-700 border-amber-200",
	"bg-teal-50 text-teal-700 border-teal-200",
	"bg-rose-50 text-rose-700 border-rose-200",
	"bg-blue-50 text-blue-700 border-blue-200",
	"bg-orange-50 text-orange-700 border-orange-200",
];


interface TopicsPageProps {
	initialDate?: string | null;
	initialBrandId?: string | null;
	onSavedTopics?: () => void;
	embedded?: boolean;
	/** Called with the Save All Topics button node (or null) for the host to render in a header slot. */
	onHeaderContent?: (node: ReactNode | null) => void;
}

export function TopicsPage({
	initialDate,
	initialBrandId,
	onSavedTopics,
	embedded = false,
	onHeaderContent,
}: TopicsPageProps = {}) {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const [brands, setBrands] = useState<Brand[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [pendingRunId, setPendingRunId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<ToastState>(null);
	const [contentPillars, setContentPillars] = useState<string[]>([]);

	useUnsavedAsync(
		generating,
		"AI is generating topics — leave anyway? You can come back, but you'll lose the option to cancel.",
	);

	// Form state
	const [brandId, setBrandId] = useState("");
	const [language, setLanguage] = useState<ScrapeLanguage>("indonesian");
	const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
	const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
	const [topicPrompt, setTopicPrompt] = useState("");
	const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
	const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
	const [platform, setPlatform] = useState("instagram");
	const [objective, setObjective] = useState("");
	const [dateFrom, setDateFrom] = useState(() => {
		const d = new Date();
		return d.toISOString().split("T")[0];
	});
	const [dateTo, setDateTo] = useState(() => {
		const d = new Date();
		d.setMonth(d.getMonth() + 2);
		return d.toISOString().split("T")[0];
	});
	const [count, setCount] = useState(3);

	// Generated topics (preview before save)
	const [generatedTopics, setGeneratedTopics] = useState<GeneratedTopic[]>([]);
	const [topicsSaved, setTopicsSaved] = useState(false);
	const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(null);
	const regeneratingTopicIdRef = useRef<string | null>(null);
	const [regenHints, setRegenHints] = useState<Record<string, string>>({});
	const [showRegenInput, setShowRegenInput] = useState<string | null>(null);

	const showToast = (message: string, type: "success" | "error" | "info") => {
		setToast({ message, type });
	};

	const loadData = useCallback(async () => {
		if (!activeWorkspace) {
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const qs = activeProject ? `?projectId=${activeProject.id}` : "";
			const [b, p] = await Promise.all([
				api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands${qs}`),
				api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products${qs}`),
			]);
			setBrands(b);
			setProducts(p);
		} catch (e) {
			showToast(
				e instanceof Error ? e.message : "Failed to load data",
				"error"
			);
		} finally {
			setLoading(false);
		}
	}, [activeWorkspace, activeProject]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useEffect(() => {
		if (initialDate) {
			setDateFrom(initialDate);
			setDateTo(initialDate);
		}
	}, [initialDate]);

	useEffect(() => {
		if (initialBrandId) {
			setBrandId(initialBrandId);
		}
	}, [initialBrandId]);

	useEffect(() => {
		if (brands.length === 1 && brandId !== brands[0].id) {
			setBrandId(brands[0].id);
		}
	}, [brands, brandId]);

	useEffect(() => {
		const brand = brands.find((b) => b.id === brandId);
		const lang = brand?.language as ScrapeLanguage | undefined;
		if (lang) setLanguage(lang);
	}, [brandId, brands]);

	useEffect(() => {
		if (!activeWorkspace || !brandId) {
			setContentPillars([]);
			setSelectedPillars([]);
			return;
		}

		(async () => {
			setSelectedPillars([]);
			try {
				const res = await api<{
					data: {
						id: string;
						brainVersions: BrainVersion[];
					};
				}>(
					`/api/workspaces/${activeWorkspace.id}/brands/${brandId}`
				);
				const brand = (res as any).data ?? res;
				const activeBrain = brand.brainVersions?.find(
					(v: BrainVersion) => v.isActive
				);
				setContentPillars(
					activeBrain?.vocabulary?.contentPillars ?? []
				);
			} catch {
				setContentPillars([]);
				setSelectedPillars([]);
			}
		})();
	}, [activeWorkspace, brandId]);

	useSSE((event) => {
		if (
			event.type === "topic_generation_complete" ||
			event.type === "topics_generated"
		) {
			setGenerating(false);
			setPendingRunId(null);
			if (activeWorkspace) {
				api<{ data: GeneratedTopic[] }>(
					`/api/workspaces/${activeWorkspace.id}/topics`
				).then((res) => {
					const topics = Array.isArray(res) ? res : res.data;
					const recent = topics
						.filter((t: GeneratedTopic) => t.status === "draft")
						.slice(0, count);
					setGeneratedTopics(recent);
					setTopicsSaved(false);
					showToast("Topics generated successfully!", "success");
				});
			}
		}
		if (event.type === "topic_generation_failed") {
			setGenerating(false);
			setPendingRunId(null);
			showToast("Topic generation failed. Please try again.", "error");
		}
		if (event.type === "topic_preview_regenerated") {
			const { topic: newTopic } = event.data as any;
			const targetId = regeneratingTopicIdRef.current;
			setGeneratedTopics((prev) => {
				if (!targetId) return prev;
				return prev.map((t) =>
					t.id === targetId ? { ...t, ...newTopic, id: t.id } : t
				);
			});
			setRegeneratingTopicId(null);
			regeneratingTopicIdRef.current = null;
			showToast("Topic regenerated!", "success");
		}
		if (event.type === "topic_preview_regeneration_failed") {
			setRegeneratingTopicId(null);
			regeneratingTopicIdRef.current = null;
			showToast("Topic regeneration failed", "error");
		}
	});

	const handleGenerate = async () => {
		if (!brandId) {
			showToast("Please select a brand", "error");
			return;
		}
		setGenerating(true);
		setGeneratedTopics([]);
		setTopicsSaved(false);
		try {
			const response = await api<{ runId: string; jobId: string }>(
				`/api/workspaces/${activeWorkspace!.id}/topics/generate`,
				{
					method: "POST",
					body: JSON.stringify({
						brandId,
						productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
						formats: selectedFormats.length > 0 ? selectedFormats : undefined,
						platform: platform || undefined,
						objective: objective || undefined,
						pillars: selectedPillars.length > 0 ? selectedPillars : undefined,
						dateFrom,
						dateTo,
						count,
						prompt: topicPrompt.trim() || undefined,
						referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
							? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
							: undefined,
						language,
					}),
				}
			);
			setPendingRunId(response?.runId ?? null);
			showToast("Generating topics...", "info");
		} catch (e) {
			showToast(
				e instanceof Error ? e.message : "Failed to start generation",
				"error"
			);
			setGenerating(false);
			setPendingRunId(null);
		}
	};

	const handleDeleteTopic = (topicId: string) => {
		setGeneratedTopics((prev) => prev.filter((t) => t.id !== topicId));
	};

	const handleTopicFieldChange = (topicId: string, field: keyof GeneratedTopic, value: string) => {
		setGeneratedTopics((prev) =>
			prev.map((t) => (t.id === topicId ? { ...t, [field]: value } : t))
		);
	};

	const handleRegenerateSingle = async (topicId: string) => {
		if (!activeWorkspace) return;
		setRegeneratingTopicId(topicId);
		regeneratingTopicIdRef.current = topicId;
		setShowRegenInput(null);
		try {
			const topic = generatedTopics.find((t) => t.id === topicId);
			await api(
				`/api/workspaces/${activeWorkspace.id}/topics/regenerate-preview`,
				{
					method: "POST",
					body: JSON.stringify({
						brandId,
						productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
						platform: topic?.platform || platform || undefined,
						format: topic?.format || undefined,
						objective: topic?.objective || objective || undefined,
						pillar: topic?.pillar || selectedPillars[0] || undefined,
						hint: regenHints[topicId] || undefined,
					}),
				}
			);
			setRegenHints((prev) => ({ ...prev, [topicId]: "" }));
		} catch (e) {
			showToast(e instanceof Error ? e.message : "Regeneration failed", "error");
			setRegeneratingTopicId(null);
			regeneratingTopicIdRef.current = null;
		}
	};

	const handleSaveAll = useCallback(async () => {
		setSaving(true);
		try {
			showToast("All topics saved to library!", "success");
			setTopicsSaved(true);
			onSavedTopics?.();
		} finally {
			setSaving(false);
		}
	}, [onSavedTopics]);

	// Sync header slot for embedded mode (slider header)
	useEffect(() => {
		if (!onHeaderContent) return;
		const show = generatedTopics.length > 0 && !topicsSaved;
		if (!show) {
			onHeaderContent(null);
			return;
		}
		onHeaderContent(
			<button
				type="button"
				disabled={saving}
				onClick={handleSaveAll}
				className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-accent-foreground rounded-full hover:opacity-80 transition-opacity disabled:opacity-50"
			>
				<Check size={13} />
				Save All Topics
			</button>
		);
	}, [onHeaderContent, generatedTopics.length, topicsSaved, saving, handleSaveAll]);

	if (!activeWorkspace) {
		return (
			<div className="p-6">
				<p className="text-sm text-muted">
					Create a workspace first to generate topics.
				</p>
			</div>
		);
	}

	const brandOptions = [
		{ value: "", label: "Select a brand" },
		...brands.map((b) => ({ value: b.id, label: b.name })),
	];
	const filteredProducts = products.filter(
		(p) => !brandId || p.brandId === brandId
	);

	const showSaveAllButton = generatedTopics.length > 0 && !topicsSaved;
	const saveAllTopicsButton = (
		<Button onClick={handleSaveAll} loading={saving}>
			<Check size={14} className="mr-1.5" />
			Save All Topics
		</Button>
	);

	return (
		<div className={embedded ? "flex flex-1 min-h-0" : "p-6 space-y-6"}>
			{!embedded && (
				<>
					{showSaveAllButton && (
						<div className="flex justify-end">{saveAllTopicsButton}</div>
					)}
					<CoachMark pageKey="topics" title="Topics" body="Topics are content ideas you can save, refine, and turn into posts later. Useful for capturing ideas you're not ready to generate yet." />
				</>
			)}

			{loading ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : (
				<div className={embedded ? "flex flex-1 min-h-0" : "flex"}>
					{/* Left Panel — Form */}
					<div className={`w-1/2 shrink-0 border-r border-border ${embedded ? "overflow-y-auto px-6 pb-6" : "pr-6"}`}>
						{/* Context Section */}
						<div className="space-y-4 py-5">
							<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
								<svg
									className="w-4 h-4 text-muted"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
								Context
							</div>

							{brands.length === 1 ? (
								<div>
									<label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1.5">
										Brand
									</label>
									<div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-secondary border border-border text-xs">
										<span className="w-5 h-5 rounded-md bg-accent/10 text-accent flex items-center justify-center text-[10px] font-bold">
											{brands[0].name.charAt(0).toUpperCase()}
										</span>
										<span className="text-foreground">{brands[0].name}</span>
									</div>
								</div>
							) : (
								<Select
									label="Brand *"
									options={brandOptions}
									value={brandId}
									onChange={(e) => {
										setBrandId(e.target.value);
										setSelectedProductIds([]);
									}}
								/>
							)}

							{brandId && (
								<div className="flex items-center gap-2">
									<span className="text-xs font-medium text-muted uppercase tracking-wider">
										Language
									</span>
									<ScrapeLanguageToggle
										value={language}
										onChange={setLanguage}
										disabled={generating}
									/>
								</div>
							)}

							{brandId && filteredProducts.length > 0 && (
								<div>
									<label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">
										Products
									</label>
									<p className="text-[11px] text-muted/60 mb-2">
										Select one or more products for cross-product topics
									</p>
									<div className="flex flex-wrap gap-2">
										{filteredProducts.map((p) => (
											<button
												key={p.id}
												type="button"
												onClick={() =>
													setSelectedProductIds((prev) =>
														prev.includes(p.id)
															? prev.filter((id) => id !== p.id)
															: [...prev, p.id]
													)
												}
												className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-all ${
													selectedProductIds.includes(p.id)
														? "bg-accent text-accent-foreground border-accent shadow-sm"
														: "bg-surface text-foreground border-border hover:bg-surface-secondary"
												}`}
											>
												<svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
													{selectedProductIds.includes(p.id) ? (
														<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
													) : (
														<path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
													)}
												</svg>
												{p.name}
											</button>
										))}
									</div>
									{selectedProductIds.length > 0 && (
										<p className="text-[11px] text-accent mt-1.5">
											{selectedProductIds.length} product{selectedProductIds.length > 1 ? "s" : ""} selected
										</p>
									)}
								</div>
							)}

							{brandId && contentPillars.length > 0 && (
								<div className="pt-3 border-t border-border">
									<div className="flex items-center justify-between mb-2">
										<label className="block text-[10px] font-medium text-muted uppercase tracking-wide">
											Brand Content Pillars
										</label>
										<span className="text-[10px] text-muted">
											{selectedPillars.length === 0
												? "Mixed (all pillars)"
												: `Selected: ${selectedPillars.join(", ")}`}
										</span>
									</div>
									<div className="flex flex-wrap gap-1.5">
										{contentPillars.map((p, i) => {
											const isSelected = selectedPillars.includes(p);
											return (
												<button
													key={p}
													type="button"
													onClick={() =>
														setSelectedPillars((prev) =>
															prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
														)
													}
													className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
														isSelected
															? "bg-accent text-accent-foreground border-accent shadow-sm"
															: `${PILLAR_COLORS[i % PILLAR_COLORS.length]} border-transparent hover:border-border`
													}`}
												>
													{p}
												</button>
											);
										})}
									</div>
									<p className="text-[10px] text-muted/60 mt-1.5">
										Pick one or more pillars, or leave blank to mix across all.
									</p>
								</div>
							)}
						</div>

						<div className="border-t border-border" />

						{/* Platform & Objective Section */}
						<div className="space-y-4 py-5">
							<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
								<svg
									className="w-4 h-4 text-muted"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M4 6h16M4 12h16M4 18h16"
									/>
								</svg>
								Platform & Objective
							</div>

							{/* Platform chips */}
							<div>
								<label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">
									Platform
								</label>
								<div className="flex flex-wrap gap-2">
									{PLATFORMS.map((p) => (
										<button
											key={p.value}
											type="button"
											onClick={() => {
												setPlatform(
													platform === p.value
														? ""
														: p.value
												);
												setSelectedFormats([]);
											}}
											className={`px-3.5 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${
												platform === p.value
													? "bg-accent text-accent-foreground border-accent"
													: "bg-surface text-foreground border-border hover:bg-surface-secondary"
											}`}
										>
											{p.label}
										</button>
									))}
								</div>
							</div>

							{/* Objective */}
							<div>
								<label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">
									Objective
								</label>
								<div className="flex flex-wrap gap-2">
									{OBJECTIVES.map((o) => (
										<button
											key={o.value}
											type="button"
											onClick={() =>
												setObjective(
													objective === o.value
														? ""
														: o.value
												)
											}
											className={`px-3.5 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${
												objective === o.value
													? "bg-accent text-accent-foreground border-accent"
													: "bg-surface text-foreground border-border hover:bg-surface-secondary"
											}`}
										>
											{o.label}
										</button>
									))}
								</div>
							</div>

							{/* Content Formats */}
							{platform && PLATFORM_FORMATS[platform] && (
								<div className="pt-3 border-t border-border">
									<label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
										Content Formats
									</label>
									<p className="text-[11px] text-muted/60 mb-2">
										Select which formats the AI can assign to topics
									</p>
									<div className="flex flex-wrap gap-2">
										{PLATFORM_FORMATS[platform].map((f) => (
											<button
												key={f.value}
												type="button"
												onClick={() =>
													setSelectedFormats((prev) =>
														prev.includes(f.value)
															? prev.filter((v) => v !== f.value)
															: [...prev, f.value]
													)
												}
												className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium border transition-all ${
													selectedFormats.includes(f.value)
														? "bg-accent text-accent-foreground border-accent shadow-sm"
														: "bg-surface text-foreground border-border hover:bg-surface-secondary"
												}`}
											>
												<span>{f.icon}</span>
												{f.label}
												{f.badge && (
													<span className={`text-[9px] ${selectedFormats.includes(f.value) ? "opacity-70" : "text-muted"}`}>{f.badge}</span>
												)}
											</button>
										))}
									</div>
									{selectedFormats.length > 0 && (
										<p className="text-[11px] text-accent mt-1.5">
											{selectedFormats.length} format{selectedFormats.length > 1 ? "s" : ""} selected
										</p>
									)}
								</div>
							)}
						</div>

						<div className="border-t border-border" />

						{/* Schedule Section */}
						<div className="space-y-4 py-5">
							<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
								<svg
									className="w-4 h-4 text-muted"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
									/>
								</svg>
								Schedule
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-xs font-medium text-muted mb-1.5">
										From
									</label>
									<input
										type="date"
										className="w-full px-3 py-2 text-[10px] bg-field-background text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
										value={dateFrom}
										onChange={(e) =>
											setDateFrom(e.target.value)
										}
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-muted mb-1.5">
										To
									</label>
									<input
										type="date"
										className="w-full px-3 py-2 text-[10px] bg-field-background text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
										value={dateTo}
										onChange={(e) =>
											setDateTo(e.target.value)
										}
									/>
								</div>
							</div>

							{/* Topic count slider */}
							<div>
								<label className="block text-xs font-medium text-muted mb-1.5">
									Number of topics:{" "}
									<span className="font-bold text-foreground">
										{count}
									</span>
								</label>
								<input
									type="range"
									min={1}
									max={30}
									step={1}
									value={count}
									onChange={(e) =>
										setCount(parseInt(e.target.value))
									}
									className="w-full accent-accent"
								/>
								<div className="flex justify-between text-xs text-muted mt-1">
									<span>1</span>
									<span>15</span>
									<span>30</span>
								</div>
							</div>
						</div>

						<div className="border-t border-border" />

						{/* Additional Direction Section */}
						<div className="space-y-4 py-5">
							<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
								<svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
								</svg>
								Additional Direction
							</div>

							<div>
								<textarea
									className="w-full px-3 py-2.5 text-xs bg-field-background text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y min-h-[140px] leading-relaxed placeholder:text-muted"
									rows={6}
									placeholder="Add any specific instructions, direction, or context...&#10;&#10;Tip: Paste URLs here — they'll be scraped and used as reference material."
									value={topicPrompt}
									onChange={(e) => setTopicPrompt(e.target.value)}
								/>
								<p className="text-[10px] text-muted/60 mt-1.5">
									You can paste URLs — the system will scrape the pages and include the extracted text as AI context.
								</p>
								{activeWorkspace && (
									<UrlInspirationChips
										workspaceId={activeWorkspace.id}
										prompt={topicPrompt}
									/>
								)}
							</div>

							<div>
								<label className="block text-xs font-medium text-muted uppercase tracking-wide mb-2">
									Reference Images (optional)
								</label>
								<ReferenceImageUpload
									workspaceId={activeWorkspace!.id}
									images={referenceImages}
									onChange={setReferenceImages}
								/>
							</div>
						</div>

						<div className="border-t border-border" />
						<SkillsAppliedStrip generator="topic" className="pt-4 mb-3 px-1" />

						{/* Generate Button */}
						<Button
							onClick={handleGenerate}
							loading={generating}
							className="w-full"
						>
							<Zap size={14} className="mr-1.5" />
							Generate {count} Topics
						</Button>
						{generating && pendingRunId && (
							<Button
								variant="secondary"
								size="sm"
								onClick={async () => {
									try {
										await api(
											`/api/workspaces/${activeWorkspace!.id}/topics/runs/${pendingRunId}/cancel`,
											{ method: "POST" },
										);
										setGenerating(false);
										setPendingRunId(null);
									} catch (e) {
										showToast(
											e instanceof Error ? e.message : "Could not cancel",
											"info",
										);
										setGenerating(false);
										setPendingRunId(null);
									}
								}}
								title="Cancel stops the next step. The current AI call will finish and may incur usage cost."
								className="w-full mt-2"
							>
								Cancel
							</Button>
						)}
					</div>

					{/* Right Panel — Results */}
					<div className={`w-1/2 min-w-0 ${embedded ? "overflow-y-auto p-6 bg-surface-secondary" : "pl-6"}`}>
						{generating ? (
							<div className="flex flex-col items-center justify-center h-80 bg-surface border border-border rounded-xl px-6">
								<Spinner />
								<p className="text-sm text-muted mt-4">
									Generating topics...
								</p>
							</div>
						) : generatedTopics.length > 0 ? (
							<div className="space-y-4">
								{/* Results header */}
								<div className="flex items-center justify-between">
									<p className="text-sm text-muted">
										{generatedTopics.length} topics for{" "}
										{brands.find((b) => b.id === brandId)
											?.name ?? ""}
										{platform
											? ` · ${PLATFORMS.find((p) => p.value === platform)?.label}`
											: ""}
										{selectedProductIds.length > 0
											? ` · ${selectedProductIds.length} product${selectedProductIds.length > 1 ? "s" : ""}`
											: ""}
									</p>
								</div>

								{/* Topic cards grid */}
								<div className="grid grid-cols-1 gap-4">
									{generatedTopics.map((topic) => (
										<div
											key={topic.id}
											className={`bg-surface border border-border rounded-xl p-4 space-y-3 relative transition-shadow hover:shadow-md ${
												regeneratingTopicId === topic.id ? "opacity-50 pointer-events-none" : ""
											}`}
										>
											{regeneratingTopicId === topic.id && (
												<div className="absolute inset-0 flex items-center justify-center z-10">
													<Spinner />
												</div>
											)}

											{topicsSaved && (
												<div className="flex justify-start">
													<a
														href={(() => {
															const params = new URLSearchParams();
															if (brandId) params.set("brandId", brandId);
															for (const pid of selectedProductIds) params.append("productId", pid);
															params.set("topicId", topic.id);
															if (topic.platform ?? platform) params.set("platform", topic.platform ?? platform);
															if (topic.format) params.set("format", topic.format);
															if (topic.objective ?? objective) params.set("objective", topic.objective ?? objective);
															return `/generate?${params.toString()}`;
														})()}
														target="_blank"
														rel="noopener noreferrer"
														className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-full hover:opacity-80 transition-opacity"
													>
														<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
															<path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
														</svg>
														Generate Content
													</a>
												</div>
											)}

											<textarea
												value={topic.title}
												onChange={(e) => handleTopicFieldChange(topic.id, "title", e.target.value)}
												rows={2}
												className="w-full text-xs font-semibold text-foreground bg-transparent border-0 border-b border-transparent hover:border-border focus:border-accent focus:outline-none transition-colors resize-none !rounded-none"
											/>

											<textarea
												value={topic.description ?? ""}
												onChange={(e) => handleTopicFieldChange(topic.id, "description", e.target.value)}
												placeholder="Add a description..."
												rows={5}
												className="w-full text-xs text-foreground leading-relaxed bg-transparent border-0 border-b border-transparent hover:border-border focus:border-accent focus:outline-none resize-y transition-colors placeholder:text-muted !rounded-none"
											/>

											<div className="grid grid-cols-2 gap-2">
												<div>
													<label className="block text-[10px] text-muted mb-0.5">Pillar</label>
													{contentPillars.length > 0 ? (
														<select
															value={topic.pillar ?? ""}
															onChange={(e) => handleTopicFieldChange(topic.id, "pillar", e.target.value)}
															className="w-full text-xs px-2 py-1 bg-surface-secondary text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent"
														>
															<option value="">None</option>
															{contentPillars.map((p) => (
																<option key={p} value={p}>{p}</option>
															))}
														</select>
													) : (
														<input
															type="text"
															value={topic.pillar ?? ""}
															onChange={(e) => handleTopicFieldChange(topic.id, "pillar", e.target.value)}
															placeholder="Pillar"
															className="w-full text-xs px-2 py-1 bg-surface-secondary text-foreground border border-border rounded-full focus:outline-none focus:border-accent placeholder:text-muted"
														/>
													)}
												</div>

												<div>
													<label className="block text-[10px] text-muted mb-0.5">Format</label>
													<select
														value={topic.format ?? ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "format", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-surface-secondary text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent"
													>
														<option value="">None</option>
														{(PLATFORM_FORMATS[topic.platform ?? platform] ?? []).map((f) => (
															<option key={f.value} value={f.value}>{f.icon} {f.label}</option>
														))}
													</select>
												</div>

												<div>
													<label className="block text-[10px] text-muted mb-0.5">Platform</label>
													<select
														value={topic.platform ?? ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "platform", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-surface-secondary text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent"
													>
														<option value="">None</option>
														{PLATFORMS.map((p) => (
															<option key={p.value} value={p.value}>{p.label}</option>
														))}
													</select>
												</div>

												<div>
													<label className="block text-[10px] text-muted mb-0.5">Objective</label>
													<select
														value={topic.objective ?? ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "objective", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-surface-secondary text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent"
													>
														<option value="">None</option>
														{OBJECTIVES.map((o) => (
															<option key={o.value} value={o.value}>{o.label}</option>
														))}
													</select>
												</div>

											</div>

											{/* Bottom bar: Publish Date + action icons */}
											<div className="flex items-end gap-2">
												<div className="flex-1">
													<label className="block text-[10px] text-muted mb-0.5">Publish Date</label>
													<input
														type="date"
														value={topic.publishDate ? topic.publishDate.split("T")[0] : ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "publishDate", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-surface-secondary text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent"
													/>
												</div>
												<div className="flex items-center gap-0.5 pb-0.5">
													<button
														type="button"
														onClick={() => setShowRegenInput(showRegenInput === topic.id ? null : topic.id)}
														className="p-1.5 text-muted/40 hover:text-accent transition-colors rounded-full hover:bg-surface-secondary"
														title="Regenerate this topic"
													>
														<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
															<path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
														</svg>
													</button>
													<button
														type="button"
														onClick={() => handleDeleteTopic(topic.id)}
														className="p-1.5 text-muted/40 hover:text-danger transition-colors rounded-full hover:bg-surface-secondary"
													>
														<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
															<path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
														</svg>
													</button>
												</div>
											</div>

											{showRegenInput === topic.id && (
												<div className="flex gap-2">
													<input
														type="text"
														placeholder="Optional hint (e.g., 'make it more educational')"
														className="flex-1 px-3 py-1.5 text-xs bg-surface-secondary text-foreground border border-border rounded-full focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent placeholder:text-muted"
														value={regenHints[topic.id] ?? ""}
														onChange={(e) => setRegenHints((prev) => ({ ...prev, [topic.id]: e.target.value }))}
														onKeyDown={(e) => { if (e.key === "Enter") handleRegenerateSingle(topic.id); }}
													/>
													<button
														type="button"
														onClick={() => handleRegenerateSingle(topic.id)}
														className="px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground rounded-full hover:opacity-80 transition-opacity"
													>
														Go
													</button>
												</div>
											)}
										</div>
									))}
								</div>

							</div>
						) : (
							/* Empty state */
							<div className="flex flex-col items-center justify-center h-80 bg-surface border border-border rounded-xl px-6">
								<svg
									className="w-12 h-12 text-muted/30 mb-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={1.5}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
									/>
								</svg>
								<p className="text-base font-semibold text-foreground">
									No topics yet
								</p>
								<p className="text-sm text-muted mt-1 text-center max-w-xs">
									Select a brand and platform, set your date
									range, then click Generate to build your
									content calendar.
								</p>
							</div>
						)}
					</div>
				</div>
			)}

			{toast && (
				<Toast
					message={toast.message}
					type={toast.type}
					onClose={() => setToast(null)}
				/>
			)}
		</div>
	);
}
