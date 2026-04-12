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
			<div className="flex flex-col items-center justify-center h-96 text-center">
				<Search size={48} className="text-zinc-400 mb-4" />
				<h2 className="text-xl font-semibold text-zinc-100 mb-2">Connect Apify to start researching</h2>
				<p className="text-zinc-400 mb-6 max-w-md">
					Apify lets you scrape competitor social media, discover trends, and extract website content to power your content creation.
				</p>
				<Button onClick={() => navigate("/workspace-settings")}>Set up Apify</Button>
			</div>
		);
	}

	return (
		<div className="space-y-8 p-6">
			<div>
				<h1 className="text-2xl font-bold text-zinc-100">Research</h1>
				<p className="text-zinc-400 mt-1">Scrape competitors, discover trends, and research content ideas.</p>
			</div>

			{/* Launch Panel */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{ACTORS.map((actor) => {
					const Icon = actor.icon;
					return (
						<button
							key={actor.type}
							onClick={() => openActorForm(actor.type)}
							className="flex items-start gap-4 rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-5 text-left hover:border-violet-500/50 hover:bg-zinc-800 transition-colors"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
								<Icon size={20} className="text-violet-400" />
							</div>
							<div>
								<h3 className="font-medium text-zinc-100">{actor.label}</h3>
								<p className="text-sm text-zinc-400 mt-0.5">{actor.description}</p>
							</div>
						</button>
					);
				})}
			</div>

			{/* Filters */}
			<div className="flex gap-3">
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

			{/* Recent Runs */}
			{runs.length === 0 ? (
				<p className="text-zinc-500 text-center py-12">No research runs yet. Pick a scraper above to get started.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-zinc-700/50 text-left text-zinc-400">
								<th className="py-3 pr-4 font-medium">Type</th>
								<th className="py-3 pr-4 font-medium">Input</th>
								<th className="py-3 pr-4 font-medium">Brand</th>
								<th className="py-3 pr-4 font-medium">Status</th>
								<th className="py-3 pr-4 font-medium">Results</th>
								<th className="py-3 pr-4 font-medium">Date</th>
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
										className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
									>
										<td className="py-3 pr-4">
											<div className="flex items-center gap-2">
												<Icon size={16} className="text-zinc-400" />
												<span className="text-zinc-200">{actor?.label || run.actorType}</span>
											</div>
										</td>
										<td className="py-3 pr-4 text-zinc-400 max-w-xs truncate">
											{JSON.stringify(run.input).slice(0, 60)}
										</td>
										<td className="py-3 pr-4 text-zinc-400">{run.brand?.name || "\u2014"}</td>
										<td className="py-3 pr-4">
											<Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
										</td>
										<td className="py-3 pr-4 text-zinc-300">{run.resultCount}</td>
										<td className="py-3 pr-4 text-zinc-400">
											{new Date(run.createdAt).toLocaleDateString()}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

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
