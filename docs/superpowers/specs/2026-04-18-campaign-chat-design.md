# Campaign Chat — 2026-04-18

Replace the static Campaign Detail page with a conversational, Claude-like chat interface. Users can ask questions, drop files, and instruct the AI to edit the campaign plan or propose topics. The AI's responses are streamed, rendered as GitHub-flavored markdown, and can emit structured blocks (plan edits and topic proposals) that integrate with the rest of the app.

Source conversation: brainstorming session on 2026-04-17. Approved via user sign-off at the end of Sections 1–5.

---

## Goal

Turn Campaign Detail into a full campaign copilot. The chat can:
- Answer questions about the brand, the brief, the plan, and existing topics using markdown (tables, lists, headings).
- Edit the campaign plan fields (objective / audience / key message / big idea / messaging pillars) via tool calls. Each edit creates a versioned revision. Users can restore any revision.
- Propose content topics. Each proposal is auto-saved to the Topic Library and includes a "Generate Content" button that opens the Content Generator in a new tab with the topic preselected.
- Accept PDF and image uploads (drag-and-drop or picker) as per-message context.

AI responses stream token-by-token. The provider is selected via env (`AI_CHAT_PROVIDER`, fallback `AI_PROVIDER`) — Gemini and Anthropic both implemented in v1.

---

## Non-goals for v1

- Multi-user co-editing / presence indicators.
- Chat search / export.
- Stop-button mid-stream (request is atomic; send is disabled while a stream is open).
- Syntax-highlighted code blocks (markdown code blocks render in mono font, no highlighter).
- Responsive mobile layout for the revisions sidebar (desktop-first; mobile collapse is a later polish item).
- Rate limiting on chat endpoints (workspace auth is sufficient at MVP scale).

---

## Page layout

```
┌─────────────────────────────────────────────────┬──────────────┐
│  Campaign header                                │  Revisions   │
│  Campaign Plan Card (refetches on plan edits)   │  panel       │
├─────────────────────────────────────────────────┤              │
│  Chat transcript (scrolls)                      │  Rev 3 · …   │
│                                                 │  Rev 2 · …   │
│  [ Type a message... drop file here ]  [ Send ] │  Rev 1 · …   │
└─────────────────────────────────────────────────┴──────────────┘
```

- Header + Plan Card: reused from current CampaignDetailPage. Plan Card gets a `refreshKey` prop so the parent can force a re-render when a `plan_edit` event fires.
- Chat: primary interaction, fills the middle/bottom.
- Revisions: right rail, 240px fixed width on desktop. Each row has a Restore button.
- Existing progress panel (`generating` / `failed` states) still renders instead of chat while the campaign is not yet ready.
- `CampaignSummaryCard` and `CampaignTopicsList` remain on the page, placed above the chat. They continue to function as they do today.

---

## Message block model

A chat message's body is an ordered sequence of typed blocks. This makes it trivial to interleave plain prose with structured outputs.

```ts
type Block =
  | { type: "text";       content: string }             // markdown
  | { type: "plan_edit";  revisionId: string; summary: string }
  | { type: "topics";     topicIds: string[] };
```

A single AI message may contain any number of blocks in any order — e.g., `text → plan_edit → text → topics → text`. Block order is preserved in the DB and the UI.

User messages only ever contain `text` blocks (plus attachments in a separate field).

---

## Data model (three new tables)

### `CampaignChatMessage`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `campaignId` | FK → Campaign | cascade delete |
| `role` | String | `"user"` or `"assistant"` |
| `userId` | FK → User, nullable | populated for user messages; null for assistant |
| `contentBlocks` | Json | `Block[]` (see above) |
| `attachments` | Json | `Attachment[]` (see below); empty array for assistant messages |
| `createdAt` | DateTime | |

Index: `(campaignId, createdAt)` for chronological fetch.

```ts
type Attachment = {
  fileUrl: string;         // MinIO URL
  fileName: string;
  fileType: string;        // MIME
  fileSize: number;        // bytes
  extractedText?: string;  // PDFs only, capped at 10k chars
};
```

### `CampaignPlanRevision`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `campaignId` | FK → Campaign | cascade delete |
| `revisionNumber` | Int | auto-increments per campaign (1, 2, 3…) |
| `triggerMessageId` | FK → CampaignChatMessage, nullable | null for the seed revision |
| `label` | String | short human summary: "Initial plan", "Updated Big Idea", "Reverted to revision 3" |
| `snapshot` | Json | `{ objective, audienceSegment, keyMessage, bigIdea, messagingPillars }` |
| `createdAt` | DateTime | |

