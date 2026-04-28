import type { PrismaClient } from "@prisma/client";
import type {
	IUserRepository,
	OnboardingPatch,
} from "../interfaces/repositories/user.repository.interface";
import type {
	IOnboardingService,
	OnboardingFlags,
	OnboardingProgress,
} from "../interfaces/services/onboarding.service.interface";

export class OnboardingService implements IOnboardingService {
	constructor(
		private userRepository: IUserRepository,
		private prisma: PrismaClient,
	) {}

	async getFlags(userId: string): Promise<OnboardingFlags> {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new Error("User not found");
		return {
			welcomeSeenAt: user.onboardingWelcomeSeenAt,
			checklistDismissedAt: user.onboardingChecklistDismissedAt,
			seenCoachMarks: user.seenCoachMarks,
		};
	}

	async patchFlags(userId: string, patch: OnboardingPatch): Promise<OnboardingFlags> {
		const user = await this.userRepository.updateOnboarding(userId, patch);
		return {
			welcomeSeenAt: user.onboardingWelcomeSeenAt,
			checklistDismissedAt: user.onboardingChecklistDismissedAt,
			seenCoachMarks: user.seenCoachMarks,
		};
	}

	async getProgress(workspaceId: string): Promise<OnboardingProgress> {
		// Filters mirror dashboard.service.ts so "progress" matches what the
		// user actually sees in the lists — archived brands/products/generations
		// are hidden there, so they must not count toward checklist completion.
		// Queries are sequential (not Promise.all) to avoid the Prisma 7 WASM
		// "Out of bounds memory access" bug the dashboard service flagged.
		const brandCount = await this.prisma.brand.count({
			where: { workspaceId, archivedAt: null },
		});
		const productCount = await this.prisma.product.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});
		const topicCount = await this.prisma.contentTopic.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});
		const generationCount = await this.prisma.generationRequest.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});

		return {
			hasBrand: brandCount > 0,
			hasProduct: productCount > 0,
			hasTopic: topicCount > 0,
			hasGenerated: generationCount > 0,
		};
	}
}
