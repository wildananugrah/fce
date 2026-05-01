/**
 * Thrown by OpenRouter providers when the upstream API returns a non-2xx
 * status. The error-handler middleware surfaces .message as the user-facing
 * 400 message, so the friendly text below is what the user sees in the UI.
 *
 * The `upstreamMessage` field carries the raw OpenRouter error for logs.
 */
export interface OpenRouterErrorBody {
	error?: {
		message?: string;
		code?: number;
		metadata?: { provider_name?: string | null };
	};
}

export class OpenRouterApiError extends Error {
	public readonly status: number;
	public readonly upstreamMessage: string;

	constructor(status: number, upstreamMessage: string) {
		super(OpenRouterApiError.friendlyMessage(status, upstreamMessage));
		this.name = "OpenRouterApiError";
		this.status = status;
		this.upstreamMessage = upstreamMessage;
	}

	private static friendlyMessage(status: number, upstream: string): string {
		if (status === 401) {
			return "OpenRouter API key is invalid or expired. Update it in Workspace Settings → Integrations → OpenRouter.";
		}
		if (status === 402) {
			return "OpenRouter account has insufficient credits. Add credits at https://openrouter.ai/settings/keys, or pick a smaller model in Workspace Settings → Integrations → OpenRouter.";
		}
		if (status === 404) {
			return "Selected OpenRouter model is not available. Check the model id at https://openrouter.ai/models or pick another model in Workspace Settings → Integrations → OpenRouter.";
		}
		if (status === 429) {
			return "OpenRouter rate limit reached. Wait a few seconds and try again.";
		}
		if (status >= 500) {
			return "OpenRouter is having a temporary issue. Try again in a moment, or pick a different model in Workspace Settings → Integrations → OpenRouter.";
		}
		// Other 4xx: surface OpenRouter's own message if present, else generic.
		return `OpenRouter rejected the request: ${upstream || `HTTP ${status}`}`;
	}

	/**
	 * Parse a fetch Response's text body into an OpenRouterApiError.
	 * Caller should `await response.text()` first because the body may not
	 * be JSON, and we want to attach the raw text either way.
	 */
	static async fromResponse(response: Response): Promise<OpenRouterApiError> {
		const text = await response.text().catch(() => "");
		let upstream = text;
		try {
			const parsed = JSON.parse(text) as OpenRouterErrorBody;
			if (parsed.error?.message) {
				upstream = parsed.error.message;
			}
		} catch {
			// text wasn't JSON; keep the raw body.
		}
		return new OpenRouterApiError(response.status, upstream);
	}
}
