import { CheckCircle2 } from "lucide-react";

interface PlanEditBlockProps {
	revisionId: string;
	summary: string;
}

export function PlanEditBlock({ summary }: PlanEditBlockProps) {
	return (
		<div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-2 text-xs text-emerald-800">
			<CheckCircle2 size={14} className="shrink-0 mt-0.5" />
			<div className="min-w-0">
				<span className="font-medium">Plan updated. </span>
				<span>{summary}</span>
			</div>
		</div>
	);
}
