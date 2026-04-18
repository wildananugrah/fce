const RATE_LIMIT_MSG =
	"The AI service is currently busy and hit its rate limit. Please wait a moment and try sending your message again.";
const AUTH_MSG =
	"The AI provider rejected our credentials. Please contact your admin, then try again.";
const QUOTA_MSG =
	"The AI provider's quota has been exhausted. Please try again later or contact your admin.";
const SAFETY_MSG =
	"The AI provider blocked this response for safety reasons. Try rephrasing your message.";
const TIMEOUT_MSG =
	"The AI service took too long to respond. Please try sending your message again.";
const SERVER_MSG =
	"The AI service had a temporary error. Please try sending your message again.";
const NETWORK_MSG =
	"Couldn't reach the AI service. Check your connection and try sending your message again.";
const GENERIC_MSG = "Something went wrong while generating a response. Please try sending your message again.";

export function humanizeChatError(err: unknown): string {
	const raw = err instanceof Error ? err.message : String(err ?? "");
	const lower = raw.toLowerCase();

	if (/\b429\b|rate[_\s-]?limit|too many requests|resource[_\s-]?exhausted/.test(lower)) {
		return RATE_LIMIT_MSG;
	}
	if (/quota/.test(lower) && /exhaust|exceed/.test(lower)) {
		return QUOTA_MSG;
	}
	if (/\b401\b|\b403\b|unauthorized|forbidden|api[_\s-]?key|permission[_\s-]?denied|invalid[_\s-]?authentication/.test(lower)) {
		return AUTH_MSG;
	}
	if (/safety|blocked|content[_\s-]?policy|harm_category/.test(lower)) {
		return SAFETY_MSG;
	}
	if (/timeout|timed out|deadline[_\s-]?exceeded|etimedout/.test(lower)) {
		return TIMEOUT_MSG;
	}
	if (/network|enetunreach|econnreset|econnrefused|fetch failed|socket hang up/.test(lower)) {
		return NETWORK_MSG;
	}
	if (/\b5\d{2}\b|internal[_\s-]?error|service[_\s-]?unavailable|unavailable|bad gateway/.test(lower)) {
		return SERVER_MSG;
	}

	return GENERIC_MSG;
}
