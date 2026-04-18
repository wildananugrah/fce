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
	onToast?: (msg: string, type: "success" | "error" | "info") => void;
}

export function RevisionsPanel({ workspaceId, campaignId, refreshKey, onRestored, onToast }: RevisionsPanelProps) {
	const [revisions, setRevisions] = useState<Revision[]>([]);
	const [restoring, setRestoring] = useState(false);

	const load = useCallback(() => {
		api<Revision[]>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/revisions`)
			.then(setRevisions)
			.catch(() => setRevisions([]));
	}, [workspaceId, campaignId]);

	useEffect(() => { load(); }, [load, refreshKey]);

	const restore = async (revisionId: string) => {
		const target = revisions.find((r) => r.id === revisionId);
		setRestoring(true);
		try {
			const token = getAccessToken();
			const resp = await fetch(
				`${import.meta.env.VITE_API_URL || ""}/api/workspaces/${workspaceId}/campaigns/${campaignId}/revisions/${revisionId}/restore`,
				{ method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} },
			);
			if (!resp.ok) {
				const errText = await resp.text().catch(() => "");
				onToast?.(`Restore failed (${resp.status}). ${errText || "Please try again."}`, "error");
				return;
			}
			if (!resp.body) {
				onToast?.("Restore failed: empty response. Please try again.", "error");
				return;
			}

			let streamError: string | null = null;
			let restored = false;
			for await (const evt of parseSSEStream(resp.body)) {
				try {
					const data = JSON.parse(evt.data);
					if (evt.event === "error") {
						streamError = typeof data.message === "string" ? data.message : "Restore failed";
					} else if (evt.event === "plan_edit") {
						restored = true;
					}
				} catch {
					// ignore malformed event
				}
			}

			if (streamError) {
				onToast?.(streamError, "error");
				return;
			}

			onRestored();
			onToast?.(
				target
					? `Restored Rev ${target.revisionNumber} — ${target.label}`
					: "Revision restored",
				"success",
			);
			void restored;
		} catch (e) {
			onToast?.(
				e instanceof Error ? `Restore failed: ${e.message}` : "Restore failed. Please try again.",
				"error",
			);
		} finally {
			setRestoring(false);
		}
	};

	return (
		<div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
			<div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
				<p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Revisions</p>
			</div>
			<div className={revisions.length > 5 ? "max-h-[300px] overflow-y-auto" : ""}>
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
