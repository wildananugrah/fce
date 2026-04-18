import { FileText } from "lucide-react";

interface SummaryEditBlockProps {
	summary: string;
}

export function SummaryEditBlock({ summary }: SummaryEditBlockProps) {
	const preview = summary.length > 140 ? `${summary.slice(0, 140).trim()}…` : summary;
	return (
		<div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-md px-2.5 py-2 text-xs text-sky-900 max-w-full">
			<FileText size={14} className="shrink-0 mt-0.5" />
			<div className="min-w-0">
				<span className="font-medium">Document summary rewritten. </span>
				<span className="text-sky-800">{preview}</span>
			</div>
		</div>
	);
}
