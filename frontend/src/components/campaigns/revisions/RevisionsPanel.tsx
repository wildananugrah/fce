import { useCallback, useEffect, useState } from "react";
import { api, getAccessToken } from "../../../services/api";
import { parseSSEStream } from "../../../utils/sse-parser";
import { RevisionRow } from "./RevisionRow";

interface Revision {
	id: string;
	revisionNumber: number;
	label: string;
	createdAt: string;
}

interface RevisionsPanelProps {
	workspaceId: string;
	campaignId: string;
	refreshKey: number;
	onRestored: () => void;
}

export function RevisionsPanel({ workspaceId, campaignId, refreshKey, onRestored }: RevisionsPanelProps) {
	const [revisions, setRevisions] = useState<Revision[]>([]);
	const [restoring, setRestoring] = useState(false);

	const load = useCallback(() => {
		api<Revision[]>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/revisions`)
			.then(setRevisions)
			.catch(() => setRevisions([]));
	}, [workspaceId, campaignId]);

	useEffect(() => { load(); }, [load, refreshKey]);

	const restore = async (revisionId: string) => {
		setRestoring(true);
		try {
			const token = getAccessToken();
			const resp = await fetch(
				`${import.meta.env.VITE_API_URL || ""}/api/workspaces/${workspaceId}/campaigns/${campaignId}/revisions/${revisionId}/restore`,
				{ method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} },
			);
			if (!resp.ok || !resp.body) return;
			for await (const _evt of parseSSEStream(resp.body)) {
				// consume; events cause the parent to refetch via onRestored below
			}
			onRestored();
		} finally {
			setRestoring(false);
		}
	};

	return (
		<div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
			<div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
				<p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Revisions</p>
			</div>
			<div className="max-h-[500px] overflow-y-auto">
				{revisions.length === 0 ? (
					<p className="px-3 py-4 text-xs text-gray-400 text-center">No revisions yet.</p>
				) : (
					revisions.map((r) => (
						<RevisionRow
							key={r.id}
							revisionNumber={r.revisionNumber}
							label={r.label}
							createdAt={r.createdAt}
							onRestore={() => restore(r.id)}
							restoreDisabled={restoring}
						/>
					))
				)}
			</div>
		</div>
	);
}
