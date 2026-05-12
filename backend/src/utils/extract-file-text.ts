const SUPPORTED_TYPES = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
];

export async function extractFileText(file: File): Promise<string> {
	// Normalize MIME type — Bun appends charset params (e.g. "text/plain;charset=utf-8")
	const mimeType = file.type.split(";")[0].trim();

	if (!SUPPORTED_TYPES.includes(mimeType)) {
		throw new Error(`Unsupported file type: ${file.type}`);
	}

	const buffer = Buffer.from(await file.arrayBuffer());

	if (mimeType === "application/pdf") {
		const { PDFParse } = await import("pdf-parse");
		const parser = new PDFParse({ data: new Uint8Array(buffer) });
		const result = await parser.getText();
		return result.text;
	}

	if (
		mimeType ===
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	) {
		const mammoth = await import("mammoth");
		const result = await mammoth.extractRawText({ buffer });
		return result.value;
	}

	// text/plain
	return buffer.toString("utf-8");
}
