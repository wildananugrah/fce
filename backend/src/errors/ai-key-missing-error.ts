/**
 * Thrown when an AI provider call is attempted without a configured API key
 * for the active workspace. The error-handler middleware recognises this and
 * returns HTTP 400 with the message verbatim, so the user sees an actionable
 * "set one in Workspace Settings → Integrations → AI Providers" pointer
 * rather than a generic 500.
 */
export class MissingApiKeyError extends Error {
	constructor(provider: "Anthropic" | "Gemini") {
		super(
			`No ${provider} API key configured for this workspace. ` +
				"Set one in Workspace Settings → Integrations → AI Providers before using AI features.",
		);
		this.name = "MissingApiKeyError";
	}
}
