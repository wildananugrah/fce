import { Trash2 } from "lucide-react";
import type { PipelineRun } from "../../services/competitor-analyzer.api";

const STATUS_COLORS: Record<string, string> = {
	pending: "bg-gray-100 text-gray-700",
	scraping: "bg-blue-100 text-blue-700",
	analyzing: "bg-blue-100 text-blue-700",
	generating: "bg-blue-100 text-blue-700",
	completed: "bg-green-100 text-green-700",
	failed: "bg-red-100 text-red-700",
	cancelling: "bg-amber-100 text-amber-800",
};

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

interface Props {
	runs: PipelineRun[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onDelete: (id: string) => Promise<void>;
}

export function RunsList({ runs, activeId, onSelect, onDelete }: Props) {
	if (runs.length === 0) {
		return <div className="text-sm text-gray-500 text-center py-6">No runs yet.</div>;
	}
	return (
		<div className="space-y-1">
			{runs.map((run) => {
				const active = run.id === activeId;
				const canDelete = TERMINAL_STATUSES.has(run.status);
				return (
					<div
						key={run.id}
						className={`group relative w-full rounded-md border ${
							active ? "border-indigo-400 bg-indigo-50/40" : "border-gray-200 hover:bg-gray-50"
						}`}
					>
						<button
							type="button"
							onClick={() => onSelect(run.id)}
							className="w-full text-left px-3 py-2"
						>
							<div className="flex items-center gap-2 pr-6">
								<span
									className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
										STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-700"
									}`}
								>
									{run.status}
								</span>
								<span className="text-xs text-gray-500">
									{new Date(run.createdAt).toLocaleString()}
								</span>
							</div>
							<div className="text-xs text-gray-600 mt-1 truncate pr-6">
								{run.stage ?? (run.errorMessage ? `Error: ${run.errorMessage}` : "—")}
							</div>
						</button>
						{canDelete && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									if (confirm("Delete this pipeline run? Scripts and analyzed videos will be removed.")) {
										onDelete(run.id);
									}
								}}
								className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
								title="Delete run"
							>
								<Trash2 size={12} />
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
