import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";

interface Item {
	key: "hasBrand" | "hasProduct" | "hasGenerated";
	label: string;
	to: string;
}

const ITEMS: Item[] = [
	{ key: "hasBrand", label: "Create your first brand", to: "/brands/new" },
	{ key: "hasProduct", label: "Add a product to your brand", to: "/products" },
	{ key: "hasGenerated", label: "Generate your first content", to: "/generate" },
];

export function GettingStartedChecklist() {
	const { welcomeSeenAt, checklistDismissedAt, progress, dismissChecklist } = useOnboarding();
	const [celebrating, setCelebrating] = useState(false);

	// Auto-dismiss ~2 seconds after all three items complete — gives the user
	// a moment to see the 🎉 state before the card disappears forever.
	useEffect(() => {
		if (!progress) return;
		if (progress.hasBrand && progress.hasProduct && progress.hasGenerated && !celebrating) {
			setCelebrating(true);
			const t = setTimeout(() => {
				dismissChecklist();
			}, 2000);
			return () => clearTimeout(t);
		}
	}, [progress, celebrating, dismissChecklist]);

	// Guard: wait for the welcome modal to be handled first, and don't show if
	// already dismissed or while progress is still loading.
	if (welcomeSeenAt === null) return null;
	if (checklistDismissedAt !== null) return null;
	if (!progress) return null;

	const allDone = progress.hasBrand && progress.hasProduct && progress.hasGenerated;

	return (
		<div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
			<div className="flex items-start justify-between">
				<h3 className="text-sm font-semibold text-gray-900">
					{allDone ? "🎉 You're all set — great work." : "Getting started"}
				</h3>
				<button
					type="button"
					onClick={() => dismissChecklist()}
					aria-label="Dismiss"
					className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
				>
					<X size={16} />
				</button>
			</div>

			{!allDone && (
				<ul className="mt-4 space-y-3">
					{ITEMS.map((item) => {
						const done = Boolean(progress[item.key]);
						return (
							<li key={item.key} className="flex items-center gap-3">
								<span
									className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
										done
											? "border-green-600 bg-green-600 text-white"
											: "border-gray-300 bg-white"
									}`}
								>
									{done && <Check size={12} />}
								</span>
								{done ? (
									<span className="text-sm text-gray-500 line-through">{item.label}</span>
								) : (
									<Link
										to={item.to}
										className="text-sm text-gray-800 hover:text-indigo-700 hover:underline"
									>
										{item.label}
									</Link>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
