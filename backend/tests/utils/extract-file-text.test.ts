import { describe, test, expect } from "bun:test";
import { extractFileText } from "../../src/utils/extract-file-text";

describe("extractFileText", () => {
	test("extracts text from a plain-text file", async () => {
		const content = "Hello from a text file";
		const file = new File([content], "doc.txt", { type: "text/plain" });
		const result = await extractFileText(file);
		expect(result).toBe(content);
	});

	test("throws on unsupported file type", async () => {
		const file = new File(["data"], "image.jpg", { type: "image/jpeg" });
		await expect(extractFileText(file)).rejects.toThrow("Unsupported file type: image/jpeg");
	});
});
