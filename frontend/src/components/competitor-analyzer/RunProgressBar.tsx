import { useEffect, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import type { PipelineRun } from "../../services/competitor-analyzer.api";

export const PIPELINE_STAGES = [
	{
		key: "scraping",
		label: "Scrape",
		blurb: "Fetching recent videos from each creator",
	},
	{
		key: "analyzing",
		label: "Analyze",
		blurb: "AI scoring hooks, retention, and CTAs",
	},
	{
		key: "generating",
		label: "Scripts",
		blurb: "Writing scripts tailored to your brand",
	},
	{
		key: "completed",
		label: "Done",
		blurb: "All scripts ready to view",
	},
] as const;

const ACTIVE_AT: Record<string, number> = {
	pending: 0,
	scraping: 0,
	analyzing: 1,
	generating: 2,
	completed: 3,
	failed: -1,
	cancelling: -1,
};

const ACTIVE_STATUSES = new Set(["pending", "scraping", "analyzing", "generating"]);

function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}m ${r}s`;
}

export function RunProgressBar({ run }: { run: PipelineRun }) {
	const activeIdx = ACTIVE_AT[run.status] ?? -1;
	const failed = run.status === "failed" || run.status === "cancelling";
	const isActive = ACTIVE_STATUSES.has(run.status);

	// Tick every second while the run is active so the elapsed counter updates live.
	const [, setNow] = useState(0);
	useEffect(() => {
		if (!isActive) return;
		const id = setInterval(() => setNow((n) => n + 1), 1000);
		return () => clearInterval(id);
	}, [isActive]);

	const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : new Date(run.createdAt).getTime();
	const endedAt = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
	const elapsed = formatElapsed(endedAt - startedAt);

	return (
		<div className="space-y-3">
			<ol className="grid grid-cols-1 md:grid-cols-4 gap-2">
				{PIPELINE_STAGES.map((stage, i) => {
					const done = !failed && i < activeIdx;
					const current = !failed && i === activeIdx;
					const pending = !failed && i > activeIdx;

					return (
						<li
							key={stage.key}
							className={`relative rounded-lg border px-3 py-2.5 ${
								failed
									? "border-red-200 bg-red-50"
									: current
										? "border-indigo-300 bg-indigo-50"
										: done
											? "border-indigo-200 bg-white"
											: "border-gray-200 bg-gray-50"
							}`}
							aria-current={current ? "step" : undefined}
						>
							<div className="flex items-center gap-2">
								<span
									className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
										failed
											? "bg-red-100 text-red-700"
											: done
												? "bg-indigo-600 text-white"
												: current
													? "bg-indigo-600 text-white animate-pulse"
													: "bg-gray-200 text-gray-500"
									}`}
									aria-hidden
								>
									{failed ? <AlertCircle size={12} /> : done ? <Check size={12} /> : i + 1}
								</span>
								<span
									className={`text-sm font-semibold ${
										failed
											? "text-red-700"
											: current
												? "text-indigo-900"
												: done
													? "text-gray-900"
													: pending
														? "text-gray-500"
														: "text-gray-900"
									}`}
								>
									{stage.label}
								</span>
							</div>
							<p
								className={`mt-1 text-[11px] leading-snug ${
									failed
										? "text-red-700/80"
										: current
											? "text-indigo-800"
											: pending
												? "text-gray-400"
												: "text-gray-500"
								}`}
							>
								{stage.blurb}
							</p>
						</li>
					);
				})}
			</ol>

			<div className="flex items-center gap-3 text-[11px] text-gray-500">
				{failed ? (
					<span className="text-red-600 font-medium">
						{run.status === "cancelling" ? "Cancelling…" : "Failed"}
					</span>
				) : isActive ? (
					<>
						<span className="inline-flex items-center gap-1.5">
							<span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
							Running
						</span>
						<span>·</span>
						<span>Elapsed {elapsed}</span>
					</>
				) : run.status === "completed" ? (
					<span>Completed in {elapsed}</span>
				) : null}
			</div>
		</div>
	);
}
