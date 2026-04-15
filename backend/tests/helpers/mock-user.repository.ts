import type { User } from "@prisma/client";
import type { IUserRepository } from "../../src/interfaces/repositories/user.repository.interface";

export class MockUserRepository implements IUserRepository {
	private users: User[] = [];

	async findById(id: string): Promise<User | null> {
		return this.users.find((u) => u.id === id) ?? null;
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.users.find((u) => u.email === email) ?? null;
	}

	async create(data: { email: string; passwordHash: string; fullName?: string }): Promise<User> {
		const user: User = {
			id: crypto.randomUUID(),
			email: data.email,
			passwordHash: data.passwordHash,
			fullName: data.fullName ?? null,
			avatarUrl: null,
			isSuperadmin: false,
			status: "active",
			defaultScrapeLanguage: "indonesian",
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.users.push(user);
		return user;
	}

	async update(
		id: string,
		data: Partial<Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage">>,
	): Promise<User> {
		const index = this.users.findIndex((u) => u.id === id);
		if (index === -1) throw new Error("User not found");
		this.users[index] = { ...this.users[index], ...data, updatedAt: new Date() };
		return this.users[index];
	}

	clear(): void {
		this.users = [];
	}
}
