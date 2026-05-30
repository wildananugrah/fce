import { describe, expect, it } from "bun:test";
import type { ILogger } from "../../src/interfaces/providers/logger.provider.interface";
import { OpenRouterCreditCheckJob, type FetchFn } from "../../src/jobs/openrouter-credit-check.job";

const mockLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
	child: () => mockLogger,
} as unknown as ILogger;

function makeMockEmail() {
	const calls: any[] = [];
	return {
		sendInvitation: async () => {},
		sendVerification: async () => {},
		sendPasswordReset: async () => {},
		sendCreditAlert: async (input: any) => { calls.push(input); },
		calls,
	};
}

function makePrisma(targets: Array<{ workspaceId: string; openrouterCreditAlertEmail: string; openrouterCreditAlertThreshold: number | null }>) {
	return {
		workspaceSetting: {
			findMany: async () => targets,
		},
	} as any;
}

function makeAiFactory(apiKey: string) {
	return {
		getSettings: async (_wsId: string) => ({ openrouter: { apiKey } }),
	} as any;
}

function buildJob(
	targets: Array<{ workspaceId: string; openrouterCreditAlertEmail: string; openrouterCreditAlertThreshold: number | null }>,
	fetchImpl: FetchFn,
	emailProvider = makeMockEmail(),
	apiKey = "test-key",
) {
	return {
		job: new OpenRouterCreditCheckJob(
			makePrisma(targets),
			makeAiFactory(apiKey),
			emailProvider as any,
			mockLogger,
			fetchImpl,
		),
		email: emailProvider,
	};
}

const ONE_WORKSPACE = [{ workspaceId: "ws-1", openrouterCreditAlertEmail: "ops@co.com", openrouterCreditAlertThreshold: 5 }];

describe("OpenRouterCreditCheckJob", () => {
	describe("when balance is below threshold", () => {
		it("sends a credit alert email", async () => {
			const mockFetch: FetchFn = async (_url, _opts) =>
				({ ok: true, json: async () => ({ data: { limit: 10, usage: 8 } }) }) as any;

			const { job, email } = buildJob(ONE_WORKSPACE, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(1);
			expect(email.calls[0].to).toBe("ops@co.com");
			expect(email.calls[0].remainingUsd).toBeCloseTo(2, 2);
			expect(email.calls[0].thresholdUsd).toBe(5);
		});
	});

	describe("when balance equals threshold exactly", () => {
		it("sends a credit alert email (boundary — at threshold fires)", async () => {
			const mockFetch: FetchFn = async (_url, _opts) =>
				({ ok: true, json: async () => ({ data: { limit: 10, usage: 5 } }) }) as any;

			const { job, email } = buildJob(ONE_WORKSPACE, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(1);
			expect(email.calls[0].remainingUsd).toBeCloseTo(5, 2);
		});
	});

	describe("when balance is above threshold", () => {
		it("does not send an alert email", async () => {
			const mockFetch: FetchFn = async (_url, _opts) =>
				({ ok: true, json: async () => ({ data: { limit: 10, usage: 1 } }) }) as any;

			const { job, email } = buildJob(ONE_WORKSPACE, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when key has no limit (unlimited)", () => {
		it("does not send an alert email", async () => {
			const mockFetch: FetchFn = async (_url, _opts) =>
				({ ok: true, json: async () => ({ data: { limit: null, usage: 0.1 } }) }) as any;

			const { job, email } = buildJob(ONE_WORKSPACE, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when the OpenRouter API call fails", () => {
		it("does not throw and does not send an email", async () => {
			const mockFetch: FetchFn = async () => { throw new Error("network error"); };

			const { job, email } = buildJob(ONE_WORKSPACE, mockFetch);
			await expect(job.handle()).resolves.toBeUndefined();
			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when the API returns a non-ok response", () => {
		it("does not throw and does not send an email", async () => {
			const mockFetch: FetchFn = async (_url, _opts) =>
				({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) }) as any;

			const { job, email } = buildJob(ONE_WORKSPACE, mockFetch);
			await expect(job.handle()).resolves.toBeUndefined();
			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when the email send fails", () => {
		it("does not throw", async () => {
			const mockFetch: FetchFn = async (_url, _opts) =>
				({ ok: true, json: async () => ({ data: { limit: 10, usage: 9.9 } }) }) as any;

			const failEmail = {
				sendInvitation: async () => {},
				sendVerification: async () => {},
				sendPasswordReset: async () => {},
				sendCreditAlert: async () => { throw new Error("email failed"); },
				calls: [],
			};

			const { job } = buildJob(ONE_WORKSPACE, mockFetch, failEmail as any);
			await expect(job.handle()).resolves.toBeUndefined();
		});
	});

	describe("when no targets are configured", () => {
		it("does not call fetch and does not throw", async () => {
			let fetchCalled = false;
			const mockFetch: FetchFn = async () => { fetchCalled = true; return {} as any; };

			const { job } = buildJob([], mockFetch);
			await expect(job.handle()).resolves.toBeUndefined();
			expect(fetchCalled).toBe(false);
		});
	});
});
