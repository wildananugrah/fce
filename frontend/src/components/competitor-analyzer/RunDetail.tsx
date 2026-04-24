import { ArrowRight } from "lucide-react";
import { Button } from "../ui/Button";
import type { PipelineRunDetail } from "../../services/competitor-analyzer.api";
import type { CompetitorAnalyzerStepKey } from "../../pages/CompetitorAnalyzerPage";
import { RunProgressBar } from "./RunProgressBar";
import { VideoAnalysisCard } from "./VideoAnalysisCard";

interface Props {
	run: PipelineRunDetail;
	onCancel: () => Promise<void>;
	onGoToStep: (key: CompetitorAnalyzerStepKey) => void;
}

export function RunDetail({ run, onCancel, onGoToStep }: Props) {
	const isTerminal = run.status === "completed" || run.status === "failed";
	const isCompleted = run.status === "completed";

	return (
		<div className="space-y-4">
			<div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="text-[11px] text-gray-500">
							Run · {new Date(run.createdAt).toLocaleString()}
						</p>
						<p className="text-sm font-semibold text-gray-900 truncate">
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

				{run.errorMessage && (
					<p
						role="alert"
						className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
					>
						{run.errorMessage}
					</p>
				)}
			</div>

			{isCompleted && run.scripts.length > 0 && (
				<div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-sm font-semibold text-indigo-900">
							{run.scripts.length} script{run.scripts.length === 1 ? "" : "s"} ready
						</p>
						<p className="text-xs text-indigo-700/80 mt-0.5">
							Open the Outputs tab to read, copy, or export them.
						</p>
					</div>
					<button
						type="button"
						onClick={() => onGoToStep("outputs")}
						className="shrink-0 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-medium px-3.5 py-2 rounded-lg hover:bg-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
					>
						View Outputs
						<ArrowRight size={14} />
					</button>
				</div>
			)}

			<div className="space-y-2">
				<p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
					Analyzed videos ({run.videos.length})
				</p>
				{run.videos.length === 0 ? (
					<p className="text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg px-4 py-6 text-center bg-gray-50/50">
						{isTerminal ? "No videos analyzed in this run." : "Waiting for the first videos…"}
					</p>
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
