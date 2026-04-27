import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
	Globe,
	Camera,
	Music2,
	MessageCircle,
	TrendingUp,
	Search,
	Play,
} from "lucide-react";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useSSE } from "../../hooks/useSSE";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Toast } from "../../components/ui/Toast";
import { Badge } from "../../components/ui/Badge";
import {
	researchApi,
	type ResearchRun,
	type WorkspaceResearchSettings,
} from "../../services/research.service";
import { api } from "../../services/api";
import { CoachMark } from "../../components/onboarding/CoachMark";
import { HelpButton } from "../../components/onboarding/HelpButton";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Brand {
	id: string;
	name: string;
}

const ACTORS = [
	{ type: "website_crawler", label: "Website Crawler", description: "Extract content from any website", icon: Globe },
	{ type: "instagram", label: "Instagram", description: "Scrape posts from an account", icon: Camera },
	{ type: "tiktok", label: "TikTok", description: "Scrape videos from an account", icon: Music2 },
	{ type: "facebook", label: "Facebook", description: "Scrape posts from a page", icon: MessageCircle },
	{ type: "google_trends", label: "Google Trends", description: "Discover trending topics", icon: TrendingUp },
	{ type: "google_search", label: "Google Search", description: "Analyze search results", icon: Search },
] as const;

const STATUS_OPTIONS = [
	{ value: "", label: "All statuses" },
	{ value: "pending", label: "Pending" },
	{ value: "running", label: "Running" },
	{ value: "completed", label: "Completed" },
	{ value: "failed", label: "Failed" },
];

function statusBadgeVariant(status: string): "default" | "info" | "success" | "danger" | "warning" {
	if (status === "completed") return "success";
	if (status === "running") return "info";
	if (status === "failed") return "danger";
	return "default";
}

