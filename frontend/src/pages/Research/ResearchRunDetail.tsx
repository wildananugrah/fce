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
		return <p className="text-sm text-gray-400 text-center py-12">Run not found.</p>;
	}

	return (
		<div className="p-6 max-w-6xl">
			{/* Header */}
			<div className="flex items-center gap-4 mb-6">
				<button
					type="button"
					onClick={() => navigate("/research")}
					className="p-1.5 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
				>
					<ArrowLeft size={18} />
				</button>
				<div className="flex-1 min-w-0">
					<h1 className="text-xl font-semibold text-gray-900">
						{run.actorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Run
					</h1>
					<p className="text-sm text-gray-500 mt-0.5">
						{new Date(run.createdAt).toLocaleString()} · {run.resultCount} results
					</p>
				</div>
				<Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
			</div>

			{run.errorMessage && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
					{run.errorMessage}
				</div>
			)}

			{run.results.length === 0 ? (
				<div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
					<p className="text-sm text-gray-400">
						{run.status === "running" ? "Run in progress, results will appear when complete..." : "No results."}
					</p>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					{run.results.map((result) => {
						const meta = result.metadata as Record<string, any>;
						return (
							<div
								key={result.id}
								className="rounded-lg border border-gray-200 bg-white p-4 space-y-2.5 hover:border-gray-300 transition-colors"
							>
								{result.title && (
									<h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{result.title}</h3>
								)}
								<p className="text-xs text-gray-600 line-clamp-4 leading-relaxed">{result.content}</p>

								{meta.platform && (
									<div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
										{meta.likesCount != null && <span>♡ {meta.likesCount.toLocaleString()}</span>}
										{meta.commentsCount != null && <span>💬 {meta.commentsCount.toLocaleString()}</span>}
										{meta.diggCount != null && <span>♡ {meta.diggCount.toLocaleString()}</span>}
										{meta.playCount != null && <span>▶ {meta.playCount.toLocaleString()}</span>}
										{meta.shares != null && <span>↗ {meta.shares.toLocaleString()}</span>}
										{meta.position != null && <span>#{meta.position}</span>}
										{meta.hashtags?.length > 0 && (
											<span className="text-indigo-500">#{meta.hashtags.slice(0, 3).join(" #")}</span>
										)}
									</div>
								)}

								<div className="flex items-center gap-2 pt-1">
									<Button size="sm" onClick={() => handleUseAsInspiration(result)}>
										<Sparkles size={12} className="mr-1" />
										Use as Inspiration
									</Button>
									{result.url && (
										<a
											href={result.url}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
										>
											<ExternalLink size={11} /> Source
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
