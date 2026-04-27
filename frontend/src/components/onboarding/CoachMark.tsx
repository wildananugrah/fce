import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HelpCircle, X } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";

interface CoachMarkProps {
	pageKey: string;
	title: string;
	body: string;
}

export function CoachMark({ pageKey, title, body }: CoachMarkProps) {
	const { hasSeenCoach, markCoachSeen } = useOnboarding();
	const [searchParams, setSearchParams] = useSearchParams();
	const forceShow = searchParams.get("help") === "1";

	// Auto-show exactly once per page. Local state controls visibility so
	// closing the card doesn't require a context refetch.
	const [visible, setVisible] = useState(() => !hasSeenCoach(pageKey));

	// If the Help button flips ?help=1 onto the URL, re-open the card even if
	// it was previously dismissed. Then strip the param so refresh doesn't
	// re-trigger it. We need both state updates in a single effect to avoid
	// URL flickering or double-renders.
	useEffect(() => {
		if (forceShow) {
			const newParams = new URLSearchParams(searchParams);
			newParams.delete("help");
			setSearchParams(newParams, { replace: true });
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setVisible(true);
		}
	}, [forceShow, searchParams, setSearchParams]);

	if (!visible) return null;

	async function handleClose() {
		setVisible(false);
		// Only persist if this was an auto-show, not a forced re-show. Either
		// way, calling markCoachSeen is safe — the backend dedupes.
		await markCoachSeen(pageKey);
	}

	return (
		<div className="mb-4 flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
			<HelpCircle className="mt-0.5 shrink-0 text-indigo-600" size={20} />
			<div className="flex-1">
				<h4 className="text-sm font-semibold text-indigo-900">{title}</h4>
				<p className="mt-1 text-sm text-indigo-800">{body}</p>
			</div>
			<button
				type="button"
				onClick={handleClose}
				aria-label="Dismiss tip"
				className="rounded p-1 text-indigo-600 hover:bg-indigo-100"
			>
				<X size={16} />
			</button>
		</div>
	);
}
