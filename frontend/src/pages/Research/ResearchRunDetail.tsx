import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, ExternalLink } from "lucide-react";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Spinner } from "../../components/ui/Spinner";
import { Toast } from "../../components/ui/Toast";
import {
	researchApi,
	type ResearchRun,
	type ResearchResult,
} from "../../services/research.service";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "default" | "info" | "success" | "danger" | "warning" {
	if (status === "completed") return "success";
	if (status === "running") return "info";
	if (status === "failed") return "danger";
	return "default";
}

export function ResearchRunDetail() {
	const { runId } = useParams<{ runId: string }>();
	const { activeWorkspace } = useWorkspace();
	const navigate = useNavigate();
	const [run, setRun] = useState<(ResearchRun & { results: ResearchResult[] }) | null>(null);
	const [loading, setLoading] = useState(true);
	const [toast, setToast] = useState<ToastState>(null);

	const wsId = activeWorkspace?.id;

	const loadRun = useCallback(async () => {
		if (!wsId || !runId) return;
		setLoading(true);
		try {
			const data = await researchApi.getRun(wsId, runId);
			setRun(data);
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to load run", type: "error" });
		} finally {
			setLoading(false);
		}
	}, [wsId, runId]);

	useEffect(() => {
		loadRun();
	}, [loadRun]);

	const handleUseAsInspiration = async (result: ResearchResult) => {
		if (!wsId || !runId) return;
		try {
			const { context } = await researchApi.getResultAsContext(wsId, runId, result.id);
			navigate(`/generate?researchContext=${encodeURIComponent(context)}&researchTitle=${encodeURIComponent(result.title || "Research")}`);
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to load context", type: "error" });
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner size="lg" />
			</div>
		);
	}

	if (!run) {
		return <p className="text-zinc-400 text-center py-12">Run not found.</p>;
	}

	return (
		<div className="space-y-6 p-6">
			<div className="flex items-center gap-4">
				<button onClick={() => navigate("/research")} className="text-zinc-400 hover:text-zinc-200">
					<ArrowLeft size={20} />
				</button>
				<div className="flex-1">
					<h1 className="text-xl font-bold text-zinc-100">
						{run.actorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Run
					</h1>
					<p className="text-sm text-zinc-400 mt-0.5">
						{new Date(run.createdAt).toLocaleString()} · {run.resultCount} results
					</p>
				</div>
				<Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
			</div>

			{run.errorMessage && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
					{run.errorMessage}
				</div>
			)}

			{run.results.length === 0 ? (
				<p className="text-zinc-500 text-center py-12">
					{run.status === "running" ? "Run in progress, results will appear when complete..." : "No results."}
				</p>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{run.results.map((result) => {
						const meta = result.metadata as Record<string, any>;
						return (
							<div
								key={result.id}
								className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-5 space-y-3"
							>
								{result.title && (
									<h3 className="font-medium text-zinc-100 truncate">{result.title}</h3>
								)}
								<p className="text-sm text-zinc-300 line-clamp-4">{result.content}</p>

								{meta.platform && (
									<div className="flex flex-wrap gap-2 text-xs text-zinc-400">
										{meta.likesCount != null && <span>Likes: {meta.likesCount.toLocaleString()}</span>}
										{meta.commentsCount != null && <span>Comments: {meta.commentsCount.toLocaleString()}</span>}
										{meta.diggCount != null && <span>Likes: {meta.diggCount.toLocaleString()}</span>}
										{meta.playCount != null && <span>Views: {meta.playCount.toLocaleString()}</span>}
										{meta.shares != null && <span>Shares: {meta.shares.toLocaleString()}</span>}
										{meta.position != null && <span>Position: #{meta.position}</span>}
										{meta.hashtags?.length > 0 && (
											<span>#{meta.hashtags.slice(0, 5).join(" #")}</span>
										)}
									</div>
								)}

								<div className="flex items-center gap-2 pt-1">
									<Button size="sm" onClick={() => handleUseAsInspiration(result)}>
										<Sparkles size={14} className="mr-1" />
										Use as Inspiration
									</Button>
									{result.url && (
										<a
											href={result.url}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
										>
											<ExternalLink size={12} /> Source
										</a>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
