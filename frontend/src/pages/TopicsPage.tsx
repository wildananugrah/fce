import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { ActiveSkillsBadges } from "../components/skills/ActiveSkillsBadges";

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

const PILLAR_COLORS = [
	"bg-emerald-50 text-emerald-700 border-emerald-200",
	"bg-violet-50 text-violet-700 border-violet-200",
	"bg-amber-50 text-amber-700 border-amber-200",
	"bg-teal-50 text-teal-700 border-teal-200",
	"bg-rose-50 text-rose-700 border-rose-200",
	"bg-blue-50 text-blue-700 border-blue-200",
	"bg-orange-50 text-orange-700 border-orange-200",
];

function getPillarColor(pillar: string, pillars: string[]) {
	const idx = pillars.indexOf(pillar);
	return PILLAR_COLORS[idx >= 0 ? idx % PILLAR_COLORS.length : 0];
}

function formatDate(dateStr?: string) {
	if (!dateStr) return "";
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function getFormatColor(format?: string) {
	if (!format) return "bg-gray-100 text-gray-600";
	const f = format.toLowerCase();
	if (f.includes("carousel")) return "bg-blue-50 text-blue-700";
	if (f.includes("reel") || f.includes("video") || f.includes("short"))
		return "bg-red-50 text-red-700";
	if (f.includes("story")) return "bg-purple-50 text-purple-700";
	if (f.includes("single") || f.includes("image"))
		return "bg-indigo-50 text-indigo-700";
	return "bg-gray-100 text-gray-600";
}

export function TopicsPage() {
	const { activeWorkspace } = useWorkspace();
	const [brands, setBrands] = useState<Brand[]>([]);
	const [products, setProducts] = useState<Product[]>([]);
	const [loading, setLoading] = useState(true);
	const [generating, setGenerating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<ToastState>(null);
	const [contentPillars, setContentPillars] = useState<string[]>([]);

	// Form state
	const [brandId, setBrandId] = useState("");
	const [productId, setProductId] = useState("");
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
			const [b, p] = await Promise.all([
				api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
				api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products`),
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
	}, [activeWorkspace]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// Fetch content pillars when brand/product changes
	useEffect(() => {
		if (!activeWorkspace || !brandId) {
			setContentPillars([]);
			return;
		}

		(async () => {
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
					(v: BrainVersion) => v.vocabulary?.contentPillars
				);
				setContentPillars(
					activeBrain?.vocabulary?.contentPillars ?? []
				);
			} catch {
				setContentPillars([]);
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
						productId: productId || undefined,
						platform: platform || undefined,
						objective: objective || undefined,
						dateFrom,
						dateTo,
						count,
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

	const handleRegenerate = () => {
		handleGenerate();
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
	const productOptions = [
		{ value: "", label: "\u2014 Brand-level topics \u2014" },
		...filteredProducts.map((p) => ({ value: p.id, label: p.name })),
	];

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
			<ActiveSkillsBadges generator="topic" />

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

							<Select
								label="Brand *"
								options={brandOptions}
								value={brandId}
								onChange={(e) => {
									setBrandId(e.target.value);
									setProductId("");
								}}
							/>

							{brandId && (
								<>
									<Select
										label="Product (optional)"
										options={productOptions}
										value={productId}
										onChange={(e) =>
											setProductId(e.target.value)
										}
									/>

									{contentPillars.length > 0 && (
										<div className="flex flex-wrap gap-2">
											{contentPillars.map((p, i) => (
												<span
													key={p}
													className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${PILLAR_COLORS[i % PILLAR_COLORS.length]}`}
												>
													{p}
												</span>
											))}
										</div>
									)}
								</>
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
							<div className="flex flex-wrap gap-2">
								{PLATFORMS.map((p) => (
									<button
										key={p.value}
										type="button"
										onClick={() =>
											setPlatform(
												platform === p.value
													? ""
													: p.value
											)
										}
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
									min={5}
									max={30}
									step={1}
									value={count}
									onChange={(e) =>
										setCount(parseInt(e.target.value))
									}
									className="w-full accent-indigo-600"
								/>
								<div className="flex justify-between text-xs text-gray-400 mt-1">
									<span>5</span>
									<span>15</span>
									<span>30</span>
								</div>
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
										{productId
											? ` \u00B7 ${products.find((p) => p.id === productId)?.name}`
											: ""}
									</p>
									<button
										type="button"
										onClick={handleRegenerate}
										className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
									>
										<svg
											className="w-3.5 h-3.5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={2}
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
											/>
										</svg>
										Regenerate
									</button>
								</div>

								{/* Topic cards grid */}
								<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
									{generatedTopics.map((topic) => (
										<div
											key={topic.id}
											className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 relative group"
										>
											{/* Delete button */}
											<button
												type="button"
												onClick={() =>
													handleDeleteTopic(topic.id)
												}
												className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors"
											>
												<svg
													className="w-4 h-4"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={2}
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
													/>
												</svg>
											</button>

											{/* Title */}
											<h3 className="text-sm font-semibold text-gray-900 pr-6 leading-snug">
												{topic.title}
											</h3>

											{/* Tags */}
											<div className="flex flex-wrap items-center gap-2">
												{topic.pillar && (
													<span
														className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getPillarColor(topic.pillar, contentPillars)}`}
													>
														{topic.pillar}
													</span>
												)}
												{topic.format && (
													<span
														className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getFormatColor(topic.format)}`}
													>
														{topic.format}
													</span>
												)}
												{topic.publishDate && (
													<span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
														<svg
															className="w-3 h-3"
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
														{formatDate(
															topic.publishDate
														)}
													</span>
												)}
											</div>

											{/* Generate content link */}
											<a
												href="#"
												className="inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
												onClick={(e) => {
													e.preventDefault();
													// TODO: Navigate to content generator with this topic
												}}
											>
												Generate content{" "}
												<svg
													className="w-3 h-3 ml-1"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={2}
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M14 5l7 7m0 0l-7 7m7-7H3"
													/>
												</svg>
											</a>
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
