import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Sparkles } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";

interface Item {
	key: "hasBrand" | "hasProduct" | "hasTopic" | "hasGenerated";
	label: string;
	to: string;
}

const ITEMS: Item[] = [
	{ key: "hasBrand", label: "Create your first brand", to: "/brands/new" },
	{ key: "hasProduct", label: "Add a product to your brand", to: "/products" },
	{ key: "hasTopic", label: "Generate your first topic", to: "/topics" },
	{ key: "hasGenerated", label: "Generate your first content", to: "/generate" },
];

const HIDE_KEY = "fce.onboarding.checklist.hidden";

export function GettingStartedChecklist() {
	const { welcomeSeenAt, checklistDismissedAt, progress, dismissChecklist } = useOnboarding();

	// Local hide state (localStorage). Doesn't touch the backend.
	const [hidden, setHidden] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem(HIDE_KEY) === "1";
	});

	// Celebration modal triggers when all four progress items become true.
	// Use a ref to avoid re-triggering on subsequent re-renders after we've
	// already shown the modal once for this session.
	const [showCelebration, setShowCelebration] = useState(false);
	const triggeredRef = useRef(false);

	useEffect(() => {
		if (!progress) return;
		const allDone =
			progress.hasBrand &&
			progress.hasProduct &&
			progress.hasTopic &&
			progress.hasGenerated;
		if (allDone && !triggeredRef.current) {
			triggeredRef.current = true;
			setShowCelebration(true);
		}
	}, [progress]);

	// Render guards.
	if (welcomeSeenAt === null) return null;
	if (checklistDismissedAt !== null) return null;
	if (!progress) return null;

	function hide() {
		try {
			window.localStorage.setItem(HIDE_KEY, "1");
		} catch {
			// localStorage disabled or full — fall back to in-memory state.
		}
		setHidden(true);
	}

	function show() {
		try {
			window.localStorage.removeItem(HIDE_KEY);
		} catch {
			// ignore
		}
		setHidden(false);
	}

	async function handleCelebrationClose() {
		setShowCelebration(false);
		await dismissChecklist();
	}

	// Order matters: the celebration modal takes precedence over the
	// hidden-show-button state. Even if the user hid the checklist, the modal
	// pops up the moment they finish the last step.
	if (showCelebration) {
		return <CompletionModal onClose={handleCelebrationClose} />;
	}

	if (hidden) {
		return (
			<button
				type="button"
				onClick={show}
				aria-label="Show getting started"
				className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50 hover:shadow-lg"
			>
				<Sparkles size={16} className="text-indigo-600" />
				Show getting started
			</button>
		);
	}

	return (
		<div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
			<div className="flex items-start justify-between">
				<h3 className="text-sm font-semibold text-gray-900">Getting started</h3>
				<button
					type="button"
					onClick={hide}
					aria-label="Hide getting started"
					className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
				>
					<X size={16} />
				</button>
			</div>

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
		</div>
	);
}

interface CompletionModalProps {
	onClose: () => void | Promise<void>;
}

function CompletionModal({ onClose }: CompletionModalProps) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
			role="dialog"
			aria-modal="true"
			aria-labelledby="completion-modal-title"
		>
			<div className="w-[min(520px,90vw)] rounded-2xl bg-white p-8 shadow-2xl">
				<h2
					id="completion-modal-title"
					className="text-2xl font-semibold text-gray-900"
				>
					🎉 You're all set!
				</h2>
				<p className="mt-3 text-gray-600">
					You've created a brand, added a product, generated your first topic,
					and shipped your first content. The Getting Started checklist won't
					show again — you can find help via the <strong>?</strong> button on
					each page.
				</p>
				<div className="mt-8 flex justify-end">
					<button
						type="button"
						onClick={() => onClose()}
						className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
					>
						Sounds good
					</button>
				</div>
			</div>
		</div>
	);
}
