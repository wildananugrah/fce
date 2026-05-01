# OpenRouter AI Mode — Design

**Date:** 2026-05-01
**Status:** Spec
**Owner:** Backend / Frontend

## Problem

The FCE backend currently routes every AI call through one of two hand-rolled providers (`AnthropicProvider`, `GeminiProvider`) plus their chat/image/video siblings. Switching models means redeploying with new env vars or hand-rolling a new provider class for every model family. The user wants flexible model selection — pick any model that ships on OpenRouter, swap it per generator, change it without rewriting code.

## Goals

- Add an "OpenRouter mode" controlled by a single env flag. When the flag is on, **every** AI call (text generation, chat, scene image generation, video analysis) routes through OpenRouter.
- Keep the existing Anthropic+Gemini path intact and selectable via the env flag — switching modes is reversible without data migration.
- Per-workspace UI: pick OpenRouter API key + a default model + optional per-generator model overrides. Live-autocomplete model picker backed by OpenRouter's `/models` endpoint.
- Single-PR rollout, no feature flag, no schema migration script — just `prisma db push` to add nullable columns.

## Non-Goals

- **Per-workspace mode switching.** `AI_MODE` is global to the deployment. A workspace can't independently choose OpenRouter while another stays on legacy.
- **OpenRouter as a third coexisting provider.** OpenRouter mode hides the Anthropic+Gemini sections entirely. Users don't get a three-way choice.
- **Encryption at rest for the OpenRouter API key.** Stored plaintext, matching the existing pattern for Anthropic/Gemini/Apify keys. Encryption is a separate initiative across all credentials.
- **Migrating existing Anthropic/Gemini saved values.** They sit in the DB unused while OpenRouter mode is active. Switching `AI_MODE` back to `legacy` restores them as-is.

## Architecture

```
                ┌─────────────────────────┐
                │ .env: AI_MODE           │
                │   openrouter | legacy   │
                └─────────────┬───────────┘
                              │ at boot
                              ▼
              ┌───────────────────────────┐
              │ AiProviderFactory         │
              │   if mode === openrouter: │
              │     OpenRouter for ALL    │
              │   else: existing 2-prov   │
              └─────────────┬─────────────┘
                            │
            ┌───────────────┼───────────────┬─────────────────┐
            ▼               ▼               ▼                 ▼
       OpenRouter     OpenRouter      OpenRouter        OpenRouter
       text+chat      image           video             (per-generator
       (5 gens)       (scene gen)     (competitor       model override)
                                       analysis)
```

`AI_MODE` is read once in `src/index.ts` and threaded into the factory constructor. No per-request mode switching.

In OpenRouter mode the factory ignores the workspace's `aiProvider` / `anthropic*` / `gemini*` fields entirely and resolves OpenRouter values: per-generator model override → workspace default model → env default model. API key resolution follows the same order. The legacy code path stays in the codebase for `AI_MODE=legacy`.

Image and video both go through OpenRouter in OpenRouter mode. Image uses an image-capable model (e.g. `google/gemini-2.5-flash-image-preview`) via chat-completions and parses the response's image fields. Video uploads bytes to MinIO via the existing `MinioStorageProvider`, generates a signed URL, and passes the URL to OpenRouter as `{type: "video_url", video_url: {url}}` in the message payload — meaning the chosen video model must accept video URL input.

## Backend Changes

### New provider classes

- **`backend/src/providers/openrouter.provider.ts`** — implements `IContentGenerator`, `ICampaignGenerator`, `ITopicGenerator`, `IBrandScraper`, `ICampaignBriefSummarizer`. One class with five methods, mirrors `AnthropicProvider` shape. Uses plain `fetch()` against `https://openrouter.ai/api/v1/chat/completions` (no new SDK dependency). Tracks `lastUsage` for token counting.
- **`backend/src/providers/openrouter-chat.provider.ts`** — implements `IChatAiProvider`. Streaming chat, mirrors `AnthropicChatProvider`.
- **`backend/src/providers/openrouter-image.provider.ts`** — same shape as `GeminiImageProvider`. Calls OpenRouter chat-completions with the configured image model, parses generated images from the response.
- **`backend/src/providers/openrouter-video.provider.ts`** — same shape as `GeminiVideoAnalyzerProvider`. Takes video bytes, uploads to MinIO, gets a signed URL, sends to OpenRouter with the `{type: "video_url", ...}` message payload.

### Schema (`backend/prisma/schema.prisma`)

Add to `WorkspaceSetting`:

