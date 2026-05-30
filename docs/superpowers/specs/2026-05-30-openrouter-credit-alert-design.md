# OpenRouter Credit Alert — Design Spec

**Date:** 2026-05-30
**Status:** Approved

## Problem

When `AI_MODE=openrouter`, all AI calls (text, chat, image, video) route through OpenRouter. If the API key's credit balance reaches zero, all AI generation fails silently from the user's perspective. There is no proactive warning to the operator that credits need topping up.

## Goal

Send an alert email to a configurable recipient whenever the OpenRouter credit balance falls at or below a configurable threshold. The check runs on a configurable schedule via the existing pg-boss job infrastructure.

---

## Architecture

A new pg-boss scheduled job (`openrouter-credit-check`) runs on a cron schedule, calls the OpenRouter key-info endpoint, and sends an alert email via the existing `IEmailProvider` if the remaining balance is at or below the threshold.

```
pg-boss scheduler
  → openrouter-credit-check job
      → GET https://openrouter.ai/api/v1/auth/key (with OPENROUTER_API_KEY)
      → parse remaining balance (limit - usage, both in USD*1000)
      → if remaining ≤ threshold → IEmailProvider.sendCreditAlert(...)
      → log result
```

Only active when `AI_MODE=openrouter` AND `OPENROUTER_CREDIT_ALERT_EMAIL` is set. If either is absent, the job is not scheduled at startup.

---

## New Environment Variables

```env
# Recipient for OpenRouter credit alert emails
OPENROUTER_CREDIT_ALERT_EMAIL=ops@yourcompany.com

# USD threshold that triggers the alert (default: 5)
OPENROUTER_CREDIT_ALERT_THRESHOLD=5

# Cron schedule for the check (default: every hour)
OPENROUTER_CREDIT_CHECK_CRON=0 * * * *
```

All three go in `.env.example` with comments.

---

## Components

### 1. `backend/src/jobs/openrouter-credit-check.job.ts` (new)

Class `OpenRouterCreditCheckJob` with dependencies:
- `apiKey: string` — the OpenRouter API key
- `alertEmail: string` — recipient address
- `thresholdUsd: number` — alert threshold in USD
- `email: IEmailProvider`
- `logger: ILogger`

**`handle()` flow:**
1. `GET https://openrouter.ai/api/v1/auth/key` with `Authorization: Bearer <apiKey>`
2. Parse response: `{ data: { limit: number | null, usage: number } }` — both in USD×1000
3. If `limit === null` → key is unlimited, log and return (no alert)
4. Compute `remainingUsd = (limit - usage) / 1000`
5. If `remainingUsd <= thresholdUsd` → call `email.sendCreditAlert({ to: alertEmail, remainingUsd, thresholdUsd })`
6. Log the check outcome either way

### 2. `IEmailProvider` interface — add `sendCreditAlert`

```ts
export interface CreditAlertEmailInput {
  to: string;
  remainingUsd: number;
  thresholdUsd: number;
}

// Added to IEmailProvider:
sendCreditAlert(input: CreditAlertEmailInput): Promise<void>;
```

### 3. Email provider implementations

All three providers implement `sendCreditAlert`:

- **`ResendEmailProvider`** — sends HTML email with remaining balance and a call-to-action link to `https://openrouter.ai/credits`
- **`SmtpEmailProvider`** — same HTML template via nodemailer
- **`NoopEmailProvider`** — logs to stdout (dev/test)

Subject line: `⚠️ OpenRouter credit low: $X.XX remaining`

### 4. `backend/src/index.ts` — wire up

```ts
if (aiMode === "openrouter" && process.env.OPENROUTER_CREDIT_ALERT_EMAIL) {
  const creditCheckJob = new OpenRouterCreditCheckJob(
    process.env.OPENROUTER_API_KEY ?? "",
    process.env.OPENROUTER_CREDIT_ALERT_EMAIL,
    parseFloat(process.env.OPENROUTER_CREDIT_ALERT_THRESHOLD ?? "5"),
    emailProvider,
    logger,
  );
  boss.work("openrouter-credit-check", async () => { await creditCheckJob.handle(); });
  await boss.schedule(
    "openrouter-credit-check",
    process.env.OPENROUTER_CREDIT_CHECK_CRON ?? "0 * * * *",
  );
}
```

---

## Error Handling

- If the OpenRouter API call fails (network error, 401, 429) → log the error, do **not** throw (don't crash the job worker)
- If the email send fails → log the error, do not throw
- Both failure modes are silent to the user — the operator monitors logs; a persistent alert failure is a config issue (wrong email provider / expired key)

---

## Testing

The job class is pure — injectable dependencies, no framework coupling. Unit test with:
- Mock `fetch` returning a low-balance response → assert `sendCreditAlert` called
- Mock `fetch` returning a high-balance response → assert `sendCreditAlert` not called
- Mock `fetch` returning `limit: null` (unlimited) → assert `sendCreditAlert` not called
- Mock `fetch` throwing → assert no crash, error is logged

---

## Out of Scope

- Frontend UI for credit balance display
- Per-workspace credit monitoring (OpenRouter keys are global, not per-workspace)
- Deduplication / "alert once per breach" logic (out of scope per decision; every run below threshold sends an email)
- SMS or Slack notifications (email only for now)
