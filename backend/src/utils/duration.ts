const UNIT_MS: Record<string, number> = {
	s: 1_000,
	m: 60_000,
	h: 60 * 60_000,
	d: 24 * 60 * 60_000,
};

/**
 * Parse a short duration string like "30s", "5m", "2h", "7d" into milliseconds.
 * Throws on malformed input. Only used for invitation expiry; not a general
 * duration library.
 */
export function parseDuration(value: string): number {
	const match = /^(\d+)([smhd])$/.exec(value.trim());
	if (!match) {
		throw new Error(`Invalid duration: "${value}". Expected format like "30s", "5m", "2h", "7d".`);
	}
	const [, nStr, unit] = match;
	return Number.parseInt(nStr, 10) * UNIT_MS[unit];
}
