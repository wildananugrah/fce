# Friendly AI Errors — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend

## Problem

When the New Product modal's "Generate with AI" auto-fill fails — either because the workspace has no AI key configured or because none of the source URLs can be fetched — the user sees `"Internal server error"`. The friendly message exists at the throw site (e.g. `AiProviderFactory.requireKey` already produces a clear "Set one in Workspace Settings → Integrations → AI Providers" string) but the global error-handler middleware ([middlewares/error-handler.middleware.ts:19-28](../../../backend/src/middlewares/error-handler.middleware.ts#L19-L28)) has a hardcoded allowlist of three known messages and converts everything else to `"Internal server error"`. So the friendly text is generated but never reaches the user.

Same root cause masks the URL-fetch failure: `gemini.provider.ts` throws `"GeminiProvider: Could not fetch content from any of: <url>"` (note the implementation-detail "GeminiProvider:" prefix) and the user sees nothing useful.

## Goals

- API-key-missing failures surface as the existing actionable message: "No Gemini/Anthropic API key configured for this workspace. Set one in Workspace Settings → Integrations → AI Providers before using AI features."
- URL-fetch failures surface as: "Couldn't fetch content from `<url>`. Check the URL is reachable in a browser, or paste the details manually instead of using auto-fill."
- Both return HTTP 400 (user-actionable, not 500).
- Frontend code does not change — `setError(e.message)` already renders whatever the backend returns.

## Non-Goals

- JSON-parse failures from AI responses (`gemini.provider.ts` lines 164, 189, 281, 369). Different concern; left as `"Internal server error"` for now.
- A proactive frontend banner / disabled state when AI keys aren't configured. Reactive friendly errors only.
- Sweeping all other AI-using routes (brand-scraping job, topic gen, content gen, chat). The new error classes will work in those routes when someone reaches for them, but no proactive review this round.

## Architecture

Two new typed `Error` subclasses + an `instanceof` branch in the error handler middleware. Mirrors the existing `QuotaExceededError`, `EmailNotVerifiedError`, `ValidationError` precedent in `backend/src/errors/`.

## Files

### Create

**`backend/src/errors/ai-key-missing-error.ts`**:

```ts
export class MissingApiKeyError extends Error {
    constructor(provider: "Anthropic" | "Gemini") {
        super(
            `No ${provider} API key configured for this workspace. ` +
                "Set one in Workspace Settings → Integrations → AI Providers before using AI features.",
        );
        this.name = "MissingApiKeyError";
    }
}
```

**`backend/src/errors/url-fetch-error.ts`**:

```ts
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
```

### Modify

**`backend/src/services/ai-provider-factory.service.ts:213-219`** (`requireKey`):

```ts
private requireKey(provider: ProviderName, apiKey: string): void {
    if (apiKey && apiKey.length > 0) return;
    throw new MissingApiKeyError(provider === "anthropic" ? "Anthropic" : "Gemini");
}
```

**`backend/src/providers/gemini.provider.ts:319-321`** (multi-URL scrapeProduct):

```ts
const anySuccess = results.some((r) => r.source !== "failed" && r.content);
if (!anySuccess) {
    throw new UrlFetchError(sourceUrls);
}
```

**`backend/src/providers/gemini.provider.ts:379-381`** (single-URL scrapeBrand):

```ts
if (!fetched.content) {
    throw new UrlFetchError([input.url], fetched.error ?? "unknown error");
}
```

(The exact `if (!fetched.content)` line is the existing condition that wraps the throw — adapt to whatever the existing code reads.)

**`backend/src/middlewares/error-handler.middleware.ts`** — add the `instanceof` branch BEFORE the existing `knownErrors` allowlist check (so typed errors short-circuit first):

```ts
import { createMiddleware } from "hono/factory";
import { MissingApiKeyError } from "../errors/ai-key-missing-error";
import { UrlFetchError } from "../errors/url-fetch-error";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export function createErrorHandlerMiddleware(logger: ILogger) {
    return createMiddleware(async (c, next) => {
        try {
            await next();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;

            logger.error("Unhandled exception", {
                error: message,
                stack,
                method: c.req.method,
                path: c.req.path,
            });

            // Typed user-actionable errors — surface their messages as 400s.
            if (err instanceof MissingApiKeyError || err instanceof UrlFetchError) {
                return c.json({ error: message }, 400);
            }

            const knownErrors = [
                "Email already registered",
                "Invalid email or password",
                "User not found",
            ];
            if (knownErrors.includes(message)) {
                return c.json({ error: message }, 400);
            }

            return c.json({ error: "Internal server error" }, 500);
        }
    });
}
```

The pre-existing `knownErrors` allowlist stays unchanged.

## Testing

**Create** `backend/tests/middlewares/error-handler.middleware.test.ts`:

Two unit tests using a tiny Hono harness:
1. Endpoint that throws `new MissingApiKeyError("Gemini")` → response is HTTP 400, body `{ error: "No Gemini API key configured…" }`.
2. Endpoint that throws `new UrlFetchError(["https://x.com"])` → response is HTTP 400, body `{ error: "Couldn't fetch content from https://x.com..." }`.

No tests for the throw-site swaps — those are mechanical replacements that the existing scrape-preview integration would catch if broken.

## Rollout

Single PR. Merging it changes only the error responses; no schema, no API contract, no frontend changes. Reversible by reverting the merge if anything goes wrong.

## Open Questions

None. Scope locked at "A" during brainstorming.
