import type { PipelineRun } from "../../services/competitor-analyzer.api";

const STAGES = [
	{ key: "scraping", label: "Scrape" },
	{ key: "analyzing", label: "Analyze" },
	{ key: "generating", label: "Scripts" },
	{ key: "completed", label: "Done" },
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

export function RunProgressBar({ run }: { run: PipelineRun }) {
	const activeIdx = ACTIVE_AT[run.status] ?? -1;
	const failed = run.status === "failed" || run.status === "cancelling";

	return (
		<div className="flex items-center gap-2">
			{STAGES.map((stage, i) => {
				const done = !failed && i <= activeIdx;
				const current = !failed && i === activeIdx;
				return (
					<div key={stage.key} className="flex items-center gap-2">
						<span
							className={`text-[11px] px-2 py-1 rounded-md font-medium ${
								failed
									? "bg-red-50 text-red-600"
									: done
										? "bg-indigo-600 text-white"
										: current
											? "bg-indigo-100 text-indigo-700 animate-pulse"
											: "bg-gray-100 text-gray-500"
							}`}
						>
							{stage.label}
						</span>
						{i < STAGES.length - 1 && <div className="w-4 h-px bg-gray-300" />}
					</div>
				);
			})}
		</div>
	);
}
