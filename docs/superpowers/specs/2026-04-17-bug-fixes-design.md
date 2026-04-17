# Bug Fixes — 2026-04-17

Source: `docs/bug-20260417.md` — 7 bugs reported after user testing.

Each bug is independent and ships as its own commit. No database schema changes, no DB reset. Implementation proceeds in the order listed below (cheapest fixes first, biggest fix last).

---

## Bug 5 — Remove redundant "Unsaved changes" label

**Where:** [frontend/src/components/generation/GenerationResultRow.tsx:625-627](frontend/src/components/generation/GenerationResultRow.tsx#L625-L627)

**Problem:** The row shows a "Save Changes" button AND an amber "Unsaved changes" label next to it. After saving, the label disappears correctly — but the two indicators together are redundant and confuse users.

**Fix:** Delete the `{isDirty && (<span>Unsaved changes</span>)}` block. The button's disabled/enabled state already communicates the same thing.

---

## Bug 6 — Regenerated image doesn't update without refresh

**Where:** [frontend/src/components/generation/SectionImageCell.tsx](frontend/src/components/generation/SectionImageCell.tsx) (used by ContentPreviewModal and GenerationResultRow)

**Problem:** User clicks "Regenerate" on an image. Backend generates a new MinIO URL (`sectionId-${Date.now()}.ext`) and returns it. Parent `localSections` updates, `imageUrl` prop changes — but the `<img>` element still shows the old image until the user refreshes the page.

**Hypothesis:** Browser/MinIO caching. Even though the path differs, sometimes the browser cache or MinIO returns a 304 for the image tag. React also doesn't force-reload `<img>` when the parent re-renders if the src looks superficially similar.

**Fix:** Append a cache-buster query param whenever we render the regenerated image:
```tsx
<img src={`${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${regeneratedAt}`} ... />
```
Where `regeneratedAt` is a new state in `SectionImageCell` set to `Date.now()` after a successful regenerate. Initial value `0` (omit cache-buster if never regenerated).

Also add `key={imageUrl}` on the `<img>` to force re-mount if the URL itself changes — belt-and-suspenders.

---

## Bug 4 — Language not followed (English chosen but output is Indonesian)

**Where:** [backend/src/utils/prompt-builder.ts:68-76](backend/src/utils/prompt-builder.ts#L68-L76) (`buildContentGenerationPrompt`)

**Problem:** Frontend sends `language: "english"`. The prompt currently says `Write all copy in english.` at the bottom of the user prompt. But the brand context JSON embedded earlier contains `vocabulary.contentLanguage: "indonesian"` (or Bahasa copy samples), and the LLM biases toward that.

**Fix:**
1. **Normalize** the language value (`"english"` / `"en"` → `"English"`, `"indonesian"` / `"id"` / anything else → `"Bahasa Indonesia"`) in a helper so the prompt wording is always explicit human-language.
2. **Move** the language directive to the **top** of the user prompt as a priority override, and phrase it strongly:
   ```
   CRITICAL LANGUAGE REQUIREMENT: Write ALL user-facing copy (hook, caption, CTA, hashtags, slide/scene text) in {Language}. This overrides any language signal in the brand context below. Do NOT switch languages mid-output.
   ```
3. Keep the existing `Language: {lang}` line in the metadata block for clarity.

No frontend changes. No schema changes.

---

## Bug 3 — "Generate Content" button on saved topics (opens in new tab)

**Where:** [frontend/src/pages/TopicsPage.tsx](frontend/src/pages/TopicsPage.tsx) — the generated topic cards on the right panel.

**Problem:** After the user clicks "Save All Topics", there's no way to jump from a specific topic to the Content Generator. They have to navigate to Topic Library and search.

**Fix:**
1. Show a "Generate Content" button on every topic card, **but only after `topicsSaved === true`** (topics are drafts in the DB the moment they're generated, so the button can work earlier — but hiding it until "Save All" preserves the existing save/commit UX).
2. Button is an `<a href={url} target="_blank" rel="noopener noreferrer">` so it opens in a new tab.
3. URL: `/generate?brandId={brandId}&productId={productId}&topicId={topic.id}&platform={topic.platform}&format={topic.format}&objective={topic.objective}` — GeneratePage already reads and normalizes all these params.
4. If multiple products were selected on the topic, pass multiple `productId` params (GeneratePage handles `searchParams.getAll("productId")`).

No backend changes.

---

## Bugs 1 + 2 — Pillar single-select + constrain topic generation

**Scope:** Allow the user to pick exactly one brand content pillar for topic generation. No pillar chosen = mixed across all pillars. Every generated topic still stores exactly one pillar (current schema).

### Frontend — TopicsPage

**Where:** [frontend/src/pages/TopicsPage.tsx](frontend/src/pages/TopicsPage.tsx)

The existing "Brand Content Pillars" section shows pillars as read-only badges (lines 486-502). Turn those badges into **clickable single-select chips**:

- Initial state: none selected → "Mixed (all pillars)" implied
- Click a pillar → that chip becomes selected (highlighted with its own color stronger / outlined); others de-select
- Click the same selected pillar again → deselect → back to mixed
- Small helper text: "Pick one pillar, or leave blank to mix across all"

Add state: `const [selectedPillar, setSelectedPillar] = useState<string>("")`.

Reset `selectedPillar` when `brandId` changes (same place where `contentPillars` is reset).

In `handleGenerate`, include `pillar: selectedPillar || undefined` in the POST body.

In `handleRegenerateSingle`, also pass `pillar: selectedPillar || undefined` so regenerated topics stay on the selected pillar.

### Backend — Request shape

**Where:**
- [backend/src/types/topic.types.ts](backend/src/types/topic.types.ts) — add `pillar?: string` to `GenerateTopicsInput`
- [backend/src/routes/topic.route.ts:23-52](backend/src/routes/topic.route.ts#L23-L52) — thread `pillar` through `/generate` and `/regenerate-preview`
- [backend/src/services/topic.service.ts:50-125](backend/src/services/topic.service.ts#L50-L125) — pass `pillar` to pg-boss job data
- [backend/src/jobs/topic-generation.job.ts](backend/src/jobs/topic-generation.job.ts) and [backend/src/jobs/topic-regeneration.job.ts](backend/src/jobs/topic-regeneration.job.ts) — accept `pillar` and pass to `buildTopicGenerationPrompt`

### Backend — Prompt logic

**Where:** [backend/src/utils/prompt-builder.ts:102-160](backend/src/utils/prompt-builder.ts#L102-L160) (`buildTopicGenerationPrompt`)

Add `pillar?: string` to `TopicGenerationInput`. Change the pillar rule in the prompt:

- If `pillar` is set:
  > `"pillar" (string, REQUIRED): Use EXACTLY this value: "{pillar}". Every topic must have pillar set to "{pillar}". Do not invent other pillar names.`
- If `pillar` is NOT set:
  > `"pillar" (string, REQUIRED): Pick one appropriate pillar from the brand's pillar list in the brand context. Distribute topics across multiple pillars. Never leave empty.`

Also extend the interface in [backend/src/interfaces/providers/topic-generator.interface.ts](backend/src/interfaces/providers/topic-generator.interface.ts) to include `pillar?: string` in `TopicGenerationInput`.

### Data persistence

No schema change. The existing `ContentTopic.pillar` (nullable string) already supports "1 topic → 1 pillar". The generation job already writes `topic.pillar` into the DB row.

---

## Bug 7 — Workspace invitation flow (email + accept page)

End-to-end invitation flow with email delivery via Resend.

### Config

**Add to `backend/.env`** (not `.env.example` — `.env.example` gets sanitized placeholders):
```
RESEND_API_KEY=re_...        # user-provided; MUST be rotated since it was pasted in chat
EMAIL_FROM=onboarding@resend.dev
APP_URL=http://localhost:5173
INVITATION_TOKEN_EXPIRY=7d
```

**Add to `.env.example`** (placeholders only):
```
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
APP_URL=http://localhost:5173
INVITATION_TOKEN_EXPIRY=7d
```

### Backend

**New module `backend/src/providers/email.provider.ts`:**
Wraps the Resend SDK. Interface `IEmailProvider` with `sendInvitation({ to, workspaceName, inviterName, inviterEmail, role, acceptUrl })`. Concrete `ResendEmailProvider` uses `@resend/node`. Also provide a `NoopEmailProvider` used when `RESEND_API_KEY` is missing (logs a warning and returns success) — keeps dev environments without the key from crashing.

Wire it in the composition root [backend/src/index.ts](backend/src/index.ts).

**Token/expiry helper `backend/src/utils/duration.ts`:**
Parse `"7d" | "12h" | "30m" | "60s"` → milliseconds via a small inline regex (no new dependency). Used only by invitation expiry. Don't touch JWT handling — `jsonwebtoken` parses `"7d"` itself.

**Dependencies:**
- `bun add resend` — Resend SDK.
- No other new packages; duration parser is inline.

**Service changes — `backend/src/services/workspace.service.ts`:**
1. `invite()` — after creating the invitation, call `emailProvider.sendInvitation(...)` with `acceptUrl = ${APP_URL}/accept-invitation?token=${invitation.id}`. If email fails, keep the DB row and surface the error so the admin can retry.
2. `acceptInvitation()` — before accepting, check `createdAt + INVITATION_TOKEN_EXPIRY < now`. If expired, flip `status` to `"expired"` and throw `"Invitation has expired"`.
3. Add `resendInvitation(invitationId, userId)` — permission: only the workspace admin (or the original inviter). Re-sends the email, does NOT touch `createdAt` (so the expiry clock is not reset). If you want to restart the clock you'd need a new invitation — decision: keep it simple, don't reset.
4. Add `getInvitationByToken(token)` — public fetch returning `{ workspaceName, role, inviterEmail, inviterName, inviteeEmail, status, isExpired }`. Does NOT leak workspace internals beyond the name.
5. Add `listPendingForEmail(email)` — returns pending invitations for the currently logged-in user's email (for the in-app banner). Filters out invitations where `createdAt + INVITATION_TOKEN_EXPIRY < now` so the banner never shows stale/expired ones. Does NOT mutate their status — that only happens on accept attempt.

**Route changes — `backend/src/routes/workspace.route.ts`:**
- Add `POST /:id/invitations/:invId/resend` → calls `resendInvitation`.

**New public route — `backend/src/routes/invitation.route.ts`:**
- `GET /api/invitations/:token` (NO auth middleware) → `getInvitationByToken`
- `POST /api/invitations/:token/accept` (auth required) → `acceptInvitation`. Requires the logged-in user's email to match the invitation email.

**New authenticated route — `backend/src/routes/auth.route.ts` or a new `/me` route:**
- `GET /api/me/invitations` → `listPendingForEmail(currentUser.email)` for the dashboard banner.

**Signup auto-accept:**
Extend `POST /api/auth/signup` to accept an optional `invitationToken` in the body. After successful signup, if the token is valid and the invitee email matches the just-created user's email, automatically accept the invitation before returning the session. This powers the "Sign up and join workspace" flow without a second round-trip.

### Frontend

**New page `frontend/src/pages/AcceptInvitationPage.tsx`** at route `/accept-invitation`:
1. Read `token` from query string. If missing → show "Invalid invitation" and link to login.
2. Call `GET /api/invitations/:token` (public) → show `{ workspaceName, role, inviterEmail, status, isExpired }`.
3. Branch on the user's auth state and email match:
   - **Logged out** → show signup form (email input pre-filled from invitation and locked; full name + password fields). Submit calls `POST /api/auth/signup` with `invitationToken`. On success → redirect to the workspace.
     - Include a "Already have an account? Sign in" link → navigates to login with `?redirect=/accept-invitation?token=XXX` so the user returns here after login.
   - **Logged in, email matches** → show "Join {workspace}" button → `POST /api/invitations/:token/accept` → redirect to workspace.
   - **Logged in, email differs** → "This invitation is for {email}. Please sign out and sign in with that account." with a Sign Out button.
4. Handle `status === "accepted"` → show "You're already a member" + link to workspace.
5. Handle `status === "expired"` or `isExpired === true` → show "This invitation has expired. Ask {inviter} to send a new one."
6. Handle `status === "revoked"` → show "This invitation has been revoked."

Add the route to the app router — probably in `frontend/src/App.tsx`.

**Dashboard banner:**
Add a small banner component to [frontend/src/pages/DashboardPage.tsx](frontend/src/pages/DashboardPage.tsx) that fetches `GET /api/me/invitations` on mount. If there are pending ones, render a card:
> "You have 2 pending workspace invitations. [View]"
> clicking [View] navigates to `/accept-invitation?token={firstInvitation.id}`. If more than one, show a list.

**Resend button — WorkspaceSettingsPage InvitationsTab:**
Add a "Resend" button next to pending invitations → calls `POST /api/workspaces/:id/invitations/:invId/resend` → toast "Invitation resent".

### Email template

HTML (kept minimal — inline styles, no external assets):
```
Subject: {inviterName} invited you to join {workspaceName} on FCE Dashboard

You've been invited to join the "{workspaceName}" workspace as a {role}.

Inviter: {inviterName} <{inviterEmail}>
Expires: in {expiryHuman} (e.g., "7 days")

[Accept Invitation] → {acceptUrl}

If you don't recognise this invitation, you can ignore this email.
```

### Security & edge cases

- Token is the invitation UUID — unguessable. Not rotatable, so a leaked token = accessible invitation until it's accepted/revoked/expired. Acceptable for MVP.
- The accept endpoint already verifies `invitation.email === userEmail` — keep that check.
- If the same email has multiple pending invitations to different workspaces, the banner shows all of them.
- If an admin invites an email that already exists as a member of the workspace, the service should reject with a clear error. This check lives in `invite()` — verify it exists, add if missing.
- Email provider failure must NOT roll back the invitation row — admin can use "Resend" to retry.

### What's explicitly out of scope

- No email templates beyond plain HTML. No React Email / MJML.
- No SPF/DKIM/DMARC setup — `onboarding@resend.dev` is sufficient for dev. Production domain verification is a separate task.
- No rate-limiting on the public `GET /api/invitations/:token` endpoint. The UUID is unguessable so enumeration is not a realistic risk at MVP scale.
- Token rotation / invalidation beyond accept/revoke/expire.

---

## Implementation order

1. **Bug 5** — single-line removal (smallest, safest)
2. **Bug 6** — cache-buster on image src
3. **Bug 4** — prompt directive rewrite
4. **Bug 3** — per-topic "Generate Content" button
5. **Bugs 1 + 2** — pillar single-select + prompt constraint
6. **Bug 7** — invitation end-to-end (biggest — new provider, new page, new routes)

Each bug ends with a commit. No PR split — all fixes share the same design doc and land on `main` as individual commits.
