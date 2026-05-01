import type {
	IImageGenerator,
	ImageGenerationInput,
	ImageGenerationOutput,
} from "../interfaces/providers/image-generator.interface";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

interface ImageUrlPart {
	type: "image_url";
	image_url: { url: string };
}

interface TextPart {
	type: "text";
	text: string;
}

type ContentPart = ImageUrlPart | TextPart;

interface ImageChatResponse {
	choices: Array<{
		message: {
			content?: string;
			images?: Array<ImageUrlPart>;
		};
	}>;
	usage?: { prompt_tokens: number; completion_tokens: number };
}

// Parses a data URL "data:<mimeType>;base64,<data>" into its components.
// Falls back to "image/png" if the mime type cannot be determined.
function parseDataUrl(url: string): { imageBase64: string; mimeType: string } | null {
	const match = url.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	return { mimeType: match[1], imageBase64: match[2] };
}

export class OpenRouterImageProvider implements IImageGenerator {
	constructor(
		private apiKey: string,
		public readonly model: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
		const aspect = input.aspectRatio ?? "16:9";
		const promptText = `Generate a single ${aspect} photorealistic image. ${input.prompt}`;

		const userContent: ContentPart[] = [{ type: "text", text: promptText }];

		const body = {
			model: this.model,
			messages: [{ role: "user", content: userContent }],
			modalities: ["image", "text"],
		};

		const response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(`OpenRouterImageProvider: HTTP ${response.status} - ${errText}`);
		}

		const json = (await response.json()) as ImageChatResponse;

		const images = json.choices[0]?.message?.images;
		if (!images || images.length === 0) {
			const snippet = JSON.stringify(json).slice(0, 500);
			throw new Error(
				`OpenRouterImageProvider: response contained no image. Response (truncated): ${snippet}`,
			);
		}

		const imageUrl = images[0].image_url.url;

		// Images may be returned as data URLs or as CDN URLs.
		// Parse data URLs to extract base64 + mime type; for plain URLs, fetch and
		// convert to base64 so consumers always receive the same output shape.
		const parsed = parseDataUrl(imageUrl);
		if (parsed) {
			return parsed;
		}

		// Plain HTTPS URL — download and base64-encode.
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 30_000);
		let imgResponse: Response;
		try {
			imgResponse = await this.fetchFn(imageUrl, { signal: controller.signal });
		} finally {
			clearTimeout(timer);
		}
		if (!imgResponse.ok) {
			throw new Error(`OpenRouterImageProvider: CDN download failed HTTP ${imgResponse.status}`);
		}
		const contentType = imgResponse.headers.get("content-type") ?? "image/png";
		const mimeType = contentType.split(";")[0].trim();
		const buf = await imgResponse.arrayBuffer();
		if (buf.byteLength > 20 * 1024 * 1024) {
			throw new Error(
				`OpenRouterImageProvider: downloaded image exceeds 20MB cap (${buf.byteLength} bytes)`,
			);
		}
		const imageBase64 = Buffer.from(buf).toString("base64");
		return { imageBase64, mimeType };
	}
}
