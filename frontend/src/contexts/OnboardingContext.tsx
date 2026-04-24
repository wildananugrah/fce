import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import {
	getOnboardingFlags,
	patchOnboardingFlags,
	getOnboardingProgress,
	type OnboardingFlags,
	type OnboardingProgress,
} from "../services/onboarding.api";

interface OnboardingContextValue {
	welcomeSeenAt: Date | null;
	checklistDismissedAt: Date | null;
	seenCoachMarks: string[];
	progress: OnboardingProgress | null; // null while loading
	dismissWelcome: () => Promise<void>;
	dismissChecklist: () => Promise<void>;
	markCoachSeen: (pageKey: string) => Promise<void>;
	hasSeenCoach: (pageKey: string) => boolean;
	refreshProgress: () => Promise<void>;
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function parseFlags(raw: OnboardingFlags | null) {
	return {
		welcomeSeenAt: raw?.welcomeSeenAt ? new Date(raw.welcomeSeenAt) : null,
		checklistDismissedAt: raw?.checklistDismissedAt ? new Date(raw.checklistDismissedAt) : null,
		seenCoachMarks: raw?.seenCoachMarks ?? [],
	};
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { activeWorkspace } = useWorkspace();

	const [flags, setFlags] = useState(() => parseFlags(null));
	const [progress, setProgress] = useState<OnboardingProgress | null>(null);

	// Load flags when auth resolves. Silently ignore errors — a failed load
	// just means the welcome modal won't appear until the next successful
	// fetch, which is better than crashing the app.
	useEffect(() => {
		if (authLoading) return;
		if (!user) {
			setFlags(parseFlags(null));
			setProgress(null);
			return;
		}
		getOnboardingFlags()
			.then((raw) => setFlags(parseFlags(raw)))
			.catch(() => {
				// swallow — see comment above
			});
	}, [authLoading, user]);

	const refreshProgress = useCallback(async () => {
		if (!activeWorkspace) return;
		try {
			const p = await getOnboardingProgress(activeWorkspace.id);
			setProgress(p);
		} catch {
			// ignore — stale progress is acceptable
		}
	}, [activeWorkspace]);

	// Refresh progress when the active workspace changes.
	useEffect(() => {
		if (!user) return;
		refreshProgress();
	}, [user, activeWorkspace?.id, refreshProgress]);

	const dismissWelcome = useCallback(async () => {
		// Optimistic update — snap the flag so the modal closes immediately,
		// then confirm server-side. Roll back on failure.
		const prev = flags.welcomeSeenAt;
		setFlags((f) => ({ ...f, welcomeSeenAt: new Date() }));
		try {
			const raw = await patchOnboardingFlags({ welcomeSeen: true });
			setFlags(parseFlags(raw));
		} catch {
			setFlags((f) => ({ ...f, welcomeSeenAt: prev }));
		}
	}, [flags.welcomeSeenAt]);

	const dismissChecklist = useCallback(async () => {
		const prev = flags.checklistDismissedAt;
		setFlags((f) => ({ ...f, checklistDismissedAt: new Date() }));
		try {
			const raw = await patchOnboardingFlags({ checklistDismissed: true });
			setFlags(parseFlags(raw));
		} catch {
			setFlags((f) => ({ ...f, checklistDismissedAt: prev }));
		}
	}, [flags.checklistDismissedAt]);

	const markCoachSeen = useCallback(
		async (pageKey: string) => {
			if (flags.seenCoachMarks.includes(pageKey)) return;
			const prev = flags.seenCoachMarks;
			setFlags((f) => ({ ...f, seenCoachMarks: [...f.seenCoachMarks, pageKey] }));
			try {
				const raw = await patchOnboardingFlags({ markCoachSeen: pageKey });
				setFlags(parseFlags(raw));
			} catch {
				setFlags((f) => ({ ...f, seenCoachMarks: prev }));
			}
		},
		[flags.seenCoachMarks],
	);

	const hasSeenCoach = useCallback(
		(pageKey: string) => flags.seenCoachMarks.includes(pageKey),
		[flags.seenCoachMarks],
	);

	return (
		<OnboardingContext.Provider
			value={{
				welcomeSeenAt: flags.welcomeSeenAt,
				checklistDismissedAt: flags.checklistDismissedAt,
				seenCoachMarks: flags.seenCoachMarks,
				progress,
				dismissWelcome,
				dismissChecklist,
				markCoachSeen,
				hasSeenCoach,
				refreshProgress,
			}}
		>
			{children}
		</OnboardingContext.Provider>
	);
}
