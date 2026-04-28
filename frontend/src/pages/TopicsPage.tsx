import { useState, useEffect, useCallback, useRef } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { ReferenceImageUpload, type ImageRef } from "../components/ui/ReferenceImageUpload";
import { UrlInspirationChips } from "../components/url-inspiration/UrlInspirationChips";

interface Brand {
	id: string;
	name: string;
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


export function TopicsPage() {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const [brands, setBrands] = useState<Brand[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<ToastState>(null);
	const [contentPillars, setContentPillars] = useState<string[]>([]);

	// Form state
	const [brandId, setBrandId] = useState("");
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
	const [count, setCount] = useState(10);

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

	// 1:1 project:brand — auto-select the only brand once it's loaded so the
	// user doesn't have to. If the project somehow has multiple (legacy data),
	// fall through to the selector by leaving brandId empty.
	useEffect(() => {
		if (brands.length === 1 && brandId !== brands[0].id) {
			setBrandId(brands[0].id);
		}
	}, [brands, brandId]);

	// Fetch content pillars when brand/product changes
	useEffect(() => {
		if (!activeWorkspace || !brandId) {
			setContentPillars([]);
			setSelectedPillars([]);
			return;
		}

		(async () => {
			// Reset immediately on brand switch so we never send stale
			// Brand-A pillar strings while the Brand-B fetch is in flight.
			setSelectedPillars([]);
			try {
				// Try to get brain version for the selected brand
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

	// Listen for SSE events
	useSSE((event) => {
		if (
			event.type === "topic_generation_complete" ||
			event.type === "topics_generated"
		) {
			setGenerating(false);
			// Fetch the generated topics
			if (activeWorkspace) {
				api<{ data: GeneratedTopic[] }>(
					`/api/workspaces/${activeWorkspace.id}/topics`
				).then((res) => {
					const topics = Array.isArray(res) ? res : res.data;
					// Show only the most recently generated topics (matching count)
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
			await api(
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
					}),
				}
			);
			showToast("Generating topics...", "info");
		} catch (e) {
			showToast(
				e instanceof Error ? e.message : "Failed to start generation",
				"error"
			);
			setGenerating(false);
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

	const handleSaveAll = async () => {
		// Topics are already saved in the backend as drafts, this is just confirmation
		setSaving(true);
		try {
			showToast("All topics saved to library!", "success");
			setTopicsSaved(true);
		} finally {
			setSaving(false);
		}
	};

	if (!activeWorkspace) {
		return (
			<div className="p-6">
				<p className="text-sm text-gray-500">
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

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between">
				<div>
					<h1 className="text-2xl font-bold text-black">
						Topic Generator
					</h1>
					<p className="text-sm text-gray-500 mt-1">
						Generate a bulk content calendar before building
						individual posts.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<HelpButton pageKey="topics" />
					{generatedTopics.length > 0 && !topicsSaved && (
						<Button
							onClick={handleSaveAll}
							loading={saving}
							className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-lg"
						>
							<svg
								className="w-4 h-4 mr-2"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							Save All Topics
						</Button>
					)}
				</div>
			</div>
			<CoachMark pageKey="topics" title="Topics" body="Topics are content ideas you can save, refine, and turn into posts later. Useful for capturing ideas you're not ready to generate yet." />

			{loading ? (
				<div className="flex justify-center py-12">
					<Spinner />
				</div>
			) : (
				<div className="flex gap-6">
					{/* Left Panel — Form */}
					<div className="w-[420px] shrink-0 space-y-5">
						{/* Context Section */}
						<div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
							<div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
								<svg
									className="w-4 h-4 text-gray-400"
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
									<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
										Brand
									</label>
									<div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 border border-gray-200 text-sm">
										<span className="w-5 h-5 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
											{brands[0].name.charAt(0).toUpperCase()}
										</span>
										<span className="text-gray-700">{brands[0].name}</span>
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

							{brandId && filteredProducts.length > 0 && (
								<div>
									<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
										Products
									</label>
									<p className="text-[11px] text-gray-400 mb-2">
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
												className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
													selectedProductIds.includes(p.id)
														? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
														: "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
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
										<p className="text-[11px] text-indigo-500 mt-1.5">
											{selectedProductIds.length} product{selectedProductIds.length > 1 ? "s" : ""} selected
										</p>
									)}
								</div>
							)}

							{brandId && contentPillars.length > 0 && (
								<div className="pt-3 border-t border-gray-100">
									<div className="flex items-center justify-between mb-2">
										<label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
											Brand Content Pillars
										</label>
										<span className="text-[10px] text-gray-400">
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
													className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
														isSelected
															? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
															: `${PILLAR_COLORS[i % PILLAR_COLORS.length]} border-transparent hover:border-gray-300`
													}`}
												>
													{p}
												</button>
											);
										})}
									</div>
									<p className="text-[10px] text-gray-400 mt-1.5">
										Pick one or more pillars, or leave blank to mix across all.
									</p>
								</div>
							)}
						</div>

						{/* Platform & Objective Section */}
						<div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
							<div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
								<svg
									className="w-4 h-4 text-gray-400"
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
								<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
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
											className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
												platform === p.value
													? "bg-indigo-600 text-white border-indigo-600"
													: "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
											}`}
										>
											{p.label}
										</button>
									))}
								</div>
							</div>

							{/* Objective */}
							<div>
								<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
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
											className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
												objective === o.value
													? "bg-indigo-600 text-white border-indigo-600"
													: "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
											}`}
										>
											{o.label}
										</button>
									))}
								</div>
							</div>

							{/* Content Formats — separate card-like section */}
							{platform && PLATFORM_FORMATS[platform] && (
								<div className="pt-3 border-t border-gray-100">
									<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
										Content Formats
									</label>
									<p className="text-[11px] text-gray-400 mb-2">
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
												className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
													selectedFormats.includes(f.value)
														? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
														: "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
												}`}
											>
												<span>{f.icon}</span>
												{f.label}
												{f.badge && (
													<span className={`text-[9px] ${selectedFormats.includes(f.value) ? "opacity-70" : "text-gray-400"}`}>{f.badge}</span>
												)}
											</button>
										))}
									</div>
									{selectedFormats.length > 0 && (
										<p className="text-[11px] text-indigo-500 mt-1.5">
											{selectedFormats.length} format{selectedFormats.length > 1 ? "s" : ""} selected
										</p>
									)}
								</div>
							)}
						</div>

						{/* Schedule Section */}
						<div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
							<div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
								<svg
									className="w-4 h-4 text-gray-400"
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
									<label className="block text-xs font-medium text-gray-600 mb-1.5">
										From
									</label>
									<input
										type="date"
										className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
										value={dateFrom}
										onChange={(e) =>
											setDateFrom(e.target.value)
										}
									/>
								</div>
								<div>
									<label className="block text-xs font-medium text-gray-600 mb-1.5">
										To
									</label>
									<input
										type="date"
										className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
										value={dateTo}
										onChange={(e) =>
											setDateTo(e.target.value)
										}
									/>
								</div>
							</div>

							{/* Topic count slider */}
							<div>
								<label className="block text-xs font-medium text-gray-600 mb-1.5">
									Number of topics:{" "}
									<span className="font-bold text-gray-900">
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
									className="w-full accent-indigo-600"
								/>
								<div className="flex justify-between text-xs text-gray-400 mt-1">
									<span>1</span>
									<span>15</span>
									<span>30</span>
								</div>
							</div>
						</div>

						{/* Additional Direction Section */}
						<div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
							<div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
								<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
									<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
								</svg>
								Additional Direction
							</div>

							<div>
								<textarea
									className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-y min-h-[140px] leading-relaxed"
									rows={6}
									placeholder="Add any specific instructions, direction, or context...&#10;&#10;Tip: Paste URLs here — they'll be scraped and used as reference material."
									value={topicPrompt}
									onChange={(e) => setTopicPrompt(e.target.value)}
								/>
								<p className="text-[10px] text-gray-400 mt-1.5">
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
								<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
									Reference Images (optional)
								</label>
								<ReferenceImageUpload
									workspaceId={activeWorkspace!.id}
									images={referenceImages}
									onChange={setReferenceImages}
								/>
							</div>
						</div>

						{/* Generate Button */}
						<Button
							onClick={handleGenerate}
							loading={generating}
							className="w-full !bg-indigo-600 hover:!bg-indigo-700 !rounded-xl !py-3 !text-sm"
						>
							<svg
								className="w-4 h-4 mr-2"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							Generate {count} Topics
						</Button>
					</div>

					{/* Right Panel — Results */}
					<div className="flex-1 min-w-0">
						{generating ? (
							<div className="flex flex-col items-center justify-center h-80 bg-white border border-gray-200 rounded-xl">
								<Spinner />
								<p className="text-sm text-gray-500 mt-4">
									Generating topics...
								</p>
							</div>
						) : generatedTopics.length > 0 ? (
							<div className="space-y-4">
								{/* Results header */}
								<div className="flex items-center justify-between">
									<p className="text-sm text-gray-500">
										{generatedTopics.length} topics for{" "}
										{brands.find((b) => b.id === brandId)
											?.name ?? ""}
										{platform
											? ` \u00B7 ${PLATFORMS.find((p) => p.value === platform)?.label}`
											: ""}
										{selectedProductIds.length > 0
											? ` \u00B7 ${selectedProductIds.length} product${selectedProductIds.length > 1 ? "s" : ""}`
											: ""}
									</p>
								</div>

								{/* Topic cards grid */}
								<div className="grid grid-cols-1 gap-4">
									{generatedTopics.map((topic) => (
										<div
											key={topic.id}
											className={`bg-white border border-gray-200 rounded-xl p-4 space-y-3 relative ${
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
														className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
													>
														<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
															<path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
														</svg>
														Generate Content
													</a>
												</div>
											)}

											<div className="flex justify-end gap-2">
												<button
													type="button"
													onClick={() => setShowRegenInput(showRegenInput === topic.id ? null : topic.id)}
													className="text-gray-300 hover:text-indigo-500 transition-colors"
													title="Regenerate this topic"
												>
													<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
														<path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
													</svg>
												</button>
												<button
													type="button"
													onClick={() => handleDeleteTopic(topic.id)}
													className="text-gray-300 hover:text-red-500 transition-colors"
												>
													<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
														<path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
													</svg>
												</button>
											</div>

											{showRegenInput === topic.id && (
												<div className="flex gap-2">
													<input
														type="text"
														placeholder="Optional hint (e.g., 'make it more educational')" 
														className="flex-1 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
														value={regenHints[topic.id] ?? ""}
														onChange={(e) => setRegenHints((prev) => ({ ...prev, [topic.id]: e.target.value }))}
														onKeyDown={(e) => { if (e.key === "Enter") handleRegenerateSingle(topic.id); }}
													/>
													<button
														type="button"
														onClick={() => handleRegenerateSingle(topic.id)}
														className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
													>
														Go
													</button>
												</div>
											)}

											<input
												type="text"
												value={topic.title}
												onChange={(e) => handleTopicFieldChange(topic.id, "title", e.target.value)}
												className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none transition-colors pb-0.5"
											/>

											<textarea
												value={topic.description ?? ""}
												onChange={(e) => handleTopicFieldChange(topic.id, "description", e.target.value)}
												placeholder="Add a description..."
												rows={5}
												className="w-full text-sm text-gray-700 leading-relaxed bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none rounded-md p-2 resize-y transition-colors"
											/>

											<div className="grid grid-cols-2 gap-2">
												<div>
													<label className="block text-[10px] text-gray-400 mb-0.5">Pillar</label>
													{contentPillars.length > 0 ? (
														<select
															value={topic.pillar ?? ""}
															onChange={(e) => handleTopicFieldChange(topic.id, "pillar", e.target.value)}
															className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
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
															className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
														/>
													)}
												</div>

												<div>
													<label className="block text-[10px] text-gray-400 mb-0.5">Format</label>
													<select
														value={topic.format ?? ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "format", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
													>
														<option value="">None</option>
														{(PLATFORM_FORMATS[topic.platform ?? platform] ?? []).map((f) => (
															<option key={f.value} value={f.value}>{f.icon} {f.label}</option>
														))}
													</select>
												</div>

												<div>
													<label className="block text-[10px] text-gray-400 mb-0.5">Platform</label>
													<select
														value={topic.platform ?? ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "platform", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
													>
														<option value="">None</option>
														{PLATFORMS.map((p) => (
															<option key={p.value} value={p.value}>{p.label}</option>
														))}
													</select>
												</div>

												<div>
													<label className="block text-[10px] text-gray-400 mb-0.5">Objective</label>
													<select
														value={topic.objective ?? ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "objective", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
													>
														<option value="">None</option>
														{OBJECTIVES.map((o) => (
															<option key={o.value} value={o.value}>{o.label}</option>
														))}
													</select>
												</div>

												<div>
													<label className="block text-[10px] text-gray-400 mb-0.5">Publish Date</label>
													<input
														type="date"
														value={topic.publishDate ? topic.publishDate.split("T")[0] : ""}
														onChange={(e) => handleTopicFieldChange(topic.id, "publishDate", e.target.value)}
														className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
													/>
												</div>
											</div>
										</div>
									))}
								</div>

							</div>
						) : (
							/* Empty state */
							<div className="flex flex-col items-center justify-center h-80 bg-white border border-gray-200 rounded-xl">
								<svg
									className="w-12 h-12 text-indigo-200 mb-4"
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
								<p className="text-base font-semibold text-gray-700">
									No topics yet
								</p>
								<p className="text-sm text-gray-400 mt-1 text-center max-w-xs">
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
