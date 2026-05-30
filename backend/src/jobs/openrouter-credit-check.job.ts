import type { IEmailProvider } from "../interfaces/providers/email.provider.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

interface KeyInfoResponse {
	data: {
		limit: number | null;
		usage: number;
	};
}

export class OpenRouterCreditCheckJob {
	constructor(
		private apiKey: string,
		private alertEmail: string,
		private thresholdUsd: number,
		private email: IEmailProvider,
		private logger: ILogger,
		private fetchFn: FetchFn = fetch,
	) {}

	async handle(): Promise<void> {
		let res: Response;
		try {
			res = await this.fetchFn(OPENROUTER_KEY_URL, {
				headers: { Authorization: `Bearer ${this.apiKey}` },
			});
		} catch (err) {
			this.logger.error("openrouter-credit-check: fetch failed", {
				error: err instanceof Error ? err.message : String(err),
			});
			return;
		}

		if (!res.ok) {
			this.logger.error("openrouter-credit-check: API returned error", { status: res.status });
			return;
		}

		const body = (await res.json()) as KeyInfoResponse;
		const { limit, usage } = body.data;

		if (limit === null) {
			this.logger.info("openrouter-credit-check: key has no limit (unlimited), skipping alert");
			return;
		}

		const remainingUsd = limit - usage;

		this.logger.info("openrouter-credit-check: balance checked", {
			remainingUsd: remainingUsd.toFixed(2),
			thresholdUsd: this.thresholdUsd,
			alertRequired: remainingUsd <= this.thresholdUsd,
		});

		if (remainingUsd <= this.thresholdUsd) {
			try {
				await this.email.sendCreditAlert({
					to: this.alertEmail,
					remainingUsd,
					thresholdUsd: this.thresholdUsd,
				});
				this.logger.info("openrouter-credit-check: alert email sent", { to: this.alertEmail });
			} catch (err) {
				this.logger.error("openrouter-credit-check: failed to send alert email", {
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
}
