import type { PrismaClient } from "@prisma/client";
import type { IAdminService } from "../interfaces/services/admin.service.interface";
import type { IAuditService } from "../interfaces/services/audit.service.interface";
import { WORKSPACE_ROLES } from "../constants/roles";
import { hashPassword } from "../utils/password";

interface AdminConfig {
	userDefaultMaxWorkspaces: number;
	userDefaultMaxProjects: number;
}

export class AdminService implements IAdminService {
	constructor(
		private prisma: PrismaClient,
		private audit: IAuditService,
		private config: AdminConfig,
	) {}

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

	async createUser(
		actingUserId: string,
		input: {
			email: string;
			password: string;
			fullName?: string;
			isSuperadmin?: boolean;
		},
	) {
		const email = input.email.trim().toLowerCase();
		if (!email) throw new Error("Email is required");
		if (!input.password || input.password.length < 8) {
			throw new Error("Password must be at least 8 characters");
		}
		const existing = await this.prisma.user.findUnique({ where: { email } });
		if (existing) throw new Error("Email already registered");
		const passwordHash = await hashPassword(input.password);
		const user = await this.prisma.user.create({
			data: {
				email,
				passwordHash,
				fullName: input.fullName ?? null,
				isSuperadmin: input.isSuperadmin ?? false,
				maxWorkspaces: this.config.userDefaultMaxWorkspaces,
				maxProjects: this.config.userDefaultMaxProjects,
			},
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true, createdAt: true },
		});
		await this.audit.log({
			workspaceId: null,
			userId: actingUserId,
			action: "user.create",
			entityType: "user",
			entityId: user.id,
			metadata: {
				email: user.email,
				fullName: user.fullName,
				isSuperadmin: user.isSuperadmin,
			},
		});
		return user;
	}

	async updateUser(
		actingUserId: string,
		userId: string,
		data: { fullName?: string | null; status?: string; isSuperadmin?: boolean; email?: string },
	) {
		const before = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true, status: true, isSuperadmin: true },
		});

		const patch: Record<string, unknown> = {};
		if (typeof data.fullName === "string" || data.fullName === null) patch.fullName = data.fullName;
		if (typeof data.status === "string") patch.status = data.status;
		if (typeof data.isSuperadmin === "boolean") patch.isSuperadmin = data.isSuperadmin;
		if (typeof data.email === "string" && data.email.trim()) {
			patch.email = data.email.trim().toLowerCase();
		}

		const updated = await this.prisma.user.update({
			where: { id: userId },
			data: patch,
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true },
		});

		if (before) {
			// Build the audit-worthy diff. fullName changes are intentionally not audited.
			const changes: Record<string, { from: unknown; to: unknown }> = {};
			if (typeof patch.email === "string" && patch.email !== before.email) {
				changes.email = { from: before.email, to: patch.email };
			}
			if (typeof patch.status === "string" && patch.status !== before.status) {
				changes.status = { from: before.status, to: patch.status };
			}

			if (Object.keys(changes).length > 0) {
				await this.audit.log({
					workspaceId: null,
					userId: actingUserId,
					action: "user.update",
					entityType: "user",
					entityId: userId,
					metadata: { targetEmail: before.email, changes },
				});
			}

			if (typeof patch.isSuperadmin === "boolean" && patch.isSuperadmin !== before.isSuperadmin) {
				await this.audit.log({
					workspaceId: null,
					userId: actingUserId,
					action: patch.isSuperadmin ? "user.superadmin_grant" : "user.superadmin_revoke",
					entityType: "user",
					entityId: userId,
					metadata: { targetEmail: before.email },
				});
			}
		}

		return updated;
	}

	async deleteUser(actingUserId: string, userId: string) {
		const target = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true, fullName: true },
		});
		await this.prisma.user.delete({ where: { id: userId } });
		await this.audit.log({
			workspaceId: null,
			userId: actingUserId,
			action: "user.delete",
			entityType: "user",
			entityId: userId,
			metadata: target ? { email: target.email, fullName: target.fullName } : {},
		});
	}

	async resetPassword(actingUserId: string, userId: string, newPassword: string) {
		if (!newPassword || newPassword.length < 8) {
			throw new Error("Password must be at least 8 characters");
		}
		const target = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		});
		const passwordHash = await hashPassword(newPassword);
		await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
		await this.audit.log({
			workspaceId: null,
			userId: actingUserId,
			action: "user.password_reset",
			entityType: "user",
			entityId: userId,
			metadata: { targetEmail: target?.email ?? null },
		});
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
		_actingUserId: string,
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

	async removeUserFromWorkspace(_actingUserId: string, userId: string, workspaceId: string) {
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

	async createTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		data: { name: string; description?: string },
	) {
		const model = this.getModel(type);
		const item = await (model as any).create({ data });
		await this.audit.log({
			workspaceId: null,
			userId: actingUserId,
			action: "taxonomy.create",
			entityType: AdminService.TAXONOMY_ENTITY_TYPE[type],
			entityId: item.id,
			metadata: { name: data.name, description: data.description ?? null },
		});
		return item;
	}

	async updateTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
		data: { name?: string; description?: string },
	) {
		const model = this.getModel(type);
		const before = await (model as any).findUnique({ where: { id } });
		const item = await (model as any).update({ where: { id }, data });

		const changes: Record<string, { from: unknown; to: unknown }> = {};
		if (before) {
			if (typeof data.name === "string" && data.name !== before.name) {
				changes.name = { from: before.name, to: data.name };
			}
			if (typeof data.description === "string" && data.description !== before.description) {
				changes.description = { from: before.description, to: data.description };
			}
		}

		if (Object.keys(changes).length > 0) {
			await this.audit.log({
				workspaceId: null,
				userId: actingUserId,
				action: "taxonomy.update",
				entityType: AdminService.TAXONOMY_ENTITY_TYPE[type],
				entityId: id,
				metadata: { name: before?.name ?? null, changes },
			});
		}
		return item;
	}

	async deleteTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
	) {
		const model = this.getModel(type);
		const before = await (model as any).findUnique({ where: { id } });
		await (model as any).delete({ where: { id } });
		await this.audit.log({
			workspaceId: null,
			userId: actingUserId,
			action: "taxonomy.delete",
			entityType: AdminService.TAXONOMY_ENTITY_TYPE[type],
			entityId: id,
			metadata: { name: before?.name ?? null },
		});
	}

	// Maps the camelCase taxonomy keys used internally to the snake_case
	// entityType strings stored in audit_logs (so the values are stable,
	// log-readable strings).
	private static readonly TAXONOMY_ENTITY_TYPE: Record<string, string> = {
		framework: "framework",
		hookType: "hook_type",
		tonePreset: "tone_preset",
		visualStyle: "visual_style",
	};

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
