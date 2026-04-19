import type { PrismaClient } from "@prisma/client";
import type { IAdminService } from "../interfaces/services/admin.service.interface";
import { WORKSPACE_ROLES } from "../constants/roles";
import { hashPassword } from "../utils/password";

export class AdminService implements IAdminService {
	constructor(private prisma: PrismaClient) {}

	async listUsers() {
		return this.prisma.user.findMany({
			select: {
				id: true,
				email: true,
				fullName: true,
				status: true,
				isSuperadmin: true,
				createdAt: true,
			},
			orderBy: { createdAt: "desc" },
		});
	}

	async createUser(input: {
		email: string;
		password: string;
		fullName?: string;
		isSuperadmin?: boolean;
	}) {
		const email = input.email.trim().toLowerCase();
		if (!email) throw new Error("Email is required");
		if (!input.password || input.password.length < 8) {
			throw new Error("Password must be at least 8 characters");
		}
		const existing = await this.prisma.user.findUnique({ where: { email } });
		if (existing) throw new Error("Email already registered");
		const passwordHash = await hashPassword(input.password);
		return this.prisma.user.create({
			data: {
				email,
				passwordHash,
				fullName: input.fullName ?? null,
				isSuperadmin: input.isSuperadmin ?? false,
			},
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true, createdAt: true },
		});
	}

	async updateUser(userId: string, data: any) {
		const patch: Record<string, unknown> = {};
		if (typeof data.fullName === "string" || data.fullName === null) patch.fullName = data.fullName;
		if (typeof data.status === "string") patch.status = data.status;
		if (typeof data.isSuperadmin === "boolean") patch.isSuperadmin = data.isSuperadmin;
		if (typeof data.email === "string" && data.email.trim()) {
			patch.email = data.email.trim().toLowerCase();
		}
		return this.prisma.user.update({
			where: { id: userId },
			data: patch,
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true },
		});
	}

	async deleteUser(userId: string) {
		await this.prisma.user.delete({ where: { id: userId } });
	}

	async resetPassword(userId: string, newPassword: string) {
		if (!newPassword || newPassword.length < 8) {
			throw new Error("Password must be at least 8 characters");
		}
		const passwordHash = await hashPassword(newPassword);
		await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
	}

	async listUserWorkspaces(userId: string) {
		const rows = await this.prisma.userWorkspaceRole.findMany({
			where: { userId },
			include: { workspace: { select: { id: true, name: true, slug: true } } },
			orderBy: { createdAt: "asc" },
		});
		return rows.map((r) => ({
			workspaceId: r.workspace.id,
			workspaceName: r.workspace.name,
			workspaceSlug: r.workspace.slug,
			role: r.role,
		}));
	}

	async setUserWorkspaceRole(
		userId: string,
		workspaceId: string,
		role: "admin" | "member",
	) {
		if (role !== WORKSPACE_ROLES.ADMIN && role !== WORKSPACE_ROLES.MEMBER) {
			throw new Error(`Unknown role: ${role}`);
		}
		await this.prisma.userWorkspaceRole.upsert({
			where: { userId_workspaceId: { userId, workspaceId } },
			update: { role },
			create: { userId, workspaceId, role },
		});
	}

	async removeUserFromWorkspace(userId: string, workspaceId: string) {
		await this.prisma.userWorkspaceRole
			.delete({ where: { userId_workspaceId: { userId, workspaceId } } })
			.catch(() => {
				// Not a member — no-op
			});
		// Also remove any project memberships in that workspace so the user is
		// fully detached.
		await this.prisma.userProjectMembership.deleteMany({
			where: { userId, project: { workspaceId } },
		});
	}

	async listAuditLogs(workspaceId?: string, limit = 50) {
		return this.prisma.auditLog.findMany({
			where: workspaceId ? { workspaceId } : {},
			include: { user: { select: { email: true, fullName: true } } },
			orderBy: { createdAt: "desc" },
			take: limit,
		});
	}

	async createTaxonomyItem(type: string, data: { name: string; description?: string }) {
		const model = this.getModel(type);
		return (model as any).create({ data });
	}

	async updateTaxonomyItem(type: string, id: string, data: any) {
		const model = this.getModel(type);
		return (model as any).update({ where: { id }, data });
	}

	async deleteTaxonomyItem(type: string, id: string) {
		const model = this.getModel(type);
		await (model as any).delete({ where: { id } });
	}

	private getModel(type: string) {
		switch (type) {
			case "framework":
				return this.prisma.framework;
			case "hookType":
				return this.prisma.hookType;
			case "tonePreset":
				return this.prisma.tonePreset;
			case "visualStyle":
				return this.prisma.visualStyle;
			default:
				throw new Error(`Unknown taxonomy type: ${type}`);
		}
	}
}
