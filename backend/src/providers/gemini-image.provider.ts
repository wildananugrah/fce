import { GoogleGenAI, Modality } from "@google/genai";
import type {
	IImageGenerator,
	ImageGenerationInput,
	ImageGenerationOutput,
} from "../interfaces/providers/image-generator.interface";

// Uses Gemini 2.5 Flash Image (aka "Nano Banana") via generateContent with
// IMAGE response modality. This works on standard Gemini Developer API keys,
// unlike Imagen 3 which requires Vertex AI / paid tier.
export class GeminiImageProvider implements IImageGenerator {
	private ai: GoogleGenAI;

	constructor(
		apiKey: string,
		public readonly model: string = "gemini-2.5-flash-image",
	) {
		this.ai = new GoogleGenAI({ apiKey });
	}

	async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
		const aspect = input.aspectRatio ?? "16:9";
		const prompt = `Generate a single ${aspect} photorealistic image. ${input.prompt}`;

		const response = await this.ai.models.generateContent({
			model: this.model,
			contents: prompt,
			config: {
				responseModalities: [Modality.IMAGE, Modality.TEXT],
			},
		});

		const parts = response.candidates?.[0]?.content?.parts ?? [];
		for (const part of parts) {
			const inline = part.inlineData;
			if (inline?.data) {
				return {
					imageBase64: inline.data,
					mimeType: inline.mimeType ?? "image/png",
				};
			}
		}

		const textResponse = parts
			.map((p) => p.text)
			.filter(Boolean)
			.join(" ")
			.slice(0, 200);
		throw new Error(
			`GeminiImageProvider: no image in response${textResponse ? ` — model said: ${textResponse}` : ""}`,
		);
	}
}
