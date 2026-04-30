/**
 * Thrown when an AI auto-fill / scrape flow can't fetch any of the source
 * URLs (typical causes: site is offline, blocks bot user-agents, returns
 * 403/404, or rate-limits). The error-handler middleware recognises this and
 * returns HTTP 400 so the user sees a clear "check the URL or paste manually"
 * pointer rather than a generic 500.
 */
export class UrlFetchError extends Error {
	constructor(
		public urls: string[],
		detail?: string,
	) {
		const list = urls.length === 1 ? urls[0] : urls.join(", ");
		const suffix = detail ? ` (${detail})` : "";
		super(
			`Couldn't fetch content from ${list}${suffix}. ` +
				"Check the URL is reachable in a browser, or paste the details manually instead of using auto-fill.",
		);
		this.name = "UrlFetchError";
	}
}
