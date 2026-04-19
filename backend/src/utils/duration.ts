const UNIT_MS: Record<string, number> = {
	s: 1_000,
	m: 60_000,
	h: 60 * 60_000,
	d: 24 * 60 * 60_000,
};

const UNIT_LABEL: Record<string, string> = {
	s: "second",
	m: "minute",
	h: "hour",
	d: "day",
};

/**
 * Parse a short duration string like "30s", "5m", "2h", "7d" into milliseconds.
 * Throws on malformed input. Only used for invitation / verification expiry;
 * not a general duration library.
 */
export function parseDuration(value: string): number {
	const match = /^(\d+)([smhd])$/.exec(value.trim());
	if (!match) {
		throw new Error(`Invalid duration: "${value}". Expected format like "30s", "5m", "2h", "7d".`);
	}
	const [, nStr, unit] = match;
	return Number.parseInt(nStr, 10) * UNIT_MS[unit];
}

/**
 * Render a duration string as a user-facing phrase: "24h" → "24 hours".
 * Falls through to the input string on malformed values so email templates
 * don't explode over a bad env var.
 */
export function humanizeDuration(value: string): string {
	const match = /^(\d+)([smhd])$/.exec(value.trim());
	if (!match) return value;
	const [, n, u] = match;
	const label = UNIT_LABEL[u];
	return `${n} ${label}${Number.parseInt(n, 10) === 1 ? "" : "s"}`;
}
