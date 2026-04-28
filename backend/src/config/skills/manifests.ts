/**
 * Per-generator skill manifests. Slugs must match library/<slug>.md filenames.
 * The loader validates every slug at boot and refuses to start if any are
 * missing.
 *
 * Adding a skill: list its slug here. To remove, delete the entry.
 * To delete a skill entirely, also remove its .md file from library/.
 */

export type GeneratorName = "brandBrain" | "productBrain" | "topic" | "content" | "chat";

export const skillManifests: Record<GeneratorName, readonly string[]> = {
	brandBrain: [
		"customer-research",
		"competitor-alternatives",
		"competitor-profiling",
		"marketing-psychology",
		"pricing-strategy",
		"product-marketing-context",
	],
	productBrain: [
		"product-marketing-context",
		"copywriting",
		"pricing-strategy",
		"marketing-ideas",
	],
	topic: [
		"content-strategy",
		"social-content",
		"ad-creative",
		"marketing-ideas",
		"customer-research",
	],
	content: [
		"copywriting",
		"copy-editing",
		"social-content",
		"ad-creative",
		"marketing-psychology",
	],
	chat: [
		"copywriting",
		"content-strategy",
		"marketing-ideas",
		"customer-research",
	],
};