export function ResearchPage() {
	const { activeWorkspace } = useWorkspace();
	const navigate = useNavigate();
	const [settings, setSettings] = useState<WorkspaceResearchSettings | null>(null);
	const [runs, setRuns] = useState<ResearchRun[]>([]);
	const [brands, setBrands] = useState<Brand[]>([]);
	const [loading, setLoading] = useState(true);
	const [toast, setToast] = useState<ToastState>(null);

	const [actorFilter, setActorFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");

	const [modalOpen, setModalOpen] = useState(false);
	const [selectedActor, setSelectedActor] = useState<string>("");
	const [formInput, setFormInput] = useState<Record<string, string>>({});
	const [formBrandId, setFormBrandId] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const wsId = activeWorkspace?.id;

	const loadData = useCallback(async () => {
		if (!wsId) return;
		setLoading(true);
		try {
			const [settingsData, runsData, brandsData] = await Promise.all([
				researchApi.getSettings(wsId),
				researchApi.listRuns(wsId, {
					actorType: actorFilter || undefined,
					status: statusFilter || undefined,
				}),
				api<Brand[]>(`/api/workspaces/${wsId}/brands`),
			]);
			setSettings(settingsData);
			setRuns(runsData);
			setBrands(brandsData);
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to load", type: "error" });
		} finally {
			setLoading(false);
		}
	}, [wsId, actorFilter, statusFilter]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useSSE((event) => {
		if (event.type === "research_run_complete" || event.type === "research_run_failed") {
			loadData();
		}
	});

	const openActorForm = (actorType: string) => {
		setSelectedActor(actorType);
		setFormInput({});
		setFormBrandId("");
		setModalOpen(true);
	};

	const handleSubmit = async () => {
		if (!wsId || !selectedActor) return;
		setSubmitting(true);
		try {
			let input: Record<string, any> = {};

			if (selectedActor === "website_crawler") {
				input = { startUrls: [{ url: formInput.url }], maxCrawlPages: Number(formInput.maxPages || 10) };
			} else if (selectedActor === "instagram") {
				input = { directUrls: [formInput.username?.startsWith("http") ? formInput.username : `https://instagram.com/${formInput.username}`], resultsLimit: Number(formInput.maxPosts || 50) };
			} else if (selectedActor === "tiktok") {
				input = { profiles: [formInput.username?.startsWith("http") ? formInput.username : `https://tiktok.com/@${formInput.username}`], resultsPerPage: Number(formInput.maxVideos || 50) };
			} else if (selectedActor === "facebook") {
				input = { startUrls: [{ url: formInput.pageUrl }], maxPosts: Number(formInput.maxPosts || 50) };
			} else if (selectedActor === "google_trends") {
				input = { searchTerms: formInput.keywords?.split(",").map((k: string) => k.trim()), geo: formInput.geo || "US" };
			} else if (selectedActor === "google_search") {
				input = { queries: formInput.query, maxPagesPerQuery: 1, resultsPerPage: Number(formInput.maxResults || 30) };
			}

			await researchApi.createRun(wsId, {
				actorType: selectedActor,
				input,
				brandId: formBrandId || undefined,
			});
			setModalOpen(false);
			setToast({ message: "Research run started!", type: "success" });
			loadData();
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to start run", type: "error" });
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner size="lg" />
			</div>
		);
	}

	if (settings && !settings.hasApifyKey) {
		return (
			<div className="flex flex-col items-center justify-center h-96 text-center p-6">
				<div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
					<Search size={24} className="text-indigo-500" />
				</div>
				<h2 className="text-lg font-semibold text-gray-900 mb-2">Connect Apify to start researching</h2>
				<p className="text-sm text-gray-500 mb-6 max-w-md">
					Apify lets you scrape competitor social media, discover trends, and extract website content to power your content creation.
				</p>
				<Button onClick={() => navigate("/workspace-settings")}>Set up Apify</Button>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-6xl">
			{/* Header */}
			<div className="flex items-start justify-between mb-6">
				<div>
					<h1 className="text-xl font-semibold text-gray-900">Research Hub</h1>
					<p className="text-sm text-gray-500 mt-1">
						Scrape competitors, discover trends, and research content ideas.
					</p>
				</div>
				<HelpButton pageKey="research" />
			</div>

			<CoachMark pageKey="research" title="Research" body="Run research briefs — paste URLs or keywords and get a synthesized summary you can feed back into topic and content generation." />

			{/* Launch Panel */}
			<div className="mb-8">
				<h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
					Start a new research
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{ACTORS.map((actor) => {
						const Icon = actor.icon;
						return (
							<button
								key={actor.type}
								type="button"
								onClick={() => openActorForm(actor.type)}
								className="group flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
							>
								<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-50 group-hover:bg-indigo-50 transition-colors">
									<Icon size={16} className="text-gray-500 group-hover:text-indigo-600 transition-colors" />
								</div>
								<div className="min-w-0">
									<h3 className="text-sm font-medium text-gray-900">{actor.label}</h3>
									<p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{actor.description}</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			{/* Recent Runs Section */}
			<div>
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Recent Runs
					</h2>
					<div className="flex gap-2">
						<Select
							options={[{ value: "", label: "All types" }, ...ACTORS.map((a) => ({ value: a.type, label: a.label }))]}
							value={actorFilter}
							onChange={(e) => setActorFilter(e.target.value)}
						/>
						<Select
							options={STATUS_OPTIONS}
							value={statusFilter}
							onChange={(e) => setStatusFilter(e.target.value)}
						/>
					</div>
				</div>

				{runs.length === 0 ? (
					<div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
						<p className="text-sm text-gray-400">No research runs yet. Pick a scraper above to get started.</p>
					</div>
				) : (
					<div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
						<table className="w-full min-w-[720px] text-sm">
							<thead>
								<tr className="border-b border-gray-100 bg-gray-50">
									<th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
									<th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Input</th>
									<th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</th>
									<th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
									<th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Results</th>
									<th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
								</tr>
							</thead>
							<tbody>
								{runs.map((run) => {
									const actor = ACTORS.find((a) => a.type === run.actorType);
									const Icon = actor?.icon || Globe;
									return (
										<tr
											key={run.id}
											onClick={() => navigate(`/research/${run.id}`)}
											className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
										>
											<td className="px-4 py-2.5">
												<div className="flex items-center gap-2">
													<Icon size={14} className="text-gray-400" />
													<span className="text-sm text-gray-800">{actor?.label || run.actorType}</span>
												</div>
											</td>
											<td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate font-mono">
												{JSON.stringify(run.input).slice(0, 60)}
											</td>
											<td className="px-4 py-2.5 text-sm text-gray-600">{run.brand?.name || "\u2014"}</td>
											<td className="px-4 py-2.5">
												<Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
											</td>
											<td className="px-4 py-2.5 text-sm text-gray-700 font-medium">{run.resultCount}</td>
											<td className="px-4 py-2.5 text-xs text-gray-500">
												{new Date(run.createdAt).toLocaleDateString()}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Actor Form Modal */}
			<Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={ACTORS.find((a) => a.type === selectedActor)?.label || "Run Research"} size="md">
				<div className="space-y-4">
					{selectedActor === "website_crawler" && (
						<>
							<Input label="URL" placeholder="https://example.com" value={formInput.url || ""} onChange={(e) => setFormInput({ ...formInput, url: e.target.value })} />
							<Input label="Max pages" type="number" placeholder="10" value={formInput.maxPages || ""} onChange={(e) => setFormInput({ ...formInput, maxPages: e.target.value })} />
						</>
					)}
					{selectedActor === "instagram" && (
						<>
							<Input label="Username or profile URL" placeholder="@competitor or https://instagram.com/competitor" value={formInput.username || ""} onChange={(e) => setFormInput({ ...formInput, username: e.target.value })} />
							<Input label="Max posts" type="number" placeholder="50" value={formInput.maxPosts || ""} onChange={(e) => setFormInput({ ...formInput, maxPosts: e.target.value })} />
						</>
					)}
					{selectedActor === "tiktok" && (
						<>
							<Input label="Username or profile URL" placeholder="@competitor or https://tiktok.com/@competitor" value={formInput.username || ""} onChange={(e) => setFormInput({ ...formInput, username: e.target.value })} />
							<Input label="Max videos" type="number" placeholder="50" value={formInput.maxVideos || ""} onChange={(e) => setFormInput({ ...formInput, maxVideos: e.target.value })} />
						</>
					)}
					{selectedActor === "facebook" && (
						<>
							<Input label="Page URL" placeholder="https://facebook.com/pagename" value={formInput.pageUrl || ""} onChange={(e) => setFormInput({ ...formInput, pageUrl: e.target.value })} />
							<Input label="Max posts" type="number" placeholder="50" value={formInput.maxPosts || ""} onChange={(e) => setFormInput({ ...formInput, maxPosts: e.target.value })} />
						</>
					)}
					{selectedActor === "google_trends" && (
						<>
							<Input label="Keywords (comma-separated)" placeholder="marketing, AI, content" value={formInput.keywords || ""} onChange={(e) => setFormInput({ ...formInput, keywords: e.target.value })} />
							<Select
								label="Region"
								options={[
									{ value: "US", label: "United States" },
									{ value: "GB", label: "United Kingdom" },
									{ value: "ID", label: "Indonesia" },
									{ value: "SG", label: "Singapore" },
									{ value: "", label: "Worldwide" },
								]}
								value={formInput.geo || "US"}
								onChange={(e) => setFormInput({ ...formInput, geo: e.target.value })}
							/>
						</>
					)}
					{selectedActor === "google_search" && (
						<>
							<Input label="Search query" placeholder="best content marketing tools 2026" value={formInput.query || ""} onChange={(e) => setFormInput({ ...formInput, query: e.target.value })} />
							<Input label="Max results" type="number" placeholder="30" value={formInput.maxResults || ""} onChange={(e) => setFormInput({ ...formInput, maxResults: e.target.value })} />
						</>
					)}

					<Select
						label="Link to brand (optional)"
						options={[{ value: "", label: "No brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
						value={formBrandId}
						onChange={(e) => setFormBrandId(e.target.value)}
					/>

					<div className="flex justify-end gap-2 pt-2">
						<Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
						<Button onClick={handleSubmit} loading={submitting}>
							<Play size={16} className="mr-1" /> Run Research
						</Button>
					</div>
				</div>
			</Modal>

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
