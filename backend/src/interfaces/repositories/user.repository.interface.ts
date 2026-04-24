import type { User } from "@prisma/client";

export interface IUserRepository {
	findById(id: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	create(data: {
		email: string;
		passwordHash: string;
		fullName?: string;
		maxWorkspaces?: number;
		maxProjects?: number;
	}): Promise<User>;
	update(
		id: string,
		data: Partial<
			Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage" | "emailVerifiedAt">
		>,
	): Promise<User>;
}
