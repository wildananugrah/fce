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
 * Extract the best hero / product image from a web page. Tries strategies
 * in priority order:
 *
 *   1. JSON-LD Product.image  — most reliable for e-commerce / product pages
 *   2. og:image / twitter:image — most sites, but skipped if it looks like a favicon
 *   3. First "hero-like" <img> in body — heuristic fallback for SPAs that
 *      don't set per-page meta tags (e.g. Nuxt sites where og:image points
 *      to the site logo)
 *
 * Uses a direct fetch (not Jina Reader) — Jina returns markdown and strips
 * everything we need. Fast: single fetch with 8s timeout, runs in parallel
 * with the text fetch from the caller.
 */
export async function extractOgImage(url: string): Promise<string | null> {
	const normalized = url.startsWith("http") ? url : `https://${url}`;
	let html: string;
	try {
		const res = await fetch(normalized, {
			signal: AbortSignal.timeout(8_000),
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
		});
		if (!res.ok) return null;
		html = await res.text();
	} catch {
		return null;
	}

	// Strategy 1: JSON-LD Product schema. Most accurate when present.
	const jsonLdImage = extractJsonLdProductImage(html);
	if (jsonLdImage) return resolveUrl(jsonLdImage, normalized);

	// Strategy 2: meta tags. Skip if the result is obviously a favicon/logo.
	const metaImage = extractMetaImage(html);
	if (metaImage && !looksLikeFavicon(metaImage)) {
		return resolveUrl(metaImage, normalized);
	}

	// Strategy 3: first hero-like <img> in body.
	const heroImg = extractHeroImg(html);
	if (heroImg) return resolveUrl(heroImg, normalized);

	// Last resort: return the meta image even if it looks like a favicon —
	// better than nothing, and the user can replace it manually.
	if (metaImage) return resolveUrl(metaImage, normalized);

	return null;
}

// Walk every <script type="application/ld+json"> block, JSON.parse it, and
// look for any node with @type "Product" (or array containing "Product").
// Returns the first image found.
function extractJsonLdProductImage(html: string): string | null {
	const scriptRe =
		/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match: RegExpExecArray | null;
	while ((match = scriptRe.exec(html)) !== null) {
		const raw = match[1].trim();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			continue;
		}
		const image = findProductImage(parsed);
		if (image) return image;
	}
	return null;
}

// Recursive walk over arbitrary JSON-LD shapes (single object, array,
// @graph, nested). Returns first Product.image we find.
function findProductImage(node: unknown): string | null {
	if (!node) return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findProductImage(item);
			if (found) return found;
		}
		return null;
	}
	if (typeof node !== "object") return null;
	const obj = node as Record<string, unknown>;

	// Walk @graph if present.
	if (Array.isArray(obj["@graph"])) {
		const found = findProductImage(obj["@graph"]);
		if (found) return found;
	}

	const type = obj["@type"];
	const isProduct =
		type === "Product" || (Array.isArray(type) && type.includes("Product"));
	if (isProduct) {
		const image = obj.image;
		if (typeof image === "string") return image;
		if (Array.isArray(image)) {
			for (const i of image) {
				if (typeof i === "string") return i;
				if (i && typeof i === "object") {
					const url = (i as Record<string, unknown>).url ?? (i as Record<string, unknown>).contentUrl;
					if (typeof url === "string") return url;
				}
			}
		}
		if (image && typeof image === "object") {
			const url =
				(image as Record<string, unknown>).url ?? (image as Record<string, unknown>).contentUrl;
			if (typeof url === "string") return url;
		}
	}

	// Recurse into all object values (some sites nest Product inside
	// another object like mainEntity / itemListElement).
	for (const value of Object.values(obj)) {
		if (value && typeof value === "object") {
			const found = findProductImage(value);
			if (found) return found;
		}
	}
	return null;
}

function extractMetaImage(html: string): string | null {
	const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
	const haystack = headMatch ? headMatch[1] : html.slice(0, 20_000);
	const patterns = [
		/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
		/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
		/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
		/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
		/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
	];
	for (const re of patterns) {
		const m = haystack.match(re);
		if (m?.[1]) return m[1];
	}
	return null;
}

// Heuristic for "this is probably a favicon, not a product image".
// Catches /favicon..., /logo..., /icon..., and small-square dimensions
// embedded in the URL (e.g. logo-192x192.png, favicon-32x32.png).
function looksLikeFavicon(url: string): boolean {
	const lower = url.toLowerCase();
	if (/(\/|^)(favicon|logo|icon|brand|apple-touch)/i.test(lower)) return true;
	const dims = lower.match(/(\d{1,4})x(\d{1,4})/);
	if (dims) {
		const w = Number(dims[1]);
		const h = Number(dims[2]);
		if (w === h && w <= 512) return true;
	}
	return false;
}

// Find the first body <img> that looks like a hero / product shot. Skips
// logos, icons, and obvious tracking pixels. Prefers images whose alt or
// class contains hero/banner/product/main keywords.
function extractHeroImg(html: string): string | null {
	const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
	const body = bodyMatch ? bodyMatch[1] : html;

	// Scan all <img ...> tags; capture src and the full tag for keyword
	// inspection. Limit to the first 50 to keep the cost bounded.
	const imgRe = /<img\b([^>]*)>/gi;
	const candidates: { src: string; tag: string; score: number }[] = [];
	let match: RegExpExecArray | null;
	let count = 0;
	while ((match = imgRe.exec(body)) !== null && count < 50) {
		count++;
		const tag = match[0];
		const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
		if (!srcMatch) continue;
		const src = srcMatch[1];

		// Filter out obvious non-content images.
		if (
			!src ||
			src.startsWith("data:") ||
			/\.(svg)(\?|$)/i.test(src) ||
			looksLikeFavicon(src)
		) {
			continue;
		}

		// Score the candidate. Higher = more likely to be a hero.
		let score = 0;
		const lowerTag = tag.toLowerCase();
		if (/\b(hero|banner|product|main|featured|cover)\b/.test(lowerTag)) score += 10;
		if (/\bw-full\b|\bh-full\b/.test(lowerTag)) score += 3;
		if (/\bobject-cover\b/.test(lowerTag)) score += 2;
		// Penalise images that look like nav/decoration.
		if (/\b(nav|menu|footer|header|small|thumb|avatar)\b/.test(lowerTag)) score -= 5;

		// Position bias: very first image is usually the site logo.
		if (count === 1) score -= 3;
		else if (count <= 5) score += 1;

		candidates.push({ src, tag, score });
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0].src;
}

// Resolve a possibly-relative image URL against the page URL.
function resolveUrl(maybeRelative: string, base: string): string {
	try {
		return new URL(maybeRelative, base).toString();
	} catch {
		return maybeRelative;
	}
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
