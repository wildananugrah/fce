export type UrlKindType = "instagram" | "tiktok" | "facebook" | "youtube" | "website";

export interface UrlKind {
	type: UrlKindType;
	url: string;
	normalizedUrl: string;
}

export function detectUrlKind(url: string): UrlKind {
	const normalized = normalizeUrl(url);
	let hostname = "";
	try {
		hostname = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return { type: "website", url, normalizedUrl: normalized };
	}

	if (hostname === "instagram.com" || hostname === "instagr.am") {
		return { type: "instagram", url, normalizedUrl: normalized };
	}
	if (hostname === "tiktok.com" || hostname === "vm.tiktok.com") {
		return { type: "tiktok", url, normalizedUrl: normalized };
	}
	if (hostname === "facebook.com" || hostname === "fb.com" || hostname === "m.facebook.com") {
		return { type: "facebook", url, normalizedUrl: normalized };
	}
	if (hostname === "youtube.com" || hostname === "youtu.be" || hostname === "m.youtube.com") {
		return { type: "youtube", url, normalizedUrl: normalized };
	}
	return { type: "website", url, normalizedUrl: normalized };
}

export function normalizeUrl(url: string): string {
	const trimmed = url.trim();
	try {
		const parsed = new URL(trimmed);
		parsed.hostname = parsed.hostname.toLowerCase();
		for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "igshid"]) {
			parsed.searchParams.delete(param);
		}
		let out = parsed.toString();
		if (out.endsWith("/") && parsed.pathname !== "/") out = out.slice(0, -1);
		return out;
	} catch {
		return trimmed;
	}
}

export async function hashUrl(url: string): Promise<string> {
	const normalized = normalizeUrl(url);
	const buf = new TextEncoder().encode(normalized);
	const hashBuf = await crypto.subtle.digest("SHA-256", buf);
	return Array.from(new Uint8Array(hashBuf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * True when the URL is a video host that Gemini's generateContent can fetch
 * directly via fileData.fileUri (no download, no Files API upload).
 *
 * Today only YouTube qualifies — verified against current Gemini docs:
 *   https://ai.google.dev/gemini-api/docs/video-understanding
 *
 * If Gemini documents support for additional hosts later, add them here in
 * one place; the analyzer branch in UrlInspirationService picks up the
 * change with no other code edits.
 */
export function isDirectGeminiVideoUri(url: string): boolean {
	return detectUrlKind(url).type === "youtube";
}