Unique: `(campaignId, revisionNumber)`.

**Seeding rule:** the first time any plan edit happens on a campaign (whether via chat or restore), the service first snapshots the current Campaign state as Rev 1 with label "Initial plan", then applies the incoming change as Rev 2. This guarantees history always starts from a restorable baseline.

### Chat-generated topics

No new table. The existing `ContentTopic` table is used. When the AI calls `propose_topics`, rows are inserted with `campaignId` set and `status: "draft"`. The topic ids are stored in the message's `topics` block.

---

## Backend

### New endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/workspaces/:ws/campaigns/:id/chat` | Send a user message; response is an SSE stream of AI output |
| `GET` | `/api/workspaces/:ws/campaigns/:id/chat` | List chat history (chronological) |
| `POST` | `/api/workspaces/:ws/campaigns/:id/chat/upload` | Upload one file; returns URL + extracted text |
| `GET` | `/api/workspaces/:ws/campaigns/:id/revisions` | List plan revisions |
| `POST` | `/api/workspaces/:ws/campaigns/:id/revisions/:revId/restore` | Restore a revision; response is an SSE stream (same shape as /chat) so the "restored" assistant message flows through the same pipeline |

All endpoints sit under the workspace-scoped auth middleware.

### SSE event shapes

```
event: token       data: "partial text"
event: plan_edit   data: { revisionId, revisionNumber, summary, snapshot }
event: topics      data: { topicIds, topics: [{ id, title, description, pillar, platform, format, objective, publishDate }, ...] }
event: error       data: { code, message, toolName? }
event: done        data: { messageId }
```

`token` events accumulate into the current assistant message's last `text` block (a new text block is opened whenever a non-text block has just been emitted). `plan_edit` and `topics` events append their own blocks.

### Server flow for `POST /chat`

1. Validate body (`content` string; `attachments` array of `Attachment`).
2. Persist the user message row.
3. Build the system prompt (see "AI system prompt" below).
4. Fetch last `CHAT_HISTORY_WINDOW` messages (default 20, env-configurable).
5. Enter the **tool-use loop** (see next section).
6. After the loop terminates, persist the assistant message with its collected `contentBlocks`.
7. Emit `done` and close the stream.

### Tool-use loop

Neither Gemini nor Anthropic can return tool results inline in a single API call. When the model emits a tool call, the stream ends; the server must execute the tool and send the result back in a follow-up streaming call. Pseudocode:

```
messages = history + [ userMessage ]
blocks = []

loop:
  stream = provider.stream({ systemPrompt, messages, tools })
  toolCalls = []

  for event in stream:
    if event.type == "text_delta":
      emit SSE "token" with event.delta
      append-or-open text block in `blocks`
    if event.type == "tool_call":
      toolCalls.append(event)

  if toolCalls is empty:
    break   # end of turn

  # Execute each tool call
  toolResults = []
  for call in toolCalls:
    result = execute(call.name, call.input)
    if result emitted a block:
      blocks.append(block)
      emit SSE event for that block
    toolResults.append({ toolUseId: call.id, result })

  messages.append({ role: "assistant", content: rawStreamedContent })
  messages.append({ role: "user", content: toolResults })

persist assistant message with blocks
emit SSE "done"
```

Tool results sent back to the model are intentionally minimal (`{ ok: true, revisionId }` / `{ ok: true, topicCount, topicIds }`) — the model only needs to know the call succeeded to wrap up its final sentence.

### Tools

```ts
const tools = [
  {
    name: "apply_plan_edit",
    description: "Update one or more fields on the campaign plan. Omit fields you're not changing.",
    inputSchema: {
      type: "object",
      properties: {
        objective:       { type: "string" },
        audienceSegment: { type: "string" },
        keyMessage:      { type: "string" },
        bigIdea:         { type: "string" },
        messagingPillars: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name:        { type: "string" },
              description: { type: "string" }
            },
            required: ["name", "description"]
          }
        },
        label: {
          type: "string",
          description: "Short human summary, e.g. 'Reframed Big Idea around family security'"
        }
      },
      required: ["label"]
    }
  },
  {
    name: "propose_topics",
    description: "Propose a list of content topics. They will be auto-saved to the Topic Library.",
    inputSchema: {
      type: "object",
      properties: {
        topics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title:       { type: "string" },
              description: { type: "string" },
              pillar:      { type: "string" },
              platform:    { type: "string" },
              format:      { type: "string" },
              objective:   { type: "string" },
              publishDate: { type: "string", description: "ISO 8601 YYYY-MM-DD, optional" }
            },
            required: ["title", "description", "pillar", "platform", "format", "objective"]
          }
        }
      },
      required: ["topics"]
    }
  }
];
```

