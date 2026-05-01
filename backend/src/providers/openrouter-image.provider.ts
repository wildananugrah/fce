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

		// Guard against missing usage — treat as null (defensive pattern).
		const _usage = json.usage ?? null;

		const images = json.choices[0]?.message?.images;
		if (!images || images.length === 0) {
			throw new Error(
				`OpenRouterImageProvider: no image in response. Full response: ${JSON.stringify(json)}`,
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
		const imgResponse = await this.fetchFn(imageUrl);
		if (!imgResponse.ok) {
			throw new Error(
				`OpenRouterImageProvider: could not download generated image from ${imageUrl}: HTTP ${imgResponse.status}`,
			);
		}
		const contentType = imgResponse.headers.get("content-type") ?? "image/png";
		const mimeType = contentType.split(";")[0].trim();
		const arrayBuffer = await imgResponse.arrayBuffer();
		const imageBase64 = Buffer.from(arrayBuffer).toString("base64");
		return { imageBase64, mimeType };
	}
}