```prisma
openrouterApiKey            String? @map("openrouter_api_key")
openrouterModel             String? @map("openrouter_model")
openrouterContentModel      String? @map("openrouter_content_model")
openrouterCampaignModel     String? @map("openrouter_campaign_model")
openrouterTopicModel        String? @map("openrouter_topic_model")
openrouterBrandScraperModel String? @map("openrouter_brand_scraper_model")
openrouterChatModel         String? @map("openrouter_chat_model")
openrouterImageModel        String? @map("openrouter_image_model")
openrouterVideoModel        String? @map("openrouter_video_model")
```

All nine columns nullable, default NULL. Existing Anthropic/Gemini columns remain untouched.

### Factory branching (`backend/src/services/ai-provider-factory.service.ts`)

`AiProviderFactory` constructor gains a `mode: "openrouter" | "legacy"` parameter:

- **`legacy`** — existing resolution unchanged.
- **`openrouter`** — adds OpenRouter env defaults (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, etc.) to `EnvAiDefaults`. The internal `resolve()` method ignores `aiProvider` / `anthropic*` / `gemini*` workspace fields when in this mode. Each generator getter (`getContentGenerator`, etc.) returns an `OpenRouterProvider` instance configured with the resolved per-generator model.

`getGeminiImageProvider(workspaceId)` is renamed to `getImageProvider(workspaceId)` and the factory decides which class to instantiate. Same for video. Existing call sites (`SceneImageService`, `CompetitorPipelineService`) are updated to use the renamed methods.

`ResolvedAiSettings` gains an `openrouter` block + the `source` map gains entries for the new fields, mirroring the existing `anthropic` / `gemini` shape.

### Env config

Add to `backend/.env.example`:

```dotenv
# AI provider mode. "legacy" = current Anthropic+Gemini setup. "openrouter" =
# all generators (text, chat, image, video) routed through OpenRouter.
AI_MODE=legacy

# Used only when AI_MODE=openrouter. Per-workspace overrides land in
# WorkspaceSetting.openrouter*; these env values are the fallback default.
OPENROUTER_API_KEY=
OPENROUTER_MODEL=                    # default for all generators if unset below
OPENROUTER_CONTENT_MODEL=
OPENROUTER_CAMPAIGN_MODEL=
OPENROUTER_TOPIC_MODEL=
OPENROUTER_BRAND_SCRAPER_MODEL=
OPENROUTER_CHAT_MODEL=
OPENROUTER_IMAGE_MODEL=              # must be image-capable
OPENROUTER_VIDEO_MODEL=              # must accept video URL input
```

### New endpoints

- **`GET /api/system/ai-mode`** → `{ mode: "openrouter" | "legacy" }`. No auth (deployment fact, not a secret). Frontend calls once on app boot.
- **`POST /api/workspaces/:id/ai-settings/test-openrouter`** with body `{apiKey, model}`. Backend hits `https://openrouter.ai/api/v1/models` to validate the model id, then sends a 1-token `chat/completions` to validate the key. Returns `{ok: true}` or `{ok: false, error: <reason>}`.

`PUT /api/workspaces/:id/ai-settings` keeps its existing shape. The body validator accepts the new OpenRouter fields and rejects fields that don't apply to the current mode (e.g. rejects `anthropicApiKey` when `AI_MODE=openrouter`).

### Validation rule for `PUT ai-settings`

In OpenRouter mode, the request body may contain only OpenRouter and Apify fields. Any `aiProvider`, `aiContentProvider`, `anthropicApiKey`, `geminiApiKey`, etc. in the request body returns 400 with the specific field name. Symmetric in legacy mode.

## Frontend Changes

### Mode awareness

`AuthContext` (or a new lightweight `SystemContext` if `AuthContext` feels overloaded) calls `GET /api/system/ai-mode` once on app boot and exposes `{mode}`. Workspace Settings → Integrations branches on it.

### Legacy mode UI

Unchanged. The existing screenshot stays as-is.

### OpenRouter mode UI

The "AI Providers" header section (Default provider dropdown + 5 per-generator provider dropdowns) is removed in this mode — all generators are OpenRouter, no provider switching needed. In its place: one card.

