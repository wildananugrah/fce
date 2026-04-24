import type { User } from "@prisma/client";
import type {
	IUserRepository,
	OnboardingPatch,
} from "../../src/interfaces/repositories/user.repository.interface";

export class MockUserRepository implements IUserRepository {
	private users: User[] = [];

	async findById(id: string): Promise<User | null> {
		return this.users.find((u) => u.id === id) ?? null;
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.users.find((u) => u.email === email) ?? null;
	}

	async create(data: {
		email: string;
		passwordHash: string;
		fullName?: string;
		maxWorkspaces?: number;
		maxProjects?: number;
	}): Promise<User> {
		const user: User = {
			id: crypto.randomUUID(),
			email: data.email,
			passwordHash: data.passwordHash,
			fullName: data.fullName ?? null,
			avatarUrl: null,
			isSuperadmin: false,
			status: "active",
			defaultScrapeLanguage: "indonesian",
			maxWorkspaces: data.maxWorkspaces ?? 1,
			maxProjects: data.maxProjects ?? 3,
			emailVerifiedAt: null,
			onboardingWelcomeSeenAt: null,
			onboardingChecklistDismissedAt: null,
			seenCoachMarks: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.users.push(user);
		return user;
	}

	async update(
		id: string,
		data: Partial<
			Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage" | "emailVerifiedAt">
		>,
	): Promise<User> {
		const index = this.users.findIndex((u) => u.id === id);
		if (index === -1) throw new Error("User not found");
		this.users[index] = { ...this.users[index], ...data, updatedAt: new Date() };
		return this.users[index];
	}

	async updateOnboarding(id: string, patch: OnboardingPatch): Promise<User> {
		const index = this.users.findIndex((u) => u.id === id);
		if (index === -1) throw new Error("User not found");
		const user = this.users[index];
		const now = new Date();
		const next = { ...user };
		let changed = false;

		if (patch.welcomeSeen && next.onboardingWelcomeSeenAt === null) {
			next.onboardingWelcomeSeenAt = now;
			changed = true;
		}
		if (patch.checklistDismissed && next.onboardingChecklistDismissedAt === null) {
			next.onboardingChecklistDismissedAt = now;
			changed = true;
		}
		if (patch.markCoachSeen && !next.seenCoachMarks.includes(patch.markCoachSeen)) {
			next.seenCoachMarks = [...next.seenCoachMarks, patch.markCoachSeen];
			changed = true;
		}

		if (!changed) return user;
		next.updatedAt = now;
		this.users[index] = next;
		return next;
	}

	clear(): void {
		this.users = [];
	}
}
