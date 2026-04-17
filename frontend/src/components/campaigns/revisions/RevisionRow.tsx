import { useState } from "react";
import { History, RotateCcw } from "lucide-react";

interface RevisionRowProps {
	revisionNumber: number;
	label: string;
	createdAt: string;
	onRestore: () => Promise<void>;
	restoreDisabled?: boolean;
}

export function RevisionRow({ revisionNumber, label, createdAt, onRestore, restoreDisabled }: RevisionRowProps) {
	const [busy, setBusy] = useState(false);
	const handle = async () => {
		setBusy(true);
		try { await onRestore(); } finally { setBusy(false); }
	};

	return (
		<div className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
			<History size={12} className="text-gray-400 mt-0.5 shrink-0" />
			<div className="flex-1 min-w-0">
				<p className="text-xs font-semibold text-gray-900">Rev {revisionNumber}</p>
				<p className="text-[11px] text-gray-600 truncate">{label}</p>
				<p className="text-[10px] text-gray-400">{new Date(createdAt).toLocaleString()}</p>
			</div>
			<button
				type="button"
				onClick={handle}
				disabled={busy || restoreDisabled}
				className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
				title="Restore this revision"
			>
				<RotateCcw size={10} />
				Restore
			</button>
		</div>
	);
}
