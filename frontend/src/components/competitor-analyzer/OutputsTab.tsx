import { useEffect, useMemo, useState } from "react";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { getRun, type PipelineScript } from "../../services/competitor-analyzer.api";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useProject } from "../../hooks/useProject";
import { ScriptsList } from "./ScriptsList";

export function OutputsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const [filterRunId, setFilterRunId] = useState<string>("");
	const [scripts, setScripts] = useState<PipelineScript[]>([]);
	const [loading, setLoading] = useState(false);

	const completedRuns = useMemo(
		() => ca.runs.filter((r) => r.status === "completed"),
		[ca.runs],
	);

	useEffect(() => {
		if (!activeWorkspace || !activeProject) return;
		if (completedRuns.length === 0) {
			setScripts([]);
			return;
		}
		const targetRunIds = filterRunId ? [filterRunId] : completedRuns.map((r) => r.id);
		setLoading(true);
		Promise.all(
			targetRunIds.map((id) => getRun(activeWorkspace.id, activeProject.id, id).then((r) => r.scripts)),
		)
			.then((all) => setScripts(all.flat()))
			.catch(() => setScripts([]))
			.finally(() => setLoading(false));
	}, [filterRunId, activeWorkspace, activeProject, completedRuns]);

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
					Filter by run
				</label>
				<select
					value={filterRunId}
					onChange={(e) => setFilterRunId(e.target.value)}
					className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
				>
					<option value="">All completed runs</option>
					{completedRuns.map((r) => (
						<option key={r.id} value={r.id}>
							{new Date(r.createdAt).toLocaleString()}
						</option>
					))}
				</select>
			</div>

			{loading ? (
				<p className="text-sm text-gray-500">Loading…</p>
			) : (
				<ScriptsList scripts={scripts} />
			)}
		</div>
	);
}
