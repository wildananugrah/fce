import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export class DocumentExtractionJob {
	constructor(
		private documentRepository: IDocumentRepository,
		private logger: ILogger,
	) {}

	async handle(data: {
		documentId: string;
		fileUrl: string;
		fileName: string;
		fileType: string;
	}) {
		const { documentId, fileUrl, fileName, fileType } = data;
		try {
			this.logger.info("Starting document extraction", { documentId, fileName });
			await this.documentRepository.updateExtractionStatus(documentId, "processing");

			let text = "";
			if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
				text = await this.extractPdf(fileUrl);
			} else if (
				fileType ===
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
				fileName.endsWith(".docx")
			) {
				text = await this.extractDocx(fileUrl);
			} else if (fileType === "text/plain" || fileName.endsWith(".txt")) {
				text = await this.extractText(fileUrl);
			} else {
				throw new Error(`Unsupported file type: ${fileType}`);
			}

			const chunks = this.chunkText(text, 500, 50);
			await this.documentRepository.createChunks(
				documentId,
				chunks.map((content, index) => ({ chunkIndex: index, contentText: content })),
			);
			await this.documentRepository.updateExtractionStatus(documentId, "completed");
			this.logger.info("Document extraction completed", {
				documentId,
				chunkCount: chunks.length,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error("Document extraction failed", { documentId, error: message });
			await this.documentRepository.updateExtractionStatus(documentId, "failed");
		}
	}

	private async extractPdf(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		const buffer = Buffer.from(await response.arrayBuffer());
		const pdfParse = (await import("pdf-parse")).default;
		const result = await pdfParse(buffer);
		return result.text;
	}

	private async extractDocx(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		const buffer = Buffer.from(await response.arrayBuffer());
		const mammoth = await import("mammoth");
		const result = await mammoth.extractRawText({ buffer });
		return result.value;
	}

	private async extractText(fileUrl: string): Promise<string> {
		const response = await fetch(fileUrl);
		return response.text();
	}

	private chunkText(text: string, chunkSize: number, overlap: number): string[] {
		const words = text.split(/\s+/).filter((w) => w.length > 0);
		if (words.length <= chunkSize) return [words.join(" ")];
		const chunks: string[] = [];
		let start = 0;
		while (start < words.length) {
			const end = Math.min(start + chunkSize, words.length);
			chunks.push(words.slice(start, end).join(" "));
			start += chunkSize - overlap;
		}
		return chunks;
	}
}
