import type { PrismaClient, User } from "@prisma/client";
import type {
	IUserRepository,
	OnboardingPatch,
} from "../interfaces/repositories/user.repository.interface";

export class UserRepository implements IUserRepository {
	constructor(private prisma: PrismaClient) {}

	async findById(id: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { id } });
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { email } });
	}

	async create(data: {
		email: string;
		passwordHash: string;
		fullName?: string;
		maxWorkspaces?: number;
		maxProjects?: number;
	}): Promise<User> {
		return this.prisma.user.create({ data });
	}

	async update(
		id: string,
		data: Partial<
			Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage" | "emailVerifiedAt">
		>,
	): Promise<User> {
		return this.prisma.user.update({ where: { id }, data });
	}

	async updateOnboarding(id: string, patch: OnboardingPatch): Promise<User> {
		// Each flag is set-once. We read, compute the delta, and write. Doing
		// this in a single query would require COALESCE + array_append SQL
		// which Prisma doesn't expose cleanly — one extra round-trip keeps the
		// code in the ORM and the behavior observable.
		const user = await this.prisma.user.findUnique({ where: { id } });
		if (!user) throw new Error("User not found");

		const now = new Date();
		const data: Record<string, unknown> = {};

		if (patch.welcomeSeen && user.onboardingWelcomeSeenAt === null) {
			data.onboardingWelcomeSeenAt = now;
		}
		if (patch.checklistDismissed && user.onboardingChecklistDismissedAt === null) {
			data.onboardingChecklistDismissedAt = now;
		}
		if (patch.markCoachSeen && !user.seenCoachMarks.includes(patch.markCoachSeen)) {
			data.seenCoachMarks = [...user.seenCoachMarks, patch.markCoachSeen];
		}

		if (Object.keys(data).length === 0) return user;
		return this.prisma.user.update({ where: { id }, data });
	}
}
