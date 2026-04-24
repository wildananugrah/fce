import { api } from "./api";

export interface OnboardingFlags {
	welcomeSeenAt: string | null;
	checklistDismissedAt: string | null;
	seenCoachMarks: string[];
}

export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasGenerated: boolean;
}

export interface OnboardingPatch {
	welcomeSeen?: boolean;
	checklistDismissed?: boolean;
	markCoachSeen?: string;
}

export function getOnboardingFlags(): Promise<OnboardingFlags> {
	return api<OnboardingFlags>("/api/users/me/onboarding");
}

export function patchOnboardingFlags(patch: OnboardingPatch): Promise<OnboardingFlags> {
	return api<OnboardingFlags>("/api/users/me/onboarding", {
		method: "PATCH",
		body: JSON.stringify(patch),
	});
}

export function getOnboardingProgress(workspaceId: string): Promise<OnboardingProgress> {
	return api<OnboardingProgress>(`/api/workspaces/${workspaceId}/onboarding-progress`);
}
