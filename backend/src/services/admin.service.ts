import type { PrismaClient } from "@prisma/client";
import type { IAdminService } from "../interfaces/services/admin.service.interface";

export class AdminService implements IAdminService {
	constructor(private prisma: PrismaClient) {}

	async listUsers() {
		return this.prisma.user.findMany({
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true, createdAt: true },
			orderBy: { createdAt: "desc" },
		});
	}

	async updateUser(userId: string, data: any) {
		return this.prisma.user.update({
			where: { id: userId },
			data,
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true },
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
			case "framework": return this.prisma.framework;
			case "hookType": return this.prisma.hookType;
			case "tonePreset": return this.prisma.tonePreset;
			case "visualStyle": return this.prisma.visualStyle;
			default: throw new Error(`Unknown taxonomy type: ${type}`);
		}
	}
}
