# OpenRouter Credit Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pg-boss scheduled job that checks the OpenRouter API key's credit balance and sends an alert email when it falls at or below a configurable threshold.

**Architecture:** A new `OpenRouterCreditCheckJob` class polls `GET https://openrouter.ai/api/v1/auth/key` on a configurable cron schedule, computes remaining USD balance, and calls `IEmailProvider.sendCreditAlert()` if below threshold. The job is registered in `index.ts` only when `AI_MODE=openrouter` and `OPENROUTER_CREDIT_ALERT_EMAIL` is set. Three new env vars control recipient, threshold, and schedule.

**Tech Stack:** Bun, TypeScript, pg-boss, Hono, Prisma, Resend / Nodemailer SMTP / noop email providers

---

## File Map

| Action | Path |
|--------|------|
| **Modify** | `backend/src/interfaces/providers/email.provider.interface.ts` |
| **Modify** | `backend/src/providers/resend-email.provider.ts` |
| **Modify** | `backend/src/providers/smtp-email.provider.ts` |
| **Modify** | `backend/src/providers/noop-email.provider.ts` |
| **Create** | `backend/src/jobs/openrouter-credit-check.job.ts` |
| **Create** | `backend/tests/jobs/openrouter-credit-check.job.test.ts` |
| **Modify** | `backend/src/index.ts` |
| **Modify** | `backend/.env.example` |

---

## Task 1: Extend IEmailProvider with sendCreditAlert

**Files:**
- Modify: `backend/src/interfaces/providers/email.provider.interface.ts`

- [ ] **Step 1: Add `CreditAlertEmailInput` and `sendCreditAlert` to the interface**

Open `backend/src/interfaces/providers/email.provider.interface.ts`. The current file ends with:

```ts
export interface IEmailProvider {
	sendInvitation(input: InvitationEmailInput): Promise<void>;
	sendVerification(input: VerificationEmailInput): Promise<void>;
	sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;
}
```

Replace it with:

```ts
export interface CreditAlertEmailInput {
	to: string;
	remainingUsd: number;
	thresholdUsd: number;
}

export interface IEmailProvider {
	sendInvitation(input: InvitationEmailInput): Promise<void>;
	sendVerification(input: VerificationEmailInput): Promise<void>;
	sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;
	sendCreditAlert(input: CreditAlertEmailInput): Promise<void>;
}
```

