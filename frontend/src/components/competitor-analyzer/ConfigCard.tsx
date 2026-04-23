import { Pencil, Trash2, Users } from "lucide-react";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";

interface Props {
	config: AnalysisConfig;
	onEdit: (config: AnalysisConfig) => void;
	onDelete: (id: string) => Promise<void>;
}

export function ConfigCard({ config, onEdit, onDelete }: Props) {
	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 flex items-center gap-3">
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-gray-900 truncate">{config.name}</span>
					{config.targetNiche && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
							{config.targetNiche}
						</span>
					)}
				</div>
				<div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
					<span className="flex items-center gap-1">
						<Users size={12} />
						{config.creators?.length ?? 0} creators
					</span>
					{config._count && <span>{config._count.runs} runs</span>}
				</div>
				<p className="text-xs text-gray-400 mt-1 line-clamp-1">{config.brandContext}</p>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					onClick={() => onEdit(config)}
					className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
					title="Edit"
				>
					<Pencil size={14} />
				</button>
				<button
					type="button"
					onClick={() => {
						if (confirm(`Delete config "${config.name}"? Historical runs will remain.`))
							onDelete(config.id);
					}}
					className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
					title="Delete"
				>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
}