The schemas are declared once in `chat.service.ts`. Each provider converts them to its SDK's expected shape at stream-open time.

### Tool execution

**`apply_plan_edit`:**
1. Open a DB transaction.
2. If no `CampaignPlanRevision` exists for this campaign, insert the seed revision (Rev 1, label "Initial plan") from the current Campaign + CampaignOutput fields.
3. Apply changes to `Campaign` (objective / audienceSegment / keyMessage) and `CampaignOutput` (bigIdea / messagingPillars) via a single upsert on CampaignOutput (update or create if none exists).
4. Insert a new `CampaignPlanRevision` row with the next `revisionNumber`, the AI's `label`, a snapshot of the post-change state, and the `triggerMessageId` of the in-flight assistant message.
5. Commit transaction.
6. Return `{ revisionId, revisionNumber, summary: label, snapshot }`.
7. Emit SSE `plan_edit`.

**`propose_topics`:**
1. For each proposed topic, insert a `ContentTopic` with `campaignId = :id`, `workspaceId`, `status: "draft"`, and the proposed fields.
2. Return `{ topicIds, topics: createdRows }`.
3. Emit SSE `topics`.

### File upload (`POST /chat/upload`)

- Accepts `multipart/form-data` with a single `file` field.
- Validates MIME: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`. Rejects with 400 otherwise.
- Rejects files > 10 MB with 413.
- Uploads to MinIO under `chat-uploads/:campaignId/:timestamp.:ext`.
- If PDF: extracts text using a shared `backend/src/utils/pdf-extractor.ts` (lifted from the existing logic in `campaign-pdf-generation.job.ts`), caps at 10,000 chars with a truncation notice.
- If image: no extraction.
- Returns `{ fileUrl, fileName, fileType, fileSize, extractedText? }`. Frontend attaches this to the next outgoing message.

### Restore revision (`POST /revisions/:id/restore`)

1. Look up the target `CampaignPlanRevision`.
2. Apply its snapshot fields to `Campaign` and `CampaignOutput` (same update path as `apply_plan_edit`).
3. Insert a new revision with label `"Reverted to revision N"`.
4. Insert an assistant-role `CampaignChatMessage` with a single `plan_edit` block referencing the new revision.
5. Stream SSE `plan_edit` + `done` so the frontend's chat pipeline treats it as a normal assistant turn.

### AI system prompt

Composed fresh per request:

```
You are a campaign strategy expert. You help the user refine and execute a social
media campaign plan through conversation.

=== Brand context ===
{JSON of the active BrandBrainVersion — tone, personality, audience, contentPillars, values, etc.}

=== Current campaign plan ===
{JSON of current Campaign + CampaignOutput — objective, audienceSegment, keyMessage, bigIdea, messagingPillars}

=== Brief document summary ===
{CampaignBrief.documentSummary, if present}

=== Existing topics in this campaign ===
- "{title}" ({pillar}, {platform})
- ...     (max 30 most recent)

=== Language ===
Respond in {Bahasa Indonesia | English} — derived from the brand's vocabulary.contentLanguage.

=== When to use tools ===
- apply_plan_edit: ONLY when the user explicitly asks to change something. Don't edit proactively.
- propose_topics: when the user asks for topic ideas, or when you have a concrete set to offer.
- Otherwise, respond in plain markdown. Use tables for comparisons, bullets for structured lists.

