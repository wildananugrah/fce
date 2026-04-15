// Fetches a URL and returns readable text content.
// Strategy: try Jina Reader first (clean markdown, handles JS-rendered pages),
// fall back to direct fetch + HTML stripping if Jina is unavailable or too thin.
//
// Used for synchronous scraping flows like brand brain auto-fill and product
// scrape-preview, where we need rich page text passed to the AI.

const FETCH_TIMEOUT_MS = 15_000;
const MIN_JINA_LENGTH = 200;
const MIN_FALLBACK_LENGTH = 100;
const MAX_LENGTH_PER_URL = 8000;

export interface FetchedContent {
	url: string;
	content: string;
	source: "jina" | "fallback" | "failed";
	error?: string;
}

/**
 * Strip HTML to readable plain text.
 * Removes script/style/nav/footer/header/aside blocks, replaces block
 * closing tags with newlines, strips remaining tags, decodes entities.
 */
export function stripHtml(html: string): string {
	let text = html.replace(
		/<(script|style|nav|footer|header|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi,
		"",
	);
	text = text.replace(/<\/(p|div|li|h[1-6]|section|article|main|br)>/gi, "\n");
	text = text.replace(/<[^>]+>/g, "");
	text = text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"');
	text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
	return text;
}

/**
 * Fetch a URL and return its readable text content.
 *
 * 1. Try Jina Reader (`r.jina.ai/<url>`) — returns clean markdown
 * 2. On failure or thin content, fall back to direct fetch + stripHtml
 * 3. Returns a structured result with source info for debugging
 */
export async function fetchUrlContent(url: string): Promise<FetchedContent> {
	const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;

	// Try Jina Reader first
	try {
		const jinaUrl = `https://r.jina.ai/${normalizedUrl}`;
		const res = await fetch(jinaUrl, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "X-Return-Format": "markdown" },
		});
		if (res.ok) {
			const text = await res.text();
			if (text.trim().length >= MIN_JINA_LENGTH) {
				return {
					url,
					content: text.slice(0, MAX_LENGTH_PER_URL),
					source: "jina",
				};
			}
		}
	} catch {
		// Jina failed — fall through to direct fetch
	}

	// Fallback: direct fetch + HTML stripping
	try {
		const res = await fetch(normalizedUrl, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
			redirect: "follow",
		});
		if (!res.ok) {
			return {
				url,
				content: "",
				source: "failed",
				error: `HTTP ${res.status}`,
			};
		}
		const contentType = res.headers.get("content-type") || "";
		if (!contentType.includes("text/html")) {
			return {
				url,
				content: "",
				source: "failed",
				error: "Non-HTML content",
			};
		}
		const html = await res.text();
		const plain = stripHtml(html).slice(0, MAX_LENGTH_PER_URL);
		if (plain.length < MIN_FALLBACK_LENGTH) {
			return {
				url,
				content: "",
				source: "failed",
				error: "Insufficient content extracted",
			};
		}
		return { url, content: plain, source: "fallback" };
	} catch (err) {
		return {
			url,
			content: "",
			source: "failed",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Fetch multiple URLs in parallel and return a combined content block
 * suitable for injection into an AI extraction prompt.
 *
 * Each successfully-fetched URL is wrapped with a `=== Source: <url> ===`
 * header. Failed URLs get a `[Failed to fetch ...]` marker so the caller
 * can detect if nothing usable was retrieved.
 *
 * Total combined length is capped to avoid blowing up the AI context.
 */
export async function fetchMultipleUrls(
	urls: string[],
	maxTotalChars = 25_000,
): Promise<{ combined: string; results: FetchedContent[] }> {
	const limited = urls.slice(0, 5);
	const results = await Promise.all(limited.map((u) => fetchUrlContent(u)));

	const blocks = results.map((r) => {
		if (r.source === "failed") {
			return `[Failed to fetch ${r.url}: ${r.error ?? "unknown error"}]`;
		}
		return `=== Source: ${r.url} ===\n${r.content}`;
	});

	let combined = blocks.join("\n\n");
	if (combined.length > maxTotalChars) {
		combined = combined.slice(0, maxTotalChars);
	}

	return { combined, results };
}
