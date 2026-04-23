import { useEffect } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../ui/Button";
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

	function startNewRun() {
		const next = new URLSearchParams(searchParams);
		next.delete("runId");
		setSearchParams(next, { replace: true });
		ca.clearActiveRun();
	}

	async function handleDelete(id: string) {
		await ca.deleteRun(id);
		// If the deleted run was the one being viewed, drop the runId from the URL
		// so the right pane falls back to the launcher.
		if (activeRunId === id) {
			const next = new URLSearchParams(searchParams);
			next.delete("runId");
			setSearchParams(next, { replace: true });
		}
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
			<div className="space-y-3">
				<Button variant="secondary" onClick={startNewRun} className="w-full">
					<Plus size={14} className="mr-1" />
					New Run
				</Button>
				<RunsList
					runs={ca.runs}
					activeId={activeRunId}
					onSelect={selectRun}
					onDelete={handleDelete}
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