=== Format ===
Keep responses concise. Markdown renders — use it. Tables render. No raw HTML.
```

### Context window

- **System prompt** per request (campaign state can change).
- **Chat history**: last 20 messages (env `CHAT_HISTORY_WINDOW`, default 20).
  - `text` blocks are joined with `\n\n`.
  - `plan_edit` blocks are flattened to a short marker `[plan was updated: {summary} (rev {n})]`.
  - `topics` blocks are flattened to `[proposed topics: "Title 1", "Title 2", ...]`.
  - Attachments from old user messages: their `extractedText` is re-sent under their original user message, so the model maintains context. Image attachments from old messages are referenced by filename only (re-sending base64 every turn would bloat the context).
- **Current user message**: full text + full attachment extracted text inline (PDFs) + images as base64 multimodal content.
- Each attachment's `extractedText` is capped at 10,000 chars at upload time, so no truncation logic is needed at send time.

### Error handling

| Failure | Server | Frontend |
|---|---|---|
| Provider API error mid-stream | Emit `error` SSE with code + message; persist assistant message with blocks collected so far; close stream | Inline red error bubble on the in-flight message; "Retry" button resends the same user message |
| Tool execution throws | Emit `error` SSE with `toolName` + reason; continue the loop so text can still wrap up | Same error bubble; partial response stays visible |
| Client disconnects mid-stream | Detect via Hono's `c.req.signal`; abort the SDK stream; persist what was streamed | On next page load, GET /chat returns the partial message; nothing lost |
| Provider rate limit (429) | Propagate as error event, status 429 | Bubble with "Try again in a moment" |
| PDF extraction fails | Upload still returns success with `extractedText: null` and a warning in the response | Warning chip on the attachment; user can remove and try another file |

### AI activity logging

Each outer loop iteration calls `logAiActivity()` (existing util) with `generator: "campaign-chat"`, provider, model, token usage, duration, and prompt/response snippets. Shows up in the existing workspace token-usage view.

### Provider abstraction

```ts
interface IChatAiProvider {
  stream(input: {
    systemPrompt: string;
    messages: ChatMessage[];       // provider-agnostic shape
    tools: ToolDefinition[];        // JSON Schema
    multimodal?: MultimodalPart[];  // from the most recent user message (images)
  }): AsyncIterable<ChatStreamEvent>;
}

type ChatStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "error"; message: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } };
```

Both providers normalize their SDK events into this stream. The service layer consumes `ChatStreamEvent` and never touches vendor specifics.

Implementations:
- `GeminiChatProvider` — uses `@google/genai` `generateContentStream` + function calling. Multimodal via `inlineData` parts.
- `AnthropicChatProvider` — uses `@anthropic-ai/sdk` `messages.stream` + tool use. Multimodal via `image` content blocks.

Resolver in `backend/src/index.ts` picks one based on `AI_CHAT_PROVIDER` (fallback `AI_PROVIDER`).

### New module layout

```
backend/src/
  interfaces/
    providers/
      chat-ai.provider.interface.ts
    repositories/
      chat-message.repository.interface.ts
      campaign-revision.repository.interface.ts
    services/
      chat.service.interface.ts
  providers/
    gemini-chat.provider.ts
    anthropic-chat.provider.ts
  repositories/
    chat-message.repository.ts
    campaign-revision.repository.ts
  services/
    chat.service.ts
  routes/
    campaign-chat.route.ts
  utils/
    pdf-extractor.ts                        # lifted from campaign-pdf-generation.job.ts
