export interface ImageGenerationInput {
	prompt: string;
	aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
}

export interface ImageGenerationOutput {
	imageBase64: string;
	mimeType: string;
}

export interface IImageGenerator {
	readonly model: string;
	generate(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}
