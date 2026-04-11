import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IDocumentRepository } from "../interfaces/repositories/document.repository.interface";

export class LinkScrapingJob {
	constructor(
		private documentRepository: IDocumentRepository,
		private logger: ILogger,
	) {}

	async handle(data: { documentId: string; url: string }): Promise<void> {
		const { documentId, url } = data;
		try {
			this.logger.info("Starting link scraping", { documentId, url });
			await this.documentRepository.updateExtractionStatus(documentId, "processing");

			const response = await fetch(url, {
				headers: {
					"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.9",
				},
				signal: AbortSignal.timeout(15000),
				redirect: "follow",
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
			}

			const html = await response.text();

			// Basic HTML text extraction — strip tags and normalize whitespace
			const text = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/&nbsp;/g, " ")
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/\s+/g, " ")
				.trim();

			if (!text) {
				throw new Error("No text content extracted from URL");
			}

			const chunks = this.chunkText(text, 500, 50);
			await this.documentRepository.createChunks(
				documentId,
				chunks.map((content, index) => ({ chunkIndex: index, contentText: content })),
			);

			await this.documentRepository.updateExtractionStatus(documentId, "completed");
			this.logger.info("Link scraping completed", { documentId, chunkCount: chunks.length });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.warn(`Link scraping failed, storing URL as reference: ${message}`, { documentId, url });

			// Fallback: store the URL itself as a reference chunk so the AI at least sees it
			try {
				await this.documentRepository.createChunks(documentId, [
					{
						chunkIndex: 0,
						contentText: `Reference URL: ${url} (Note: page content could not be scraped due to bot protection. Use this URL as context.)`,
					},
				]);
				await this.documentRepository.updateExtractionStatus(documentId, "completed");
				this.logger.info("Link stored as URL reference (fallback)", { documentId, url });
			} catch {
				await this.documentRepository.updateExtractionStatus(documentId, "failed");
			}
		}
	}

	private chunkText(text: string, chunkSize: number, overlap: number): string[] {
		const chunks: string[] = [];
		let start = 0;
		while (start < text.length) {
			chunks.push(text.slice(start, start + chunkSize));
			start += chunkSize - overlap;
		}
		return chunks;
	}
}
