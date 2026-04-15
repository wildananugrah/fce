// Scrapes URLs found inside a user-provided prompt and returns extracted text
// that can be appended to the AI generation context.
//
// Design notes:
// - Runs on-the-fly per generation request (no DB persistence)
// - Limits total scraped characters so large pages don't blow up prompts
// - Limits URLs per prompt to avoid abuse
// - Each fetch has a short timeout so slow sites don't block generation
// - Failures are logged but not thrown — generation continues without the URL

const URL_REGEX = /https?:\/\/[^\s<>"]+/g;
const MAX_URLS_PER_PROMPT = 5;
const MAX_CHARS_PER_URL = 2000;
const MAX_TOTAL_CHARS = 6000;
const FETCH_TIMEOUT_MS = 10_000;

export interface ScrapedUrlResult {
	context: string;
	urls: string[];
	successCount: number;
	failedCount: number;
}

interface Logger {
	info: (msg: string, meta?: Record<string, unknown>) => void;
	warn: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Scan a prompt for URLs, fetch each one, and return extracted page text
 * formatted as a context block for AI prompts.
 */
export async function scrapeUrlsFromPrompt(
	prompt: string | undefined | null,
	logger?: Logger,
): Promise<ScrapedUrlResult> {
	const empty: ScrapedUrlResult = {
		context: "",
		urls: [],
		successCount: 0,
		failedCount: 0,
	};

	if (!prompt) return empty;

	// Dedupe and cap URLs
	const matches = prompt.match(URL_REGEX) ?? [];
	const urls = Array.from(new Set(matches)).slice(0, MAX_URLS_PER_PROMPT);

	if (urls.length === 0) return empty;

	logger?.info("Scraping URLs from additional direction", { count: urls.length });

	const blocks: string[] = [];
	let totalChars = 0;
	let successCount = 0;
	let failedCount = 0;

	for (const url of urls) {
		if (totalChars >= MAX_TOTAL_CHARS) break;

		const text = await fetchAndExtract(url);
		if (!text) {
			failedCount += 1;
			logger?.warn("Failed to scrape URL from prompt", { url });
			continue;
		}

		const remaining = MAX_TOTAL_CHARS - totalChars;
		const capped = text.slice(0, Math.min(MAX_CHARS_PER_URL, remaining));
		blocks.push(`Reference URL: ${url}\n${capped}`);
		totalChars += capped.length;
		successCount += 1;
	}

	if (blocks.length === 0) {
		return { context: "", urls, successCount, failedCount };
	}

	const context = `Scraped reference URLs from user instructions:\n\n${blocks.join("\n\n---\n\n")}`;

	return { context, urls, successCount, failedCount };
}

async function fetchAndExtract(url: string): Promise<string | null> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.9",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			redirect: "follow",
		});

		if (!response.ok) return null;

		const html = await response.text();
		const text = html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/\s+/g, " ")
			.trim();

		return text || null;
	} catch {
		return null;
	}
}
