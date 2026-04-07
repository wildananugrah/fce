import type { PrismaClient } from "@prisma/client";
import type {
	CreateOutputSectionInput,
	IOutputSectionRepository,
	OutputSectionRecord,
} from "../interfaces/repositories/output-section.repository.interface";

export class OutputSectionRepository implements IOutputSectionRepository {
	constructor(private prisma: PrismaClient) {}

	async findByOutputId(outputId: string): Promise<OutputSectionRecord[]> {
		return this.prisma.outputSection.findMany({
			where: { outputId },
			orderBy: { sectionOrder: "asc" },
		});
	}

	async findById(id: string): Promise<OutputSectionRecord | null> {
		return this.prisma.outputSection.findUnique({ where: { id } });
	}

	async createMany(outputId: string, sections: CreateOutputSectionInput[]): Promise<void> {
		await this.prisma.outputSection.createMany({
			data: sections.map((s) => ({
				outputId,
				sectionType: s.sectionType,
				sectionOrder: s.sectionOrder,
				contentText: s.contentText,
			})),
		});
	}

	async update(id: string, data: { contentText: string }): Promise<OutputSectionRecord> {
		return this.prisma.outputSection.update({ where: { id }, data });
	}

	async deleteByOutputId(outputId: string): Promise<void> {
		await this.prisma.outputSection.deleteMany({ where: { outputId } });
	}
}
