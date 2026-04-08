import type {
	PrismaClient,
	UserWorkspaceRole,
	Workspace,
	WorkspaceInvitation,
} from "@prisma/client";
import type { IWorkspaceRepository } from "../interfaces/repositories/workspace.repository.interface";

export class WorkspaceRepository implements IWorkspaceRepository {
	constructor(private prisma: PrismaClient) {}

	async findById(id: string): Promise<Workspace | null> {
		return this.prisma.workspace.findUnique({ where: { id } });
	}

	async findBySlug(slug: string): Promise<Workspace | null> {
		return this.prisma.workspace.findUnique({ where: { slug } });
	}

	async findByUserId(userId: string): Promise<(Workspace & { roles: { role: string }[] })[]> {
		const rows = await this.prisma.userWorkspaceRole.findMany({
			where: { userId },
			include: {
				workspace: {
					include: {
						roles: {
							where: { userId },
							select: { role: true },
						},
					},
				},
			},
		});

		return rows.map((row) => row.workspace);
	}

	async create(data: { name: string; slug: string; description?: string }): Promise<Workspace> {
		return this.prisma.workspace.create({ data });
	}

	async update(
		id: string,
		data: Partial<
			Pick<Workspace, "name" | "description" | "logoUrl" | "avatarColor" | "avatarEmoji" | "status">
		>,
	): Promise<Workspace> {
		return this.prisma.workspace.update({ where: { id }, data });
	}

	async delete(id: string): Promise<void> {
		await this.prisma.workspace.delete({ where: { id } });
	}

	async findRole(userId: string, workspaceId: string): Promise<UserWorkspaceRole | null> {
		return this.prisma.userWorkspaceRole.findUnique({
			where: { userId_workspaceId: { userId, workspaceId } },
		});
	}

	async findMembers(workspaceId: string): Promise<
		(UserWorkspaceRole & {
			user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
		})[]
	> {
		return this.prisma.userWorkspaceRole.findMany({
			where: { workspaceId },
			include: {
				user: {
					select: { id: true, email: true, fullName: true, avatarUrl: true },
				},
			},
		});
	}

	async addMember(workspaceId: string, userId: string, role: string): Promise<UserWorkspaceRole> {
		return this.prisma.userWorkspaceRole.create({
			data: { workspaceId, userId, role },
		});
	}

	async removeMember(workspaceId: string, userId: string): Promise<void> {
		await this.prisma.userWorkspaceRole.delete({
			where: { userId_workspaceId: { userId, workspaceId } },
		});
	}

	async findInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
		return this.prisma.workspaceInvitation.findMany({ where: { workspaceId } });
	}

	async findPendingInvitationsByEmail(
		email: string,
	): Promise<(WorkspaceInvitation & { workspace: Workspace })[]> {
		return this.prisma.workspaceInvitation.findMany({
			where: { email, status: "pending" },
			include: { workspace: true },
		});
	}

	async findInvitationById(id: string): Promise<WorkspaceInvitation | null> {
		return this.prisma.workspaceInvitation.findUnique({ where: { id } });
	}

	async createInvitation(data: {
		workspaceId: string;
		email: string;
		role: string;
		invitedBy: string;
	}): Promise<WorkspaceInvitation> {
		return this.prisma.workspaceInvitation.create({ data });
	}

	async updateInvitation(id: string, data: { status: string }): Promise<WorkspaceInvitation> {
		return this.prisma.workspaceInvitation.update({ where: { id }, data });
	}
}
