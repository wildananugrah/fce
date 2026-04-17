import { CheckCircle2 } from "lucide-react";

interface PlanEditBlockProps {
	revisionId: string;
	summary: string;
}

export function PlanEditBlock({ summary }: PlanEditBlockProps) {
	return (
		<div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 text-xs text-emerald-800">
			<CheckCircle2 size={14} className="shrink-0" />
			<span className="font-medium">Plan updated:</span>
			<span>{summary}</span>
		</div>
	);
}
