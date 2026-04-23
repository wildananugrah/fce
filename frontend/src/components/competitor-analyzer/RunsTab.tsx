import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { RunLauncher } from "./RunLauncher";
import { RunsList } from "./RunsList";
import { RunDetail } from "./RunDetail";

export function RunsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeRunId = searchParams.get("runId");

	useEffect(() => {
		if (activeRunId && ca.activeRun?.id !== activeRunId) {
			ca.loadRun(activeRunId).catch(() => {});
		}
	}, [activeRunId, ca]);

	function selectRun(id: string) {
		const next = new URLSearchParams(searchParams);
		next.set("runId", id);
		setSearchParams(next, { replace: true });
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
			<div className="space-y-3">
				<RunsList
					runs={ca.runs}
					activeId={activeRunId}
					onSelect={selectRun}
				/>
			</div>

			<div>
				{ca.activeRun ? (
					<RunDetail run={ca.activeRun} onCancel={() => ca.cancelRun(ca.activeRun!.id)} />
				) : (
					<RunLauncher ca={ca} onLaunched={selectRun} />
				)}
			</div>
		</div>
	);
}
