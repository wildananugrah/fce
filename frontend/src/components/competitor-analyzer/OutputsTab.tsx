import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { getRun, type PipelineScript } from "../../services/competitor-analyzer.api";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useProject } from "../../hooks/useProject";
import type { CompetitorAnalyzerStepKey } from "../../pages/CompetitorAnalyzerPage";
import { ScriptsList } from "./ScriptsList";
import { Spinner } from "../ui/Spinner";

interface Props {
	ca: ReturnType<typeof useCompetitorAnalyzer>;
	onGoToStep: (key: CompetitorAnalyzerStepKey) => void;
}

function formatRunLabel(run: {
	createdAt: string;
	configId: string | null;
}, configName: string | undefined) {
	const when = new Date(run.createdAt);
	const date = when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	return `${configName ?? "(deleted config)"} · ${date} ${time}`;
}

export function OutputsTab({ ca, onGoToStep }: Props) {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const [filterRunId, setFilterRunId] = useState<string>("");
	const [scripts, setScripts] = useState<PipelineScript[]>([]);
	const [loading, setLoading] = useState(false);

	const completedRuns = useMemo(
		() => ca.runs.filter((r) => r.status === "completed"),
		[ca.runs],
	);
	const configById = useMemo(() => {
		const map = new Map<string, string>();
		for (const c of ca.configs) map.set(c.id, c.name);
		return map;
	}, [ca.configs]);

	useEffect(() => {
		if (!activeWorkspace || !activeProject) return;
		if (completedRuns.length === 0) {
			setScripts([]);
			return;
		}
		const targetRunIds = filterRunId ? [filterRunId] : completedRuns.map((r) => r.id);
		setLoading(true);
		Promise.all(
			targetRunIds.map((id) =>
				getRun(activeWorkspace.id, activeProject.id, id).then((r) => r.scripts),
			),
		)
			.then((all) => setScripts(all.flat()))
			.catch(() => setScripts([]))
			.finally(() => setLoading(false));
	}, [filterRunId, activeWorkspace, activeProject, completedRuns]);

	// Empty state — no completed runs means no scripts to show.
	if (completedRuns.length === 0) {
		return (
			<div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
				<div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3">
					<FileText size={20} className="text-indigo-600" />
				</div>
				<p className="text-sm font-semibold text-gray-800">No scripts yet</p>
				<p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
					Scripts appear here after a pipeline run completes. Launch a run to generate your first
					batch.
				</p>
				<button
					type="button"
					onClick={() => onGoToStep("runs")}
					className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
				>
					<ArrowLeft size={14} />
					Go to Run Pipeline
				</button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
				<label className="flex items-center gap-2">
					<span className="text-xs font-medium text-gray-700">Filter by run</span>
					<select
						value={filterRunId}
						onChange={(e) => setFilterRunId(e.target.value)}
						className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
					>
						<option value="">All completed runs</option>
						{completedRuns.map((r) => (
							<option key={r.id} value={r.id}>
								{formatRunLabel(r, r.configId ? configById.get(r.configId) : undefined)}
							</option>
						))}
					</select>
				</label>
				<span className="text-[11px] text-gray-500 ml-auto">
					{scripts.length} script{scripts.length === 1 ? "" : "s"}
				</span>
			</div>

			{loading ? (
				<div className="py-12 flex justify-center">
					<Spinner size="lg" />
				</div>
			) : scripts.length === 0 ? (
				<p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center bg-gray-50/50">
					This run finished without producing scripts.
				</p>
			) : (
				<ScriptsList scripts={scripts} />
			)}
		</div>
	);
}
