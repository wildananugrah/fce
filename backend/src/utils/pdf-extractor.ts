/**
 * Fetches a PDF by URL and extracts its text via `pdf-parse`. Used for chat
 * attachments (capped at PDF_EXTRACT_MAX_CHARS) and the campaign brief PDF
 * pipeline.
 */
export async function extractPdfText(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Could not fetch PDF from ${url}: ${response.status}`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	const { PDFParse } = await import("pdf-parse");
	const parser = new PDFParse({ data: new Uint8Array(buffer) });
	await parser.load();
	const result = await parser.getText();
	return result.text;
}

/**
 * Truncate extracted text to a character cap, appending a notice if trimmed.
 * Used to keep AI context windows bounded and DB row sizes small.
 */
export function truncateExtractedText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[truncated — original was ${text.length} chars]`;
}

export const PDF_EXTRACT_MAX_CHARS = 10_000;
