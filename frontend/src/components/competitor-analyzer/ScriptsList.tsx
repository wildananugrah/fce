import type { PipelineScript } from "../../services/competitor-analyzer.api";
import { ScriptDetail } from "./ScriptDetail";

export function ScriptsList({ scripts }: { scripts: PipelineScript[] }) {
	if (scripts.length === 0) {
		return (
			<div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-300 rounded-md">
				No generated scripts yet. Run a pipeline first.
			</div>
		);
	}
	return (
		<div className="space-y-2">
			{scripts.map((s) => (
				<ScriptDetail key={s.id} script={s} />
			))}
		</div>
	);
}