```

### Tests

Mock-based service tests, following the existing pattern in `tests/services/*`:
- `chat.service.test.ts`:
  - message insert with attachments
  - context builder flattens plan_edit/topics history blocks correctly
  - tool-call dispatch invokes the right repository methods
  - seed revision logic runs on first plan edit
  - propose_topics creates ContentTopic rows with campaignId
- `campaign-revision.repository.test.ts` — next-revision-number + snapshot insert.
- `pdf-extractor.test.ts` — extraction on a known fixture; truncation at 10,000 chars.

Streaming behavior is not unit-tested (SSE clients are awkward); the service-level tests use a scripted mock `IChatAiProvider` that yields fixed events.

---

## Frontend

### New component tree

```
components/campaigns/chat/
  ChatPanel.tsx          — container: header, MessageList, ChatInput, drop overlay
  MessageList.tsx        — scrolling transcript; auto-scroll to bottom; pause when user scrolls up
  Message.tsx            — one message: avatar + blocks, error bubble if errored
  blocks/
    TextBlock.tsx        — react-markdown + remark-gfm + rehype-sanitize
    PlanEditBlock.tsx    — small card: "Updated: Big Idea · Audience" → links to revision row
    TopicsBlock.tsx      — list of TopicCards
    TopicCard.tsx        — title + pillar + platform + "Generate Content" link
  ChatInput.tsx          — textarea + send button + file picker
  AttachmentChips.tsx    — pre-send chips with upload spinner + × to remove

components/campaigns/revisions/
  RevisionsPanel.tsx     — list, scrollable, fetched on mount + refetched on plan_edit
  RevisionRow.tsx        — "Rev N · {label} · {relative time}" + [Restore] button

hooks/
  useChatStream.ts       — opens SSE stream via fetch; exposes { tokens, blocks, isStreaming, error, send, close }

utils/
  sse-parser.ts          — small SSE line parser over fetch's ReadableStream
```

`CampaignDetailPage` is restructured to host the new layout. The existing `CampaignProgressPanel`, `CampaignSummaryCard`, `CampaignPlanCard`, and `CampaignTopicsList` components remain, positioned around the chat.

### Streaming consumer (`useChatStream`)

Uses native `fetch` + `ReadableStream` + `TextDecoder` + a small inline SSE line parser (no new dependency). On user send:

1. Optimistically append the user message to local state.
2. POST to `/chat`; hand the response body to the parser.
3. The parser yields `{ event, data }` objects; the hook updates in-flight state:
   - `token` → appends delta to the current assistant message's last text block (opens a new text block if the prior block was `plan_edit` or `topics`).
   - `plan_edit` → appends a `plan_edit` block and calls `onPlanEdit()` so the parent can refetch the campaign + revisions.
   - `topics` → appends a `topics` block with the full topic data from the event payload.
   - `error` → attaches an error state to the current assistant message.
   - `done` → marks stream complete; replaces the in-flight message with the server-confirmed one using the returned `messageId`.
4. While streaming, `isStreaming === true` and the Send button is disabled.

### File upload UX

- Drop zone is an invisible overlay on the chat panel; activates on `dragenter`. Shows a dashed outline with "Drop to attach".
- On drop (or file picker), each file starts uploading immediately to `/chat/upload`. A chip appears above the textarea with filename + size + spinner.
- On upload success, the chip shows a green check; on failure, a red × with retry option.
- Send button is disabled while any chip is still uploading.
- On send, the chips' returned `Attachment` objects are included in the POST body.
- Multiple files allowed. PDFs and images only (MIME validated client-side too for snappier feedback).

### Markdown rendering

- `react-markdown` + `remark-gfm` for GitHub-flavored markdown (tables, strikethrough, task lists, autolinks).
- `rehype-sanitize` to strip any raw HTML.
- No syntax highlighter — code blocks use default mono styling.

### Auto-scroll behavior

MessageList auto-scrolls to the bottom on new tokens UNLESS the user has scrolled up (threshold: more than 100px above the bottom). A "Jump to latest" floating button appears when paused; clicking it resumes auto-scroll.

### Revision panel interactions

- Fetched on page mount via `GET /revisions`.
- Refetched whenever a `plan_edit` event fires in the chat stream.
- Each row's [Restore] button POSTs to `/revisions/:id/restore`. The response is itself an SSE stream (same event shape as a normal chat turn), so the "Restored revision N" assistant message streams into the chat naturally.
- While any restore is in flight, all rows' Restore buttons are disabled.

### New npm dependencies

- `react-markdown`
- `remark-gfm`
- `rehype-sanitize`

### Testing

No frontend unit tests (this repo relies on type checking + manual smoke testing for the frontend). Backend service tests carry the behavioral safety net.

---

## Env vars

Add to `backend/.env.example`:

```
AI_CHAT_PROVIDER=                # "gemini" or "anthropic". Falls back to AI_PROVIDER.
CHAT_HISTORY_WINDOW=20           # number of past messages sent to the AI
```

No secrets added — Gemini + Anthropic keys are already present.

---

## Migration / rollout

- Adds two new tables via `prisma db push` (no destructive migration). `ContentTopic` is unchanged.
- Existing campaigns work immediately — they just have no chat history or revisions until the user starts interacting.
- No flag or phased rollout needed — the new Campaign Detail layout fully replaces the old one. The existing cards are preserved in place, so users don't lose any current functionality.

---

## Security & privacy notes

- Chat content and attachments are workspace-scoped. The existing workspace middleware already isolates them.
- File uploads go to MinIO under paths that include the campaignId; no guessable URLs outside the workspace.
- The chat stream uses `fetch` + `ReadableStream` (not `EventSource`), so the JWT travels via the standard `Authorization` header through the existing `api` helper. No query-string token is needed.
- PDF extraction runs server-side; the extracted text is stored in the DB and capped at 10k chars so a malicious PDF can't bloat the database.
- Image uploads are not re-encoded; we trust the MIME sniff. Client-side MIME check is UX-only.
- The Resend-style "token in log" concern from the invitations work does not apply here — no tokens in URLs.

---

## What v1 explicitly does not do

- Streaming stop button
- Mobile-specific layouts
- Chat search / export / copy-all
- Syntax-highlighted code blocks
- Multi-user presence indicators
- Gemini + Anthropic parity tests (each provider gets basic coverage; cross-provider equivalence is manual)
- Rate limiting / abuse prevention beyond workspace auth
- Tool-use for anything other than `apply_plan_edit` and `propose_topics`

Each of these can be added later without rearchitecting the interfaces.

---

## Open decisions deferred to the plan

- Whether to split v1 into phases (chat-only → add tools → add streaming) or ship the full thing in one batch. The plan will sequence tasks carefully either way.
- Whether revision labels can be edited by the user after the fact (small bonus feature; leave out unless trivial).