```
┌─ AI Providers ────────────────────────────────────────────────┐
│ All generators are powered by OpenRouter. Pick the model      │
│ for each generator below.                                     │
│                                                               │
│ ┌─ OpenRouter ───────────────────────────────────────────┐    │
│ │ API Key        sk-or-v1-…                  [ Show ]    │    │
│ │                                                        │    │
│ │ Default model  [▾ anthropic/claude-sonnet-4.5    ]     │    │
│ │                Used when a generator has no override.  │    │
│ │                                                        │    │
│ │ ── Per-generator overrides (optional) ──────────────   │    │
│ │ Content        [▾ anthropic/claude-opus-4.7      ]     │    │
│ │ Campaign       [▾                              ] (default)│ │
│ │ Topic          [▾ google/gemini-2.5-flash        ]     │    │
│ │ Brand Scraper  [▾                              ] (default)│ │
│ │ Chat           [▾ anthropic/claude-sonnet-4.5    ]     │    │
│ │                                                        │    │
│ │ ── Media ──────────────────────────────────────────    │    │
│ │ Image model    [▾ google/gemini-2.5-flash-image] ⓘ    │    │
│ │                Image-capable models only.              │    │
│ │ Video model    [▾ google/gemini-2.5-flash      ] ⓘ    │    │
│ │                Must accept video URL input.            │    │
│ │                                                        │    │
│ │                              [ Test connection ]       │    │
│ └────────────────────────────────────────────────────────┘    │
│                                                               │
│                                       [ Save AI settings ]    │
└───────────────────────────────────────────────────────────────┘
```

The Apify card below stays unchanged in both modes. Page subtitle in OpenRouter mode reads `Configure your OpenRouter API key and model selection for this workspace.`

### Reusable component: `<OpenRouterModelPicker>`

- **Behavior:** combobox — type-ahead text input + popdown filtered list. Free-text accepted (so a model id works the day OpenRouter ships it).
- **Data source:** one `GET https://openrouter.ai/api/v1/models` call from the frontend on first picker mount, cached in a `useOpenRouterModels()` hook for the session. Includes a manual "Refresh" affordance in the popdown.
- **Filter prop:** `category="image"` filters to image-capable models using the response's `architecture.input_modalities` / `architecture.output_modalities` fields. `category="video"` filters to models whose `architecture.input_modalities` includes `video`. Default text generators have no filter.
- **Failure mode:** if the fetch fails, the picker falls back to a plain free-text input with a one-line "Couldn't load model list — type model id manually" hint.
- **Visual:** matches existing select styling (border, rounded, focus ring). Looks identical to the current model text fields, just with a chevron and live filtering.

### Test connection feedback

Inline pill below the button — green "Connected" or red "Failed: <reason>" — matching the existing Anthropic/Gemini Test Connection feedback pattern.

## Migration

### Schema

```bash
cd backend
set -a && source .env && set +a
bunx prisma db push
bunx prisma generate
```

Adds 9 nullable columns to `workspace_settings`. No data migration script. Idempotent (re-runnable safely).

### Mode default

`AI_MODE` defaults to `legacy` when unset. Existing deployments are unaffected by this PR until the operator explicitly sets `AI_MODE=openrouter` and restarts.

### Operator runbook

To switch a deployment to OpenRouter:

1. Edit `.env`: set `AI_MODE=openrouter`, optionally set deployment-wide `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`.
2. Restart the backend.
3. Per-workspace overrides via Workspace Settings → Integrations → OpenRouter card.

To revert to legacy: change `AI_MODE` back to `legacy` (or unset), restart. Saved Anthropic/Gemini values reappear in the UI; saved OpenRouter values stay in the DB but are ignored.

### Backwards compatibility

- Legacy mode: zero behavior change. Same routes, same UI, same factory resolution.
- OpenRouter mode: workspaces that haven't configured an OpenRouter key fall back to env values. If both are blank, generators throw `MissingApiKeyError` with `"OpenRouter"` as the provider name (reusing the existing typed error class).

### CLAUDE.md update

Append to the "Per-Workspace AI Provider Resolution" section:

> When `AI_MODE=openrouter` (instead of the default `legacy`), all AI calls — text, chat, image, video — route through OpenRouter regardless of `aiProvider` settings. Workspaces configure an OpenRouter API key + per-generator model selections under Workspace Settings → Integrations. The existing Anthropic+Gemini fields stay in the DB unused; flipping `AI_MODE` back to `legacy` restores them.

## Testing

### Backend unit tests

- **`tests/providers/openrouter.provider.test.ts`** (new) — mock `fetch`. For each of the 5 interface methods: assert the outgoing POST body has the right model + messages, and that the response parses into the expected return value. Cover one happy path + one parse-failure path per method.
- **`tests/providers/openrouter-chat.provider.test.ts`** (new) — mock streaming response. Assert chunks parse correctly and `onToken` callbacks fire in order.
- **`tests/providers/openrouter-image.provider.test.ts`** (new) — mock chat-completions response with `images[].image_url`. Assert image URL/bytes is extracted.
- **`tests/providers/openrouter-video.provider.test.ts`** (new) — mock MinIO upload, signed URL generation, and OpenRouter call. Assert video URL is correctly threaded into the message payload.
- **`tests/services/ai-provider-factory.service.test.ts`** (extend) — add cases:
  - `mode="openrouter"` returns `OpenRouterProvider` regardless of `record.aiProvider` value.
  - `mode="legacy"` returns Anthropic/Gemini per existing logic (regression guard).
  - `OPENROUTER_API_KEY` env fallback works when the workspace field is null.
  - Per-generator model override resolves correctly: per-generator override → workspace default → env per-generator → env default.
