import { Button } from "../ui/Button";
import type { PipelineRunDetail } from "../../services/competitor-analyzer.api";
import { RunProgressBar } from "./RunProgressBar";
import { VideoAnalysisCard } from "./VideoAnalysisCard";

interface Props {
	run: PipelineRunDetail;
	onCancel: () => Promise<void>;
}

export function RunDetail({ run, onCancel }: Props) {
	const isTerminal = run.status === "completed" || run.status === "failed";

	return (
		<div className="space-y-4">
			<div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="text-xs text-gray-500">
							Run · {new Date(run.createdAt).toLocaleString()}
						</p>
						<p className="text-sm font-medium text-gray-900 truncate">
							{run.config?.name ?? "(config deleted)"}
						</p>
					</div>
					{!isTerminal && (
						<Button variant="secondary" onClick={onCancel}>
							Cancel
						</Button>
					)}
				</div>
				<RunProgressBar run={run} />
				<p className="text-xs text-gray-600">
					{run.stage ? `Stage: ${run.stage}` : ""}
					{run.errorMessage ? (
						<span className="text-red-600"> · {run.errorMessage}</span>
					) : null}
				</p>
				<p className="text-[11px] text-gray-400 font-mono">runId: {run.id}</p>
			</div>

			<div className="space-y-2">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Analyzed videos ({run.videos.length})
				</p>
				{run.videos.length === 0 ? (
					<p className="text-sm text-gray-500">No videos yet.</p>
				) : (
					<div className="space-y-2">
						{run.videos.map((v) => (
							<VideoAnalysisCard key={v.id} video={v} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
