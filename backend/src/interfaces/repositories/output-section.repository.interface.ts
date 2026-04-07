export interface IOutputSectionRepository {
	findByOutputId(outputId: string): Promise<OutputSectionRecord[]>;
	findById(id: string): Promise<OutputSectionRecord | null>;
	createMany(outputId: string, sections: CreateOutputSectionInput[]): Promise<void>;
	update(id: string, data: { contentText: string }): Promise<OutputSectionRecord>;
	deleteByOutputId(outputId: string): Promise<void>;
}

export interface OutputSectionRecord {
	id: string;
	outputId: string;
	sectionType: string;
	sectionOrder: number;
	contentText: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateOutputSectionInput {
	sectionType: string;
	sectionOrder: number;
	contentText: string;
}