- **`tests/routes/system.route.test.ts`** (new) — `GET /api/system/ai-mode` returns `{mode: "openrouter"}` when constructed with that value, `{mode: "legacy"}` otherwise.

### Frontend tests

This codebase has no frontend test suite. Skip.

### Manual smoke

1. **Legacy mode unchanged:** unset `AI_MODE`, restart. Open Workspace Settings → Integrations. Should look identical to today's UI. Save Anthropic key, run a content generation, confirm output. Reverts the system to a known-good baseline.
2. **Switch to OpenRouter:** set `AI_MODE=openrouter`, set `OPENROUTER_API_KEY` (deployment fallback), restart. Open Workspace Settings → Integrations. Should show the new OpenRouter card with no Anthropic/Gemini section. Apify section unchanged.
3. **Model picker live load:** click the Default model dropdown — list populates from OpenRouter API. Type "claude" — list filters. Pick `anthropic/claude-sonnet-4.5`. Save.
4. **Test connection:** click Test connection. Green pill on success. Then enter a garbage model id, Test connection → red pill with error.
5. **Per-generator override:** set Content override to a different model. Save. Run a content generation. Inspect AI activity log — should record the override model, not the default.
6. **Image generation:** trigger scene image generation in content workflow. Confirm image lands and `ai_provider_logs` records the OpenRouter image model.
7. **Video analysis:** kick off a competitor analysis on a TikTok URL with a small video. Confirm analysis completes and the log records the OpenRouter video model and a MinIO-hosted video URL.
8. **Flip back:** set `AI_MODE=legacy`, restart. Confirm the original UI returns and previously saved Anthropic/Gemini values are still in the DB and rendered. Run a generation to confirm legacy path still works.

### Not tested automatically

- **MinIO public/signed URL access from OpenRouter's servers.** Validated via manual smoke step 7.
- **OpenRouter's actual model catalog.** Frontend autocomplete uses a live API; consumer behavior is tested with mocked fetches but the live endpoint isn't.

## Files

### Created

- `backend/src/providers/openrouter.provider.ts`
- `backend/src/providers/openrouter-chat.provider.ts`
- `backend/src/providers/openrouter-image.provider.ts`
- `backend/src/providers/openrouter-video.provider.ts`
- `backend/src/routes/system.route.ts` — hosts `GET /api/system/ai-mode`
- `frontend/src/components/settings/OpenRouterModelPicker.tsx`
- `frontend/src/hooks/useOpenRouterModels.ts`
- `backend/tests/providers/openrouter.provider.test.ts`
- `backend/tests/providers/openrouter-chat.provider.test.ts`
- `backend/tests/providers/openrouter-image.provider.test.ts`
- `backend/tests/providers/openrouter-video.provider.test.ts`
- `backend/tests/routes/system.route.test.ts`

### Modified

- `backend/prisma/schema.prisma` — add 9 nullable columns to `WorkspaceSetting`.
- `backend/src/services/ai-provider-factory.service.ts` — `mode` parameter, branching, OpenRouter env defaults.
- `backend/src/index.ts` — read `AI_MODE`, pass into factory constructor; rename calls to image/video provider getters.
- `backend/src/services/scene-image.service.ts` — use renamed `getImageProvider()`.
- `backend/src/services/competitor-pipeline.service.ts` — use renamed `getVideoAnalyzer()`.
- `backend/src/routes/workspace-ai-settings.route.ts` — accept new OpenRouter fields, mode-aware request validation, `/test-openrouter` endpoint.
- `backend/src/repositories/workspace-setting.repository.ts` — `update()` and `findByWorkspace()` cover new columns.
- `backend/.env.example` — new OpenRouter keys + `AI_MODE`.
- `backend/tests/services/ai-provider-factory.service.test.ts` — extend with the new cases.
- `frontend/src/contexts/AuthContext.tsx` (or new `SystemContext.tsx`) — fetch and expose `aiMode`.
- `frontend/src/pages/WorkspaceSettingsPage.tsx` (or wherever Integrations lives) — mode-aware Integrations tab.
- `CLAUDE.md` — append paragraph to "Per-Workspace AI Provider Resolution".

## Rollout

Single PR. Backwards-compatible at every layer because `AI_MODE` defaults to `legacy`. No feature flag — `AI_MODE` itself is the flag.

## Open Questions

None.