- [ ] **Step 2: Type-check to confirm the 3 providers now fail to compile**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "sendCreditAlert"
```

Expected output (3 lines — one per provider):
```
Property 'sendCreditAlert' is missing in type 'ResendEmailProvider'...
Property 'sendCreditAlert' is missing in type 'SmtpEmailProvider'...
Property 'sendCreditAlert' is missing in type 'NoopEmailProvider'...
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/providers/email.provider.interface.ts
git commit -m "feat: add sendCreditAlert to IEmailProvider interface"
```

---

## Task 2: Implement sendCreditAlert in ResendEmailProvider

**Files:**
- Modify: `backend/src/providers/resend-email.provider.ts`

- [ ] **Step 1: Add the import for `CreditAlertEmailInput`**

At the top of `backend/src/providers/resend-email.provider.ts`, the existing import is:

```ts
import type {
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

Replace it with:

```ts
import type {
	CreditAlertEmailInput,
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

- [ ] **Step 2: Add the `sendCreditAlert` method**

After the `sendPasswordReset` method and before the private `send` method, add:

```ts
	async sendCreditAlert(input: CreditAlertEmailInput): Promise<void> {
		const remaining = input.remainingUsd.toFixed(2);
		const threshold = input.thresholdUsd.toFixed(2);
		const subject = `⚠️ OpenRouter credit low: $${remaining} remaining`;
		const html = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
				<h1 style="font-size: 20px; margin-bottom: 16px;">OpenRouter credit running low</h1>
				<p>Your OpenRouter API key balance has dropped to <strong>$${remaining}</strong>, which is at or below your configured alert threshold of <strong>$${threshold}</strong>.</p>
				<p>AI generation will stop working when the balance reaches zero. Top up your credits to keep the service running.</p>
				<p style="margin: 24px 0;">
					<a href="https://openrouter.ai/credits" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Top up credits →</a>
				</p>
				<p style="color: #999; font-size: 12px; margin-top: 24px;">This alert fires every check cycle while balance remains below the threshold. Set OPENROUTER_CREDIT_ALERT_THRESHOLD in your .env to adjust.</p>
			</div>
		`;

		await this.send(
			{
				from: this.from,
				to: input.to,
				subject,
				html,
			},
			{ kind: "credit_alert", to: input.to },
		);
	}
```

- [ ] **Step 3: Extend the `send` method's context `kind` union**

The private `send` method has this signature:

```ts
	private async send(
		payload: { from: string; to: string; subject: string; html: string },
		context: { kind: "invitation" | "verification" | "password_reset"; to: string },
	): Promise<void> {
```

Change `context` to:

```ts
	private async send(
		payload: { from: string; to: string; subject: string; html: string },
		context: { kind: "invitation" | "verification" | "password_reset" | "credit_alert"; to: string },
	): Promise<void> {
```

- [ ] **Step 4: Type-check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "resend|sendCreditAlert"
```

Expected: no output (no errors in this file).

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/resend-email.provider.ts
git commit -m "feat: implement sendCreditAlert in ResendEmailProvider"
```

---

## Task 3: Implement sendCreditAlert in SmtpEmailProvider

**Files:**
- Modify: `backend/src/providers/smtp-email.provider.ts`

- [ ] **Step 1: Add the import for `CreditAlertEmailInput`**

The existing import at the top of `backend/src/providers/smtp-email.provider.ts`:

```ts
import type {
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

Replace with:

```ts
import type {
	CreditAlertEmailInput,
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

- [ ] **Step 2: Extend the `send` method's context `kind` union**

The private `send` method has this signature:

```ts
	private async send(
		payload: { to: string; subject: string; html: string },
		context: { kind: "invitation" | "verification" | "password_reset"; to: string },
	): Promise<void> {
```

Change `context` to:

```ts
	private async send(
		payload: { to: string; subject: string; html: string },
		context: { kind: "invitation" | "verification" | "password_reset" | "credit_alert"; to: string },
	): Promise<void> {
```

- [ ] **Step 3: Add the `sendCreditAlert` method**

After `sendPasswordReset` and before the private `send` method, add:

```ts
	async sendCreditAlert(input: CreditAlertEmailInput): Promise<void> {
		const remaining = input.remainingUsd.toFixed(2);
		const threshold = input.thresholdUsd.toFixed(2);
		const subject = `⚠️ OpenRouter credit low: $${remaining} remaining`;
		const html = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
				<h1 style="font-size: 20px; margin-bottom: 16px;">OpenRouter credit running low</h1>
				<p>Your OpenRouter API key balance has dropped to <strong>$${remaining}</strong>, which is at or below your configured alert threshold of <strong>$${threshold}</strong>.</p>
				<p>AI generation will stop working when the balance reaches zero. Top up your credits to keep the service running.</p>
				<p style="margin: 24px 0;">
					<a href="https://openrouter.ai/credits" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Top up credits →</a>
				</p>
				<p style="color: #999; font-size: 12px; margin-top: 24px;">This alert fires every check cycle while balance remains below the threshold. Set OPENROUTER_CREDIT_ALERT_THRESHOLD in your .env to adjust.</p>
			</div>
		`;

		await this.send(
			{ to: input.to, subject, html },
			{ kind: "credit_alert", to: input.to },
		);
	}
```

- [ ] **Step 4: Type-check**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep -E "smtp|sendCreditAlert"
```

Expected: no output (no errors in this file).

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/smtp-email.provider.ts
git commit -m "feat: implement sendCreditAlert in SmtpEmailProvider"
```

---

## Task 4: Implement sendCreditAlert in NoopEmailProvider

**Files:**
- Modify: `backend/src/providers/noop-email.provider.ts`

- [ ] **Step 1: Add the import for `CreditAlertEmailInput`**

The existing import:

```ts
import type {
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

Replace with:

```ts
import type {
	CreditAlertEmailInput,
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

- [ ] **Step 2: Add the `sendCreditAlert` method**

After `sendPasswordReset`, before the closing `}` of the class, add:

```ts
	async sendCreditAlert(input: CreditAlertEmailInput): Promise<void> {
		this.logger.warn("Email provider not configured — credit alert NOT sent", {
			to: input.to,
			remainingUsd: input.remainingUsd,
			thresholdUsd: input.thresholdUsd,
		});
	}
```

- [ ] **Step 3: Type-check — all providers should be clean now**

```bash
cd backend && bunx tsc --noEmit 2>&1 | grep "sendCreditAlert"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add backend/src/providers/noop-email.provider.ts
git commit -m "feat: implement sendCreditAlert in NoopEmailProvider"
```

---

## Task 5: Create OpenRouterCreditCheckJob with tests (TDD)

**Files:**
- Create: `backend/tests/jobs/openrouter-credit-check.job.test.ts`
- Create: `backend/src/jobs/openrouter-credit-check.job.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/jobs/openrouter-credit-check.job.test.ts`:

```ts
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { OpenRouterCreditCheckJob } from "../../src/jobs/openrouter-credit-check.job";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

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

function buildJob(
	apiKey: string,
	alertEmail: string,
	thresholdUsd: number,
	fetchImpl: typeof fetch,
	emailProvider = makeMockEmail(),
) {
	return {
		job: new OpenRouterCreditCheckJob(apiKey, alertEmail, thresholdUsd, emailProvider as any, mockLogger, fetchImpl),
		email: emailProvider,
	};
}

describe("OpenRouterCreditCheckJob", () => {
	describe("when balance is below threshold", () => {
		it("sends a credit alert email", async () => {
			const mockFetch = async (_url: string, _opts?: any) =>
				({ ok: true, json: async () => ({ data: { limit: 10000, usage: 9800 } }) }) as any;

			const { job, email } = buildJob("key", "ops@co.com", 5, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(1);
			expect(email.calls[0].to).toBe("ops@co.com");
			expect(email.calls[0].remainingUsd).toBeCloseTo(2, 2);
			expect(email.calls[0].thresholdUsd).toBe(5);
		});
	});

	describe("when balance equals threshold exactly", () => {
		it("sends a credit alert email (boundary — at threshold fires)", async () => {
			const mockFetch = async (_url: string, _opts?: any) =>
				({ ok: true, json: async () => ({ data: { limit: 10000, usage: 5000 } }) }) as any;

			const { job, email } = buildJob("key", "ops@co.com", 5, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(1);
			expect(email.calls[0].remainingUsd).toBeCloseTo(5, 2);
		});
	});

	describe("when balance is above threshold", () => {
		it("does not send an alert email", async () => {
			const mockFetch = async (_url: string, _opts?: any) =>
				({ ok: true, json: async () => ({ data: { limit: 10000, usage: 1000 } }) }) as any;

			const { job, email } = buildJob("key", "ops@co.com", 5, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when key has no limit (unlimited)", () => {
		it("does not send an alert email", async () => {
			const mockFetch = async (_url: string, _opts?: any) =>
				({ ok: true, json: async () => ({ data: { limit: null, usage: 100 } }) }) as any;

			const { job, email } = buildJob("key", "ops@co.com", 5, mockFetch);
			await job.handle();

			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when the OpenRouter API call fails", () => {
		it("does not throw and does not send an email", async () => {
			const mockFetch = async (_url: string, _opts?: any) => { throw new Error("network error"); };

			const { job, email } = buildJob("key", "ops@co.com", 5, mockFetch as any);
			await expect(job.handle()).resolves.toBeUndefined();
			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when the API returns a non-ok response", () => {
		it("does not throw and does not send an email", async () => {
			const mockFetch = async (_url: string, _opts?: any) =>
				({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) }) as any;

			const { job, email } = buildJob("key", "ops@co.com", 5, mockFetch);
			await expect(job.handle()).resolves.toBeUndefined();
			expect(email.calls).toHaveLength(0);
		});
	});

	describe("when the email send fails", () => {
		it("does not throw", async () => {
			const mockFetch = async (_url: string, _opts?: any) =>
				({ ok: true, json: async () => ({ data: { limit: 10000, usage: 9900 } }) }) as any;

			const failEmail = {
				sendInvitation: async () => {},
				sendVerification: async () => {},
				sendPasswordReset: async () => {},
				sendCreditAlert: async () => { throw new Error("email failed"); },
				calls: [],
			};

			const { job } = buildJob("key", "ops@co.com", 5, mockFetch, failEmail as any);
			await expect(job.handle()).resolves.toBeUndefined();
		});
	});
});
```

- [ ] **Step 2: Run the tests to confirm they all fail with "Cannot find module"**

```bash
cd backend && bun test tests/jobs/openrouter-credit-check.job.test.ts 2>&1 | head -20
```

Expected: `Cannot find module '../../src/jobs/openrouter-credit-check.job'`

- [ ] **Step 3: Create the job implementation**

Create `backend/src/jobs/openrouter-credit-check.job.ts`:

```ts
import type { IEmailProvider } from "../interfaces/providers/email.provider.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/auth/key";

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
		private fetchFn: typeof fetch = fetch,
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

		const remainingUsd = (limit - usage) / 1000;

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
```

- [ ] **Step 4: Run the tests — all should pass**

```bash
cd backend && bun test tests/jobs/openrouter-credit-check.job.test.ts
```

Expected:
```
✓ when balance is below threshold > sends a credit alert email
✓ when balance equals threshold exactly > sends a credit alert email (boundary — at threshold fires)
✓ when balance is above threshold > does not send an alert email
✓ when key has no limit (unlimited) > does not send an alert email
✓ when the OpenRouter API call fails > does not throw and does not send an email
✓ when the API returns a non-ok response > does not throw and does not send an email
✓ when the email send fails > does not throw
7 pass, 0 fail
```

- [ ] **Step 5: Full type-check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/jobs/openrouter-credit-check.job.ts backend/tests/jobs/openrouter-credit-check.job.test.ts
git commit -m "feat: add OpenRouterCreditCheckJob with tests"
```

---

## Task 6: Wire the job into index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add the import**

In `backend/src/index.ts`, find the block of job imports (near `import { ArchiveSweepJob }`) and add:

```ts
import { OpenRouterCreditCheckJob } from "./jobs/openrouter-credit-check.job";
```

- [ ] **Step 2: Create the queue**

Find the block of `boss.createQueue` calls (around line 550). After `await boss.createQueue("archive-sweep");`, add:

```ts
	if (aiMode === "openrouter" && process.env.OPENROUTER_CREDIT_ALERT_EMAIL) {
		await boss.createQueue("openrouter-credit-check");
	}
```

- [ ] **Step 3: Instantiate the job**

Find where `archiveSweepJob` is instantiated (search for `new ArchiveSweepJob`). Right after that instantiation, add:

```ts
	const openrouterCreditCheckJob =
		aiMode === "openrouter" && process.env.OPENROUTER_CREDIT_ALERT_EMAIL
			? new OpenRouterCreditCheckJob(
					process.env.OPENROUTER_API_KEY ?? "",
					process.env.OPENROUTER_CREDIT_ALERT_EMAIL,
					parseFloat(process.env.OPENROUTER_CREDIT_ALERT_THRESHOLD ?? "5"),
					emailProvider,
					logger,
			  )
			: null;
```

- [ ] **Step 4: Register the worker**

Find the `archive-sweep` worker registration block:

```ts
	await boss.work(
		"archive-sweep",
		{ localConcurrency: 1, pollingIntervalSeconds: 60 },
		async (jobs) => {
			for (const _ of jobs) await archiveSweepJob.handle();
		},
	);
```

After it, add:

```ts
	if (openrouterCreditCheckJob) {
		await boss.work(
			"openrouter-credit-check",
			{ localConcurrency: 1, pollingIntervalSeconds: 60 },
			async (jobs) => {
				for (const _ of jobs) await openrouterCreditCheckJob.handle();
			},
		);
	}
```

- [ ] **Step 5: Schedule the job**

Find the line `await boss.schedule("archive-sweep", "0 * * * *");` and add after it:

```ts
	if (openrouterCreditCheckJob) {
		await boss.schedule(
			"openrouter-credit-check",
			process.env.OPENROUTER_CREDIT_CHECK_CRON ?? "0 * * * *",
		);
		logger.info("openrouter-credit-check scheduled", {
			cron: process.env.OPENROUTER_CREDIT_CHECK_CRON ?? "0 * * * *",
			alertEmail: process.env.OPENROUTER_CREDIT_ALERT_EMAIL,
			thresholdUsd: process.env.OPENROUTER_CREDIT_ALERT_THRESHOLD ?? "5",
		});
	}
```

- [ ] **Step 6: Type-check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: register OpenRouter credit check job in index.ts"
```

---

## Task 7: Update .env.example

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Add the three new env vars**

Find the block in `backend/.env.example` that contains:

```
OPENROUTER_API_KEY=
OPENROUTER_MODEL=                    # default for all generators if unset below
```

After the last `OPENROUTER_*` line in that block, add:

```env
# OpenRouter credit alert (only used when AI_MODE=openrouter)
# Email address to notify when the credit balance drops to or below the threshold.
# Leave blank to disable the alert.
OPENROUTER_CREDIT_ALERT_EMAIL=
# USD threshold that triggers the alert (default: 5)
OPENROUTER_CREDIT_ALERT_THRESHOLD=5
# Cron schedule for the credit balance check (default: every hour)
OPENROUTER_CREDIT_CHECK_CRON=0 * * * *
```

- [ ] **Step 2: Run all tests to confirm nothing regressed**

```bash
cd backend && bun test
```

Expected: all tests pass (no failures).

- [ ] **Step 3: Final type-check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/.env.example
git commit -m "feat: add OpenRouter credit alert env vars to .env.example"
```

---

## Done

The feature is complete when:
- `bun test` passes in `backend/`
- `bunx tsc --noEmit` passes in `backend/`
- Setting `AI_MODE=openrouter`, `OPENROUTER_CREDIT_ALERT_EMAIL=you@example.com`, and `OPENROUTER_CREDIT_ALERT_THRESHOLD=5` in `.env` causes the credit-check job to be scheduled at startup (visible in the startup logs)
- Setting `AI_MODE=legacy` or leaving `OPENROUTER_CREDIT_ALERT_EMAIL` blank skips the job entirely (no queue created, no schedule registered)
