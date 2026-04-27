import type { OnboardingPatch } from "../repositories/user.repository.interface";

export interface OnboardingFlags {
	welcomeSeenAt: Date | null;
	checklistDismissedAt: Date | null;
	seenCoachMarks: string[];
}

export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasGenerated: boolean;
}

export interface IOnboardingService {
	getFlags(userId: string): Promise<OnboardingFlags>;
	patchFlags(userId: string, patch: OnboardingPatch): Promise<OnboardingFlags>;
	getProgress(workspaceId: string): Promise<OnboardingProgress>;
}
