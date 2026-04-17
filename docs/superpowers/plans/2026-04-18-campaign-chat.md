# Campaign Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Campaign Detail page into a Claude-like chat copilot with streamed markdown responses, file uploads (PDF/image), AI-driven plan edits with versioned revisions, and auto-saved topic proposals that link to the Content Generator.

**Architecture:** New service (`ChatService`) orchestrates a provider-agnostic streaming loop that handles text tokens and tool calls (`apply_plan_edit`, `propose_topics`). Tools execute server-side against a transactional repository layer. Two new tables (`CampaignChatMessage`, `CampaignPlanRevision`) carry persistent state. Frontend consumes a streamed SSE response via `fetch`+`ReadableStream` (no EventSource), rendering markdown with `react-markdown`+`remark-gfm`+`rehype-sanitize`. Gemini is the primary provider; Anthropic is implemented behind the same interface for env-switching.

**Tech Stack:** Bun + Hono + Prisma 7 + pg-boss (backend), React 19 + Vite 8 + Tailwind 4 + React Router 7 (frontend), `@google/genai` (Gemini) + `@anthropic-ai/sdk` (Anthropic), MinIO (file storage), PostgreSQL.

Design doc: [docs/superpowers/specs/2026-04-18-campaign-chat-design.md](docs/superpowers/specs/2026-04-18-campaign-chat-design.md)

---

## File structure

### Backend — new files

- `backend/src/types/chat.types.ts` — shared DTOs for chat messages, blocks, attachments, events
- `backend/src/utils/pdf-extractor.ts` — lifted from `campaign-pdf-generation.job.ts`; takes a URL, returns text (truncated to 10k chars)
- `backend/src/interfaces/providers/chat-ai.provider.interface.ts` — `IChatAiProvider` + `ChatStreamEvent` types
- `backend/src/interfaces/repositories/chat-message.repository.interface.ts`
- `backend/src/interfaces/repositories/campaign-revision.repository.interface.ts`
- `backend/src/interfaces/services/chat.service.interface.ts`
- `backend/src/repositories/chat-message.repository.ts`
- `backend/src/repositories/campaign-revision.repository.ts`
- `backend/src/providers/gemini-chat.provider.ts`
- `backend/src/providers/anthropic-chat.provider.ts`
- `backend/src/services/chat.service.ts`
- `backend/src/routes/campaign-chat.route.ts`
- `backend/tests/utils/pdf-extractor.test.ts`
- `backend/tests/services/chat.service.test.ts`
- `backend/tests/helpers/mock-chat-message.repository.ts`
- `backend/tests/helpers/mock-campaign-revision.repository.ts`
- `backend/tests/helpers/mock-chat-ai.provider.ts`

### Backend — modified files

- `backend/prisma/schema.prisma` — add `CampaignChatMessage` + `CampaignPlanRevision` models, relations on `Campaign`
- `backend/src/utils/env.ts` — add `aiChatProvider`, `chatHistoryWindow`
- `backend/.env.example` — add `AI_CHAT_PROVIDER`, `CHAT_HISTORY_WINDOW`
- `backend/src/index.ts` — instantiate chat provider, service, route; wire under workspace-scoped app
- `backend/src/jobs/campaign-pdf-generation.job.ts` — use the shared `pdf-extractor.ts` (delete the inline method)

### Frontend — new files

- `frontend/src/utils/sse-parser.ts` — SSE line parser for `fetch`+`ReadableStream`
- `frontend/src/hooks/useChatStream.ts` — opens the stream and drives blocks + tokens state
- `frontend/src/components/campaigns/chat/ChatPanel.tsx`
- `frontend/src/components/campaigns/chat/MessageList.tsx`
- `frontend/src/components/campaigns/chat/Message.tsx`
- `frontend/src/components/campaigns/chat/ChatInput.tsx`
- `frontend/src/components/campaigns/chat/AttachmentChips.tsx`
- `frontend/src/components/campaigns/chat/blocks/TextBlock.tsx`
- `frontend/src/components/campaigns/chat/blocks/PlanEditBlock.tsx`
- `frontend/src/components/campaigns/chat/blocks/TopicsBlock.tsx`
- `frontend/src/components/campaigns/chat/blocks/TopicCard.tsx`
- `frontend/src/components/campaigns/revisions/RevisionsPanel.tsx`
- `frontend/src/components/campaigns/revisions/RevisionRow.tsx`

### Frontend — modified files

- `frontend/src/pages/CampaignDetailPage.tsx` — new layout: plan card on top, chat in main, revisions in right rail
- `frontend/package.json` — add `react-markdown`, `remark-gfm`, `rehype-sanitize`

---

## Phased sequencing

Each phase commits a working slice. If you have to stop between phases, what's shipped still works.

- **Phase 1:** DB schema + PDF extractor util (foundation)
- **Phase 2:** Chat provider interface + Gemini impl (no tools yet, just streaming text)
- **Phase 3:** Repositories + ChatService + chat endpoints (text-only backend MVP)
- **Phase 4:** Frontend chat MVP (text-only streaming in UI, no uploads, no tools)
- **Phase 5:** File uploads (PDFs + images)
- **Phase 6:** `propose_topics` tool (end-to-end including TopicCard UI)
- **Phase 7:** `apply_plan_edit` tool + revisions panel + restore
- **Phase 8:** Anthropic provider + env-switchable resolver

---

## Phase 1 — DB schema + PDF extractor util

### Task 1.1: Lift PDF extractor into shared util (TDD)

**Files:**
- Create: `backend/src/utils/pdf-extractor.ts`
- Create: `backend/tests/utils/pdf-extractor.test.ts`
- Modify: `backend/src/jobs/campaign-pdf-generation.job.ts` — replace inline method

- [ ] **Step 1.1.1: Write the failing tests**

Create `backend/tests/utils/pdf-extractor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { truncateExtractedText } from "../../src/utils/pdf-extractor";

describe("truncateExtractedText", () => {
	it("returns input unchanged when shorter than max", () => {
		expect(truncateExtractedText("hello", 100)).toBe("hello");
	});

	it("truncates with notice when longer than max", () => {
		const input = "x".repeat(50);
		const result = truncateExtractedText(input, 10);
		expect(result.startsWith("xxxxxxxxxx")).toBe(true);
		expect(result).toContain("[truncated");
		expect(result.length).toBeGreaterThan(10); // notice adds chars
	});

	it("handles empty input", () => {
		expect(truncateExtractedText("", 100)).toBe("");
	});
});
```

- [ ] **Step 1.1.2: Run tests — they should fail (module missing)**

Run: `cd backend && bun test tests/utils/pdf-extractor.test.ts`
Expected: FAIL — `Cannot find module pdf-extractor`.

- [ ] **Step 1.1.3: Implement the util**

Create `backend/src/utils/pdf-extractor.ts`:

```ts
/**
 * Fetches a PDF by URL and extracts its text via `pdf-parse`. Used for chat
 * attachments (capped at PDF_EXTRACT_MAX_CHARS) and the campaign brief PDF
 * pipeline.
 */
export async function extractPdfText(url: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Could not fetch PDF from ${url}: ${response.status}`);
	}
	const buffer = Buffer.from(await response.arrayBuffer());
	const { PDFParse } = await import("pdf-parse");
	const parser = new PDFParse({ data: new Uint8Array(buffer) });
	await parser.load();
	const result = await parser.getText();
	return result.text;
}

/**
 * Truncate extracted text to a character cap, appending a notice if trimmed.
 * Used to keep AI context windows bounded and DB row sizes small.
 */
export function truncateExtractedText(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n\n[truncated — original was ${text.length} chars]`;
}

export const PDF_EXTRACT_MAX_CHARS = 10_000;
```

- [ ] **Step 1.1.4: Run tests — should pass**

Run: `cd backend && bun test tests/utils/pdf-extractor.test.ts`
Expected: 3/3 pass.

- [ ] **Step 1.1.5: Swap the inline extractor in campaign-pdf-generation.job.ts**

Open `backend/src/jobs/campaign-pdf-generation.job.ts`. Find the private `extractPdfText` method (around lines 400-411) and delete it. At the top of the file, add:

```ts
import { extractPdfText } from "../utils/pdf-extractor";
```

Find the call site that used `this.extractPdfText(...)` and change it to `extractPdfText(...)`.

- [ ] **Step 1.1.6: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "(campaign-pdf-generation|pdf-extractor)" | head -5`
Expected: no new errors in those files (pre-existing errors elsewhere are not in scope).

- [ ] **Step 1.1.7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/pdf-extractor.ts \
  backend/tests/utils/pdf-extractor.test.ts \
  backend/src/jobs/campaign-pdf-generation.job.ts
git commit -m "refactor(backend): extract PDF text reader into shared util"
```

### Task 1.2: Add `CampaignChatMessage` + `CampaignPlanRevision` Prisma models

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1.2.1: Add models to schema**

Open `backend/prisma/schema.prisma`. Find the `Campaign` model. Add new relations inside it:

```prisma
model Campaign {
  // ... existing fields ...
  chatMessages   CampaignChatMessage[]
  planRevisions  CampaignPlanRevision[]
  // ... existing relations below ...
}
```

Find the `User` model and add:

```prisma
model User {
  // ... existing fields ...
  chatMessages CampaignChatMessage[]
  // ... existing relations ...
}
```

Then add two new models at the bottom of the Campaign section (just before the Topic Planning section):

```prisma
model CampaignChatMessage {
  id             String   @id @default(uuid())
  campaignId     String   @map("campaign_id")
  role           String   // "user" | "assistant"
  userId         String?  @map("user_id")
  contentBlocks  Json     @map("content_blocks")
  attachments    Json     @default("[]")
  createdAt      DateTime @default(now()) @map("created_at")

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  user     User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  planRevisions CampaignPlanRevision[] @relation("TriggerMessage")

  @@index([campaignId, createdAt])
  @@map("campaign_chat_messages")
}

model CampaignPlanRevision {
  id                String   @id @default(uuid())
  campaignId        String   @map("campaign_id")
  revisionNumber    Int      @map("revision_number")
  triggerMessageId  String?  @map("trigger_message_id")
  label             String
  snapshot          Json
  createdAt         DateTime @default(now()) @map("created_at")

  campaign       Campaign             @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  triggerMessage CampaignChatMessage? @relation("TriggerMessage", fields: [triggerMessageId], references: [id], onDelete: SetNull)

  @@unique([campaignId, revisionNumber])
  @@index([campaignId])
  @@map("campaign_plan_revisions")
}
```

- [ ] **Step 1.2.2: Generate Prisma client + push schema**

Run:
```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx prisma generate && bunx prisma db push
```
Expected: schema synced, no drift errors, two new tables created.

- [ ] **Step 1.2.3: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "(CampaignChatMessage|CampaignPlanRevision)" | head -5`
Expected: no errors referencing these types (they exist now via `@prisma/client`).

- [ ] **Step 1.2.4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat(db): add CampaignChatMessage and CampaignPlanRevision models"
```

---

## Phase 2 — Chat provider interface + Gemini impl (streaming text, no tools yet)

### Task 2.1: Define `IChatAiProvider` + `ChatStreamEvent` + shared types

**Files:**
- Create: `backend/src/types/chat.types.ts`
- Create: `backend/src/interfaces/providers/chat-ai.provider.interface.ts`

- [ ] **Step 2.1.1: Create shared types**

Create `backend/src/types/chat.types.ts`:

```ts
// Message block shapes — match what gets stored in CampaignChatMessage.contentBlocks.
export type ChatBlock =
	| { type: "text"; content: string }
	| { type: "plan_edit"; revisionId: string; summary: string }
	| { type: "topics"; topicIds: string[] };

// Attachment shape — stored on CampaignChatMessage.attachments.
export interface ChatAttachment {
	fileUrl: string;
	fileName: string;
	fileType: string; // MIME
	fileSize: number;
	extractedText?: string;
}

// Provider-agnostic chat message shape passed to IChatAiProvider.
export interface ChatMessage {
	role: "user" | "assistant";
	text: string; // already flattened from blocks for history
	attachments?: ChatAttachment[];
}

// JSON Schema fragment — both providers accept it.
export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}
```

- [ ] **Step 2.1.2: Create provider interface**

Create `backend/src/interfaces/providers/chat-ai.provider.interface.ts`:

```ts
import type { ChatMessage, ToolDefinition } from "../../types/chat.types";

export type ChatStreamEvent =
	| { type: "text_delta"; delta: string }
	| { type: "tool_call"; id: string; name: string; input: unknown }
	| { type: "error"; message: string }
	| { type: "done"; usage?: { inputTokens: number; outputTokens: number } };

export interface ChatStreamInput {
	systemPrompt: string;
	messages: ChatMessage[];
	tools: ToolDefinition[];
}

export interface IChatAiProvider {
	stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent>;
}
```

- [ ] **Step 2.1.3: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "(chat-ai|chat.types)" | head -5`
Expected: no errors.

- [ ] **Step 2.1.4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/types/chat.types.ts \
  backend/src/interfaces/providers/chat-ai.provider.interface.ts
git commit -m "feat(chat): add IChatAiProvider interface + chat types"
```

### Task 2.2: Implement `GeminiChatProvider` (streaming text only, no tools yet)

**Files:**
- Create: `backend/src/providers/gemini-chat.provider.ts`

- [ ] **Step 2.2.1: Create the provider**

Create `backend/src/providers/gemini-chat.provider.ts`:

```ts
import { GoogleGenAI } from "@google/genai";
import type {
	ChatStreamEvent,
	ChatStreamInput,
	IChatAiProvider,
} from "../interfaces/providers/chat-ai.provider.interface";
import type { ChatMessage } from "../types/chat.types";

/**
 * Gemini implementation of IChatAiProvider. v1 emits text_delta + done events
 * only. Tool-call support is added in Phase 6 (propose_topics) and Phase 7
 * (apply_plan_edit); this file is edited in those phases.
 */
export class GeminiChatProvider implements IChatAiProvider {
	private client: GoogleGenAI;

	constructor(
		apiKey: string,
		private model: string,
	) {
		this.client = new GoogleGenAI({ apiKey });
	}

	async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
		const contents = this.buildContents(input.messages);
		try {
			const response = await this.client.models.generateContentStream({
				model: this.model,
				contents,
				config: {
					systemInstruction: input.systemPrompt,
					// Tools will be wired in later phases.
				},
			});

			let inputTokens = 0;
			let outputTokens = 0;

			for await (const chunk of response) {
				const text = chunk.text;
				if (text) yield { type: "text_delta", delta: text };

				const usage = chunk.usageMetadata;
				if (usage) {
					inputTokens = usage.promptTokenCount ?? inputTokens;
					outputTokens = usage.candidatesTokenCount ?? outputTokens;
				}
			}

			yield { type: "done", usage: { inputTokens, outputTokens } };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			yield { type: "error", message };
			yield { type: "done" };
		}
	}

	private buildContents(messages: ChatMessage[]) {
		return messages.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.text }],
		}));
	}
}
```

- [ ] **Step 2.2.2: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "gemini-chat" | head -5`
Expected: no errors.

- [ ] **Step 2.2.3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/gemini-chat.provider.ts
git commit -m "feat(chat): add GeminiChatProvider (streaming text, no tools yet)"
```

### Task 2.3: Add env vars

**Files:**
- Modify: `backend/src/utils/env.ts`
- Modify: `.env.example`

- [ ] **Step 2.3.1: Add env entries**

Open `backend/src/utils/env.ts`. Add inside the `env` object:

```ts
	aiChatProvider: optionalEnv("AI_CHAT_PROVIDER"),
	chatHistoryWindow: Number.parseInt(optionalEnv("CHAT_HISTORY_WINDOW", "20"), 10),
```

- [ ] **Step 2.3.2: Update .env.example**

Open `.env.example`. Append before the final blank line:

```
# Chat
AI_CHAT_PROVIDER=
CHAT_HISTORY_WINDOW=20
```

- [ ] **Step 2.3.3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/env.ts .env.example
git commit -m "chore(chat): add AI_CHAT_PROVIDER and CHAT_HISTORY_WINDOW env vars"
```

---

## Phase 3 — Repositories + ChatService + chat endpoints (text-only MVP)

### Task 3.1: `ChatMessageRepository` (interface + impl + mock)

**Files:**
- Create: `backend/src/interfaces/repositories/chat-message.repository.interface.ts`
- Create: `backend/src/repositories/chat-message.repository.ts`
- Create: `backend/tests/helpers/mock-chat-message.repository.ts`

- [ ] **Step 3.1.1: Create interface**

Create `backend/src/interfaces/repositories/chat-message.repository.interface.ts`:

```ts
import type { CampaignChatMessage } from "@prisma/client";
import type { ChatAttachment, ChatBlock } from "../../types/chat.types";

export interface CreateChatMessageInput {
	campaignId: string;
	role: "user" | "assistant";
	userId?: string | null;
	contentBlocks: ChatBlock[];
	attachments?: ChatAttachment[];
}

export interface IChatMessageRepository {
	create(input: CreateChatMessageInput): Promise<CampaignChatMessage>;
	findByCampaign(campaignId: string, limit?: number): Promise<CampaignChatMessage[]>;
	findLatestByCampaign(campaignId: string, n: number): Promise<CampaignChatMessage[]>;
	findById(id: string): Promise<CampaignChatMessage | null>;
}
```

- [ ] **Step 3.1.2: Create implementation**

Create `backend/src/repositories/chat-message.repository.ts`:

```ts
import type { CampaignChatMessage, PrismaClient } from "@prisma/client";
import type {
	CreateChatMessageInput,
	IChatMessageRepository,
} from "../interfaces/repositories/chat-message.repository.interface";

export class ChatMessageRepository implements IChatMessageRepository {
	constructor(private prisma: PrismaClient) {}

	async create(input: CreateChatMessageInput): Promise<CampaignChatMessage> {
		return this.prisma.campaignChatMessage.create({
			data: {
				campaignId: input.campaignId,
				role: input.role,
				userId: input.userId ?? null,
				contentBlocks: input.contentBlocks as any,
				attachments: (input.attachments ?? []) as any,
			},
		});
	}

	async findByCampaign(campaignId: string, limit = 500): Promise<CampaignChatMessage[]> {
		return this.prisma.campaignChatMessage.findMany({
			where: { campaignId },
			orderBy: { createdAt: "asc" },
			take: limit,
		});
	}

	async findLatestByCampaign(campaignId: string, n: number): Promise<CampaignChatMessage[]> {
		const rows = await this.prisma.campaignChatMessage.findMany({
			where: { campaignId },
			orderBy: { createdAt: "desc" },
			take: n,
		});
		return rows.reverse();
	}

	async findById(id: string): Promise<CampaignChatMessage | null> {
		return this.prisma.campaignChatMessage.findUnique({ where: { id } });
	}
}
```

- [ ] **Step 3.1.3: Create mock for tests**

Create `backend/tests/helpers/mock-chat-message.repository.ts`:

```ts
import type { CampaignChatMessage } from "@prisma/client";
import type {
	CreateChatMessageInput,
	IChatMessageRepository,
} from "../../src/interfaces/repositories/chat-message.repository.interface";

export class MockChatMessageRepository implements IChatMessageRepository {
	private messages: CampaignChatMessage[] = [];

	async create(input: CreateChatMessageInput): Promise<CampaignChatMessage> {
		const msg: CampaignChatMessage = {
			id: crypto.randomUUID(),
			campaignId: input.campaignId,
			role: input.role,
			userId: input.userId ?? null,
			contentBlocks: input.contentBlocks as any,
			attachments: (input.attachments ?? []) as any,
			createdAt: new Date(),
		};
		this.messages.push(msg);
		return msg;
	}

	async findByCampaign(campaignId: string): Promise<CampaignChatMessage[]> {
		return this.messages
			.filter((m) => m.campaignId === campaignId)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	async findLatestByCampaign(campaignId: string, n: number): Promise<CampaignChatMessage[]> {
		const all = await this.findByCampaign(campaignId);
		return all.slice(-n);
	}

	async findById(id: string): Promise<CampaignChatMessage | null> {
		return this.messages.find((m) => m.id === id) ?? null;
	}

	clear(): void {
		this.messages = [];
	}
}
```

- [ ] **Step 3.1.4: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "chat-message" | head -5`
Expected: no errors.

- [ ] **Step 3.1.5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/repositories/chat-message.repository.interface.ts \
  backend/src/repositories/chat-message.repository.ts \
  backend/tests/helpers/mock-chat-message.repository.ts
git commit -m "feat(chat): ChatMessageRepository + mock"
```

### Task 3.2: `CampaignRevisionRepository` (interface + impl + mock)

**Files:**
- Create: `backend/src/interfaces/repositories/campaign-revision.repository.interface.ts`
- Create: `backend/src/repositories/campaign-revision.repository.ts`
- Create: `backend/tests/helpers/mock-campaign-revision.repository.ts`

- [ ] **Step 3.2.1: Create interface**

Create `backend/src/interfaces/repositories/campaign-revision.repository.interface.ts`:

```ts
import type { CampaignPlanRevision } from "@prisma/client";

export interface PlanSnapshot {
	objective: string | null;
	audienceSegment: string | null;
	keyMessage: string | null;
	bigIdea: string | null;
	messagingPillars: Array<{ name: string; description: string }> | null;
}

export interface CreateRevisionInput {
	campaignId: string;
	triggerMessageId?: string | null;
	label: string;
	snapshot: PlanSnapshot;
}

export interface ICampaignRevisionRepository {
	create(input: CreateRevisionInput): Promise<CampaignPlanRevision>;
	findByCampaign(campaignId: string): Promise<CampaignPlanRevision[]>;
	findById(id: string): Promise<CampaignPlanRevision | null>;
	countByCampaign(campaignId: string): Promise<number>;
}
```

- [ ] **Step 3.2.2: Create implementation**

Create `backend/src/repositories/campaign-revision.repository.ts`:

```ts
import type { CampaignPlanRevision, PrismaClient } from "@prisma/client";
import type {
	CreateRevisionInput,
	ICampaignRevisionRepository,
} from "../interfaces/repositories/campaign-revision.repository.interface";

export class CampaignRevisionRepository implements ICampaignRevisionRepository {
	constructor(private prisma: PrismaClient) {}

	async create(input: CreateRevisionInput): Promise<CampaignPlanRevision> {
		// Next revisionNumber = (max for this campaign) + 1, defaulting to 1.
		const latest = await this.prisma.campaignPlanRevision.findFirst({
			where: { campaignId: input.campaignId },
			orderBy: { revisionNumber: "desc" },
			select: { revisionNumber: true },
		});
		const revisionNumber = (latest?.revisionNumber ?? 0) + 1;

		return this.prisma.campaignPlanRevision.create({
			data: {
				campaignId: input.campaignId,
				revisionNumber,
				triggerMessageId: input.triggerMessageId ?? null,
				label: input.label,
				snapshot: input.snapshot as any,
			},
		});
	}

	async findByCampaign(campaignId: string): Promise<CampaignPlanRevision[]> {
		return this.prisma.campaignPlanRevision.findMany({
			where: { campaignId },
			orderBy: { revisionNumber: "desc" },
		});
	}

	async findById(id: string): Promise<CampaignPlanRevision | null> {
		return this.prisma.campaignPlanRevision.findUnique({ where: { id } });
	}

	async countByCampaign(campaignId: string): Promise<number> {
		return this.prisma.campaignPlanRevision.count({ where: { campaignId } });
	}
}
```

- [ ] **Step 3.2.3: Create mock**

Create `backend/tests/helpers/mock-campaign-revision.repository.ts`:

```ts
import type { CampaignPlanRevision } from "@prisma/client";
import type {
	CreateRevisionInput,
	ICampaignRevisionRepository,
} from "../../src/interfaces/repositories/campaign-revision.repository.interface";

export class MockCampaignRevisionRepository implements ICampaignRevisionRepository {
	private revisions: CampaignPlanRevision[] = [];

	async create(input: CreateRevisionInput): Promise<CampaignPlanRevision> {
		const latest = Math.max(
			0,
			...this.revisions.filter((r) => r.campaignId === input.campaignId).map((r) => r.revisionNumber),
		);
		const rev: CampaignPlanRevision = {
			id: crypto.randomUUID(),
			campaignId: input.campaignId,
			revisionNumber: latest + 1,
			triggerMessageId: input.triggerMessageId ?? null,
			label: input.label,
			snapshot: input.snapshot as any,
			createdAt: new Date(),
		};
		this.revisions.push(rev);
		return rev;
	}

	async findByCampaign(campaignId: string): Promise<CampaignPlanRevision[]> {
		return this.revisions
			.filter((r) => r.campaignId === campaignId)
			.sort((a, b) => b.revisionNumber - a.revisionNumber);
	}

	async findById(id: string): Promise<CampaignPlanRevision | null> {
		return this.revisions.find((r) => r.id === id) ?? null;
	}

	async countByCampaign(campaignId: string): Promise<number> {
		return this.revisions.filter((r) => r.campaignId === campaignId).length;
	}

	clear(): void {
		this.revisions = [];
	}
}
```

- [ ] **Step 3.2.4: Typecheck + commit**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "campaign-revision" | head -5`
Expected: no errors.

Commit:
```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/repositories/campaign-revision.repository.interface.ts \
  backend/src/repositories/campaign-revision.repository.ts \
  backend/tests/helpers/mock-campaign-revision.repository.ts
git commit -m "feat(chat): CampaignRevisionRepository + mock"
```

### Task 3.3: Mock `IChatAiProvider` for tests

**Files:**
- Create: `backend/tests/helpers/mock-chat-ai.provider.ts`

- [ ] **Step 3.3.1: Create mock**

Create `backend/tests/helpers/mock-chat-ai.provider.ts`:

```ts
import type {
	ChatStreamEvent,
	ChatStreamInput,
	IChatAiProvider,
} from "../../src/interfaces/providers/chat-ai.provider.interface";

/**
 * Test-only chat provider. Replays a scripted list of events. Tests can also
 * inspect `lastInput` to assert what the service sent.
 */
export class MockChatAiProvider implements IChatAiProvider {
	public lastInput: ChatStreamInput | null = null;
	private scripts: ChatStreamEvent[][] = [];
	private index = 0;

	queue(events: ChatStreamEvent[]): void {
		this.scripts.push(events);
	}

	async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
		this.lastInput = input;
		const events = this.scripts[this.index] ?? [];
		this.index += 1;
		for (const evt of events) yield evt;
	}

	clear(): void {
		this.scripts = [];
		this.index = 0;
		this.lastInput = null;
	}
}
```

- [ ] **Step 3.3.2: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/tests/helpers/mock-chat-ai.provider.ts
git commit -m "test(chat): add MockChatAiProvider"
```

### Task 3.4: `ChatService` skeleton + text-only flow (TDD)

**Files:**
- Create: `backend/src/interfaces/services/chat.service.interface.ts`
- Create: `backend/src/services/chat.service.ts`
- Create: `backend/tests/services/chat.service.test.ts`

- [ ] **Step 3.4.1: Create service interface**

Create `backend/src/interfaces/services/chat.service.interface.ts`:

```ts
import type { CampaignChatMessage, CampaignPlanRevision } from "@prisma/client";
import type { ChatAttachment, ChatBlock } from "../../types/chat.types";

export type ChatStreamEmission =
	| { type: "token"; delta: string }
	| { type: "plan_edit"; block: Extract<ChatBlock, { type: "plan_edit" }>; revisionId: string; revisionNumber: number; snapshot: unknown }
	| { type: "topics"; block: Extract<ChatBlock, { type: "topics" }>; topics: Array<{ id: string; title: string; description: string | null; pillar: string | null; platform: string | null; format: string | null; objective: string | null; publishDate: string | null }> }
	| { type: "error"; message: string; toolName?: string }
	| { type: "done"; messageId: string };

export interface SendChatMessageInput {
	workspaceId: string;
	campaignId: string;
	userId: string;
	content: string;
	attachments?: ChatAttachment[];
}

export interface IChatService {
	listMessages(campaignId: string): Promise<CampaignChatMessage[]>;
	sendMessage(input: SendChatMessageInput): AsyncIterable<ChatStreamEmission>;
	listRevisions(campaignId: string): Promise<CampaignPlanRevision[]>;
	restoreRevision(input: {
		workspaceId: string;
		campaignId: string;
		revisionId: string;
		userId: string;
	}): AsyncIterable<ChatStreamEmission>;
}
```

- [ ] **Step 3.4.2: Write first failing test**

Create `backend/tests/services/chat.service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ChatService } from "../../src/services/chat.service";
import { MockChatAiProvider } from "../helpers/mock-chat-ai.provider";
import { MockChatMessageRepository } from "../helpers/mock-chat-message.repository";
import { MockCampaignRevisionRepository } from "../helpers/mock-campaign-revision.repository";

describe("ChatService.sendMessage (text-only)", () => {
	let chatProvider: MockChatAiProvider;
	let messageRepo: MockChatMessageRepository;
	let revisionRepo: MockCampaignRevisionRepository;
	let service: ChatService;
	// Stubs for the parts of Prisma the service touches.
	const prisma = {
		campaign: {
			findUnique: async () => ({ id: "c1", workspaceId: "w1", objective: null, audienceSegment: null, keyMessage: null, outputs: [], briefs: [], brandId: null }),
			update: async () => ({}),
		},
		campaignOutput: {
			findFirst: async () => null,
			upsert: async () => ({}),
		},
		brandBrainVersion: { findFirst: async () => null },
		contentTopic: {
			findMany: async () => [],
			create: async (args: any) => ({ id: crypto.randomUUID(), ...args.data }),
		},
	} as unknown as PrismaClient;

	beforeEach(() => {
		chatProvider = new MockChatAiProvider();
		messageRepo = new MockChatMessageRepository();
		revisionRepo = new MockCampaignRevisionRepository();
		service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, { historyWindow: 20 });
	});

	afterEach(() => {
		messageRepo.clear();
		revisionRepo.clear();
		chatProvider.clear();
	});

	it("persists the user message then streams assistant tokens", async () => {
		chatProvider.queue([
			{ type: "text_delta", delta: "Hello, " },
			{ type: "text_delta", delta: "world." },
			{ type: "done" },
		]);

		const emissions: any[] = [];
		for await (const e of service.sendMessage({
			workspaceId: "w1",
			campaignId: "c1",
			userId: "u1",
			content: "Hi",
		})) {
			emissions.push(e);
		}

		// User message first, assistant message second.
		const all = await messageRepo.findByCampaign("c1");
		expect(all).toHaveLength(2);
		expect(all[0].role).toBe("user");
		expect(all[1].role).toBe("assistant");

		// Stream emitted tokens + done.
		const tokens = emissions.filter((e) => e.type === "token").map((e) => e.delta);
		expect(tokens).toEqual(["Hello, ", "world."]);
		const done = emissions.find((e) => e.type === "done");
		expect(done).toBeTruthy();
		expect(done.messageId).toBe(all[1].id);

		// Assistant message blocks assembled correctly.
		const blocks = all[1].contentBlocks as any[];
		expect(blocks).toEqual([{ type: "text", content: "Hello, world." }]);
	});
});
```

- [ ] **Step 3.4.3: Run — expect module-not-found fail**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: FAIL — `Cannot find module chat.service`.

- [ ] **Step 3.4.4: Create minimal ChatService**

Create `backend/src/services/chat.service.ts`:

```ts
import type { CampaignChatMessage, CampaignPlanRevision, PrismaClient } from "@prisma/client";
import type { IChatAiProvider } from "../interfaces/providers/chat-ai.provider.interface";
import type { IChatMessageRepository } from "../interfaces/repositories/chat-message.repository.interface";
import type { ICampaignRevisionRepository } from "../interfaces/repositories/campaign-revision.repository.interface";
import type {
	ChatStreamEmission,
	IChatService,
	SendChatMessageInput,
} from "../interfaces/services/chat.service.interface";
import type { ChatBlock, ChatMessage, ToolDefinition } from "../types/chat.types";

interface ChatConfig {
	historyWindow: number;
}

export class ChatService implements IChatService {
	constructor(
		private prisma: PrismaClient,
		private messageRepo: IChatMessageRepository,
		private revisionRepo: ICampaignRevisionRepository,
		private chatProvider: IChatAiProvider,
		private config: ChatConfig,
	) {}

	async listMessages(campaignId: string): Promise<CampaignChatMessage[]> {
		return this.messageRepo.findByCampaign(campaignId);
	}

	async listRevisions(campaignId: string): Promise<CampaignPlanRevision[]> {
		return this.revisionRepo.findByCampaign(campaignId);
	}

	async *sendMessage(input: SendChatMessageInput): AsyncIterable<ChatStreamEmission> {
		// 1. Persist the user message.
		await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "user",
			userId: input.userId,
			contentBlocks: [{ type: "text", content: input.content }],
			attachments: input.attachments,
		});

		// 2. Build system prompt + history.
		const systemPrompt = await this.buildSystemPrompt(input.campaignId);
		const history = await this.buildHistory(input.campaignId);

		// 3. Stream. Text-only v1 — tool handling added in later phases.
		const blocks: ChatBlock[] = [];
		let currentText = "";

		for await (const evt of this.chatProvider.stream({
			systemPrompt,
			messages: history,
			tools: this.getTools(),
		})) {
			if (evt.type === "text_delta") {
				currentText += evt.delta;
				yield { type: "token", delta: evt.delta };
			} else if (evt.type === "error") {
				yield { type: "error", message: evt.message };
			} else if (evt.type === "done") {
				if (currentText.length > 0) {
					blocks.push({ type: "text", content: currentText });
				}
			}
			// tool_call ignored in Phase 3 — handled in Phase 6/7.
		}

		// 4. Persist assistant message.
		const assistant = await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "assistant",
			contentBlocks: blocks,
		});

		yield { type: "done", messageId: assistant.id };
	}

	async *restoreRevision(): AsyncIterable<ChatStreamEmission> {
		// Implemented in Phase 7.
		throw new Error("restoreRevision not implemented until Phase 7");
	}

	private async buildSystemPrompt(campaignId: string): Promise<string> {
		// Phase 3: minimal context. Filled out in later phases.
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			include: {
				outputs: { take: 1, orderBy: { createdAt: "desc" } },
				briefs: { take: 1, orderBy: { createdAt: "desc" } },
			},
		});
		return [
			"You are a campaign strategy expert helping the user refine a social media campaign.",
			"",
			"=== Current campaign plan ===",
			JSON.stringify({
				name: campaign?.name,
				objective: campaign?.objective,
				audienceSegment: campaign?.audienceSegment,
				keyMessage: campaign?.keyMessage,
				bigIdea: campaign?.outputs?.[0]?.bigIdea ?? null,
				messagingPillars: campaign?.outputs?.[0]?.messagingPillars ?? null,
			}),
			"",
			"Respond in markdown. Use tables and bullet lists where helpful.",
		].join("\n");
	}

	private async buildHistory(campaignId: string): Promise<ChatMessage[]> {
		const rows = await this.messageRepo.findLatestByCampaign(campaignId, this.config.historyWindow);
		return rows.map((m) => ({
			role: m.role as "user" | "assistant",
			text: flattenBlocks(m.contentBlocks as ChatBlock[]),
			attachments: (m.attachments as any) ?? [],
		}));
	}

	private getTools(): ToolDefinition[] {
		// Empty in Phase 3. Populated in Phase 6 (propose_topics) and Phase 7 (apply_plan_edit).
		return [];
	}
}

function flattenBlocks(blocks: ChatBlock[]): string {
	return blocks
		.map((b) => {
			if (b.type === "text") return b.content;
			if (b.type === "plan_edit") return `[plan was updated: ${b.summary}]`;
			if (b.type === "topics") return `[proposed ${b.topicIds.length} topics]`;
			return "";
		})
		.join("\n\n");
}
```

- [ ] **Step 3.4.5: Run test — should pass**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: 1/1 pass.

- [ ] **Step 3.4.6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/services/chat.service.interface.ts \
  backend/src/services/chat.service.ts \
  backend/tests/services/chat.service.test.ts
git commit -m "feat(chat): ChatService skeleton with text-only streaming + test"
```

### Task 3.5: HTTP routes — POST /chat (streaming SSE), GET /chat

**Files:**
- Create: `backend/src/routes/campaign-chat.route.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 3.5.1: Create route module**

Create `backend/src/routes/campaign-chat.route.ts`:

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { IChatService } from "../interfaces/services/chat.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createCampaignChatRoutes(chatService: IChatService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET /:id/chat — list chat history chronologically.
	app.get("/:id/chat", async (c) => {
		const campaignId = c.req.param("id");
		const messages = await chatService.listMessages(campaignId);
		return c.json({ data: messages });
	});

	// POST /:id/chat — send a message; stream SSE response.
	app.post("/:id/chat", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const campaignId = c.req.param("id");
		const body = await c.req.json();
		const content = typeof body.content === "string" ? body.content : "";
		const attachments = Array.isArray(body.attachments) ? body.attachments : [];

		if (!content.trim() && attachments.length === 0) {
			return c.json({ error: "content or attachments required" }, 400);
		}

		return streamSSE(c, async (stream) => {
			try {
				for await (const evt of chatService.sendMessage({
					workspaceId,
					campaignId,
					userId,
					content,
					attachments,
				})) {
					await stream.writeSSE({
						event: evt.type,
						data: JSON.stringify(evt),
					});
				}
			} catch (e) {
				await stream.writeSSE({
					event: "error",
					data: JSON.stringify({
						type: "error",
						message: e instanceof Error ? e.message : String(e),
					}),
				});
			}
		});
	});

	// GET /:id/revisions — list plan revisions.
	app.get("/:id/revisions", async (c) => {
		const campaignId = c.req.param("id");
		const revisions = await chatService.listRevisions(campaignId);
		return c.json({ data: revisions });
	});

	// POST /:id/revisions/:revId/restore — implemented in Phase 7.
	app.post("/:id/revisions/:revId/restore", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const campaignId = c.req.param("id");
		const revisionId = c.req.param("revId");

		return streamSSE(c, async (stream) => {
			try {
				for await (const evt of chatService.restoreRevision({
					workspaceId,
					campaignId,
					revisionId,
					userId,
				})) {
					await stream.writeSSE({
						event: evt.type,
						data: JSON.stringify(evt),
					});
				}
			} catch (e) {
				await stream.writeSSE({
					event: "error",
					data: JSON.stringify({
						type: "error",
						message: e instanceof Error ? e.message : String(e),
					}),
				});
			}
		});
	});

	return app;
}
```

- [ ] **Step 3.5.2: Wire in `backend/src/index.ts`**

Open `backend/src/index.ts`. Add imports near the other provider/route imports:

```ts
import { GeminiChatProvider } from "./providers/gemini-chat.provider";
import { ChatMessageRepository } from "./repositories/chat-message.repository";
import { CampaignRevisionRepository } from "./repositories/campaign-revision.repository";
import { ChatService } from "./services/chat.service";
import { createCampaignChatRoutes } from "./routes/campaign-chat.route";
```

After the other repository instantiations (around the `// ─── Repositories ───` block), add:

```ts
	const chatMessageRepository = new ChatMessageRepository(prisma);
	const campaignRevisionRepository = new CampaignRevisionRepository(prisma);
```

After `resolveContentGenerator()` and friends, add a chat resolver near the top of `main`:

```ts
function resolveChatProvider(): GeminiChatProvider {
	// Phase 3: Gemini only. Anthropic added in Phase 8.
	const name = env.aiChatProvider || env.aiProvider;
	if (name === "gemini") {
		return new GeminiChatProvider(env.geminiApiKey, env.geminiModel);
	}
	// Fallback so dev envs without AI_CHAT_PROVIDER still boot.
	return new GeminiChatProvider(env.geminiApiKey, env.geminiModel);
}
```

After the other service instantiations (around `// ─── Services ───`), add:

```ts
	const chatService = new ChatService(
		prisma,
		chatMessageRepository,
		campaignRevisionRepository,
		resolveChatProvider(),
		{ historyWindow: env.chatHistoryWindow },
	);
```

Mount under the workspace-scoped app, right after `workspaceScoped.route("/campaigns", createCampaignRoutes(...))`:

```ts
	workspaceScoped.route("/campaigns", createCampaignChatRoutes(chatService));
```

Note: mounting both `createCampaignRoutes` and `createCampaignChatRoutes` at `/campaigns` is intentional — Hono merges routes across `app.route()` calls at the same prefix. The chat routes handle `/:id/chat`, `/:id/revisions`, `/:id/revisions/:revId/restore`; the campaign routes handle the rest.

- [ ] **Step 3.5.3: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "(campaign-chat|index.ts|chat.service)" | head -10`
Expected: no new errors on these files.

- [ ] **Step 3.5.4: Smoke test manually**

Run the backend (`cd backend && bun run --hot src/index.ts`) and hit the endpoints with curl:

```bash
curl -N -X POST http://localhost:3001/api/workspaces/WS_ID/campaigns/CAMP_ID/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello"}'
```

Expected: SSE events stream back with tokens then a `done` event.

(Skip this smoke test if you don't have a running backend + seeded campaign. Tests + typecheck already validate correctness.)

- [ ] **Step 3.5.5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/campaign-chat.route.ts backend/src/index.ts
git commit -m "feat(chat): POST /chat streaming + GET /chat + GET /revisions routes"
```

---

## Phase 4 — Frontend chat MVP (text-only, no uploads, no tools)

### Task 4.1: Add npm dependencies for markdown

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 4.1.1: Install deps**

Run:
```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
npm install react-markdown remark-gfm rehype-sanitize
```

Expected: three packages added to `dependencies`.

- [ ] **Step 4.1.2: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(chat): add react-markdown + remark-gfm + rehype-sanitize"
```

### Task 4.2: `sse-parser.ts` — parse SSE events from a `fetch` response body

**Files:**
- Create: `frontend/src/utils/sse-parser.ts`

- [ ] **Step 4.2.1: Create the parser**

Create `frontend/src/utils/sse-parser.ts`:

```ts
export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Parse SSE events from a fetch() response body stream. Yields one event per
 * complete `event: ...\ndata: ...\n\n` block.
 */
export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      // Events separated by double-newline.
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const evt = parseEvent(raw);
        if (evt) yield evt;
      }
    }
    // Flush trailing buffer if it contains a final event.
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const evt = parseEvent(buffer);
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
```

- [ ] **Step 4.2.2: Typecheck + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/utils/sse-parser.ts
git commit -m "feat(chat): SSE parser over fetch ReadableStream"
```

### Task 4.3: `useChatStream` hook

**Files:**
- Create: `frontend/src/hooks/useChatStream.ts`

- [ ] **Step 4.3.1: Create the hook**

Create `frontend/src/hooks/useChatStream.ts`:

```ts
import { useCallback, useState } from "react";
import { getAccessToken } from "../services/api";
import { parseSSEStream } from "../utils/sse-parser";

export type ChatBlock =
  | { type: "text"; content: string }
  | { type: "plan_edit"; revisionId: string; summary: string }
  | { type: "topics"; topicIds: string[]; topics?: TopicSummary[] };

export interface TopicSummary {
  id: string;
  title: string;
  description: string | null;
  pillar: string | null;
  platform: string | null;
  format: string | null;
  objective: string | null;
  publishDate: string | null;
}

export interface ChatAttachment {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: ChatBlock[];
  attachments?: ChatAttachment[];
  createdAt: string;
  error?: string;
  isStreaming?: boolean;
}

export interface UseChatStreamOptions {
  workspaceId: string;
  campaignId: string;
  onPlanEdit?: (revisionId: string) => void;
}

interface SendArgs {
  content: string;
  attachments?: ChatAttachment[];
}

export function useChatStream(opts: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const send = useCallback(async ({ content, attachments }: SendArgs) => {
    if (isStreaming) return;

    // Optimistic user message.
    const userMsg: ChatMessage = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      blocks: [{ type: "text", content }],
      attachments,
      createdAt: new Date().toISOString(),
    };
    // Placeholder assistant message for streaming.
    const assistantMsg: ChatMessage = {
      id: `pending-assistant-${Date.now()}`,
      role: "assistant",
      blocks: [],
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const token = getAccessToken();
    const resp = await fetch(
      `${import.meta.env.VITE_API_URL || ""}/api/workspaces/${opts.workspaceId}/campaigns/${opts.campaignId}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content, attachments }),
      },
    );

    if (!resp.ok || !resp.body) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, error: `HTTP ${resp.status}` }
            : m,
        ),
      );
      setIsStreaming(false);
      return;
    }

    try {
      for await (const evt of parseSSEStream(resp.body)) {
        const data = JSON.parse(evt.data);
        if (evt.event === "token") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? appendToken(m, data.delta) : m)),
          );
        } else if (evt.event === "plan_edit") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? appendBlock(m, { type: "plan_edit", revisionId: data.revisionId, summary: data.block?.summary ?? "" })
                : m,
            ),
          );
          opts.onPlanEdit?.(data.revisionId);
        } else if (evt.event === "topics") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? appendBlock(m, { type: "topics", topicIds: data.block?.topicIds ?? data.topicIds ?? [], topics: data.topics })
                : m,
            ),
          );
        } else if (evt.event === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, error: data.message } : m,
            ),
          );
        } else if (evt.event === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, id: data.messageId, isStreaming: false }
                : m,
            ),
          );
        }
      }
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, error: e instanceof Error ? e.message : "Stream failed" }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, opts]);

  const replaceAll = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  return { messages, isStreaming, send, replaceAll };
}

function appendToken(msg: ChatMessage, delta: string): ChatMessage {
  const last = msg.blocks[msg.blocks.length - 1];
  if (last && last.type === "text") {
    return {
      ...msg,
      blocks: [
        ...msg.blocks.slice(0, -1),
        { type: "text", content: last.content + delta },
      ],
    };
  }
  return {
    ...msg,
    blocks: [...msg.blocks, { type: "text", content: delta }],
  };
}

function appendBlock(msg: ChatMessage, block: ChatBlock): ChatMessage {
  return { ...msg, blocks: [...msg.blocks, block] };
}
```

Note: `getAccessToken` needs to be exported from `frontend/src/services/api.ts`. If it isn't currently exported, add `export` to the existing module-level variable and a getter.

- [ ] **Step 4.3.2: Ensure `getAccessToken` is exported**

Open `frontend/src/services/api.ts`. Locate the `setAccessToken` function and the `accessToken` variable. Export a reader:

```ts
let accessTokenValue: string | null = null;
export function setAccessToken(t: string | null) { accessTokenValue = t; }
export function getAccessToken(): string | null { return accessTokenValue; }
```

(If the current code already uses a differently-named variable, preserve that and add the getter accordingly.)

- [ ] **Step 4.3.3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4.3.4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/hooks/useChatStream.ts frontend/src/services/api.ts
git commit -m "feat(chat): useChatStream hook + export getAccessToken"
```

### Task 4.4: `TextBlock` — markdown renderer

**Files:**
- Create: `frontend/src/components/campaigns/chat/blocks/TextBlock.tsx`

- [ ] **Step 4.4.1: Create component**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export function TextBlock({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-p:my-2 prose-ul:my-2 prose-li:my-0 prose-table:text-xs prose-th:px-2 prose-td:px-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4.4.2: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/campaigns/chat/blocks/TextBlock.tsx
git commit -m "feat(chat): TextBlock markdown renderer"
```

### Task 4.5: `Message`, `MessageList`, `ChatInput`, `ChatPanel`

**Files:**
- Create: `frontend/src/components/campaigns/chat/Message.tsx`
- Create: `frontend/src/components/campaigns/chat/MessageList.tsx`
- Create: `frontend/src/components/campaigns/chat/ChatInput.tsx`
- Create: `frontend/src/components/campaigns/chat/ChatPanel.tsx`

- [ ] **Step 4.5.1: Create `Message.tsx`**

```tsx
import { User, Sparkles, Loader2 } from "lucide-react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { TextBlock } from "./blocks/TextBlock";

export function Message({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isAssistant ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-600"}`}>
        {isAssistant ? <Sparkles size={14} /> : <User size={14} />}
      </div>
      <div className={`flex-1 space-y-2 ${isAssistant ? "" : "text-right"}`}>
        <div className={`inline-block text-left rounded-lg px-3 py-2 max-w-[90%] ${isAssistant ? "bg-white border border-gray-200" : "bg-indigo-600 text-white"}`}>
          {message.blocks.length === 0 && message.isStreaming && (
            <Loader2 size={14} className="animate-spin inline" />
          )}
          {message.blocks.map((b, i) => {
            if (b.type === "text") return <TextBlock key={i} content={b.content} />;
            // PlanEditBlock / TopicsBlock added in Phase 6/7.
            return null;
          })}
          {message.error && (
            <p className="text-xs text-red-600 mt-1">Error: {message.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.5.2: Create `MessageList.tsx`**

```tsx
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { Message } from "./Message";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pausedRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    pausedRef.current = distance > 100;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          Ask me anything about this campaign.
        </p>
      ) : (
        messages.map((m) => <Message key={m.id} message={m} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4.5.3: Create `ChatInput.tsx`**

```tsx
import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      <div className="flex gap-2 items-end">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={disabled}
          className="flex-1 resize-none px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.5.4: Create `ChatPanel.tsx`**

```tsx
import { useEffect } from "react";
import { api } from "../../../services/api";
import { useChatStream, type ChatMessage } from "../../../hooks/useChatStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatPanelProps {
  workspaceId: string;
  campaignId: string;
  onPlanEdit?: (revisionId: string) => void;
}

interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  contentBlocks: ChatMessage["blocks"];
  attachments: ChatMessage["attachments"];
  createdAt: string;
}

export function ChatPanel({ workspaceId, campaignId, onPlanEdit }: ChatPanelProps) {
  const { messages, isStreaming, send, replaceAll } = useChatStream({
    workspaceId,
    campaignId,
    onPlanEdit,
  });

  useEffect(() => {
    api<PersistedMessage[]>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/chat`)
      .then((rows) => {
        replaceAll(
          rows.map((r) => ({
            id: r.id,
            role: r.role,
            blocks: r.contentBlocks,
            attachments: r.attachments,
            createdAt: r.createdAt,
          })),
        );
      })
      .catch(() => {
        // Silent — empty transcript is fine for fresh campaigns.
      });
  }, [workspaceId, campaignId, replaceAll]);

  return (
    <div className="flex flex-col h-[600px] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      <MessageList messages={messages} />
      <ChatInput
        onSend={(content) => send({ content })}
        disabled={isStreaming}
      />
    </div>
  );
}
```

- [ ] **Step 4.5.5: Typecheck + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/campaigns/chat/
git commit -m "feat(chat): ChatPanel + MessageList + Message + ChatInput (text-only)"
```

### Task 4.6: Integrate chat into `CampaignDetailPage`

**Files:**
- Modify: `frontend/src/pages/CampaignDetailPage.tsx`

- [ ] **Step 4.6.1: Add ChatPanel to the page**

Open `frontend/src/pages/CampaignDetailPage.tsx`. Add import at the top:

```tsx
import { ChatPanel } from "../components/campaigns/chat/ChatPanel";
```

Inside the main `!isGenerating` fragment (where `CampaignSummaryCard`, `CampaignPlanCard`, `CampaignTopicsList` are rendered), add `ChatPanel` below `CampaignPlanCard`:

```tsx
          {/* Chat — AI copilot */}
          <ChatPanel
            workspaceId={activeWorkspace.id}
            campaignId={campaign.id}
            onPlanEdit={() => loadCampaign()}
          />
          <CampaignTopicsList topics={topics} />
```

`onPlanEdit` calls the existing `loadCampaign()` so when Phase 7 wires plan edits they trigger a refetch automatically.

- [ ] **Step 4.6.2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4.6.3: Smoke test manually**

Start backend + frontend. Open a campaign detail page. Type a message and press Enter. Expect streaming tokens to appear as an assistant bubble rendered with markdown.

- [ ] **Step 4.6.4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/CampaignDetailPage.tsx
git commit -m "feat(chat): mount ChatPanel on CampaignDetailPage"
```

---

## Phase 5 — File uploads (PDFs + images)

### Task 5.1: Upload endpoint in the chat route

**Files:**
- Modify: `backend/src/routes/campaign-chat.route.ts`
- Modify: `backend/src/services/chat.service.ts` (add `uploadAttachment`)
- Modify: `backend/src/interfaces/services/chat.service.interface.ts`
- Modify: `backend/src/index.ts` (pass storage + bucket to ChatService)

- [ ] **Step 5.1.1: Extend the service interface**

Open `backend/src/interfaces/services/chat.service.interface.ts`. Add:

```ts
export interface UploadAttachmentInput {
  workspaceId: string;
  campaignId: string;
  file: File;
}

export interface UploadAttachmentResult {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  extractedText?: string;
}
```

And add to `IChatService`:

```ts
  uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResult>;
```

- [ ] **Step 5.1.2: Implement uploadAttachment in ChatService**

Open `backend/src/services/chat.service.ts`. Update imports at top:

```ts
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";
import { PDF_EXTRACT_MAX_CHARS, extractPdfText, truncateExtractedText } from "../utils/pdf-extractor";
import type {
  ChatStreamEmission,
  IChatService,
  SendChatMessageInput,
  UploadAttachmentInput,
  UploadAttachmentResult,
} from "../interfaces/services/chat.service.interface";
```

Extend the constructor to include storage + bucket:

```ts
interface ChatConfig {
  historyWindow: number;
  bucket: string;
}

export class ChatService implements IChatService {
  constructor(
    private prisma: PrismaClient,
    private messageRepo: IChatMessageRepository,
    private revisionRepo: ICampaignRevisionRepository,
    private chatProvider: IChatAiProvider,
    private storage: IStorageProvider,
    private config: ChatConfig,
  ) {}
```

Add the method:

```ts
  async uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
    const allowed = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ];
    if (!allowed.includes(input.file.type)) {
      throw new Error(`Unsupported file type: ${input.file.type}`);
    }
    if (input.file.size > 10 * 1024 * 1024) {
      throw new Error("File exceeds 10 MB limit");
    }

    const ext = input.file.name.split(".").pop() || "bin";
    const key = `chat-uploads/${input.campaignId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const fileUrl = await this.storage.upload(this.config.bucket, key, buffer, input.file.type);

    let extractedText: string | undefined;
    if (input.file.type === "application/pdf") {
      try {
        const raw = await extractPdfText(fileUrl);
        extractedText = truncateExtractedText(raw, PDF_EXTRACT_MAX_CHARS);
      } catch {
        extractedText = undefined;
      }
    }

    return {
      fileUrl,
      fileName: input.file.name,
      fileType: input.file.type,
      fileSize: input.file.size,
      extractedText,
    };
  }
```

- [ ] **Step 5.1.3: Add the upload route**

Open `backend/src/routes/campaign-chat.route.ts`. Inside `createCampaignChatRoutes`, add:

```ts
  // POST /:id/chat/upload — multipart file upload.
  app.post("/:id/chat/upload", async (c) => {
    const workspaceId = c.get("workspaceId");
    const campaignId = c.req.param("id");
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    try {
      const result = await chatService.uploadAttachment({ workspaceId, campaignId, file });
      return c.json({ data: result });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Upload failed" }, 400);
    }
  });
```

- [ ] **Step 5.1.4: Update composition root**

Open `backend/src/index.ts`. Update the `ChatService` instantiation to pass `storageProvider` + bucket:

```ts
  const chatService = new ChatService(
    prisma,
    chatMessageRepository,
    campaignRevisionRepository,
    resolveChatProvider(),
    storageProvider,
    { historyWindow: env.chatHistoryWindow, bucket: env.minioBucket },
  );
```

- [ ] **Step 5.1.5: Typecheck**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "(chat\.service|campaign-chat|index\.ts)" | head -10`
Expected: no new errors.

- [ ] **Step 5.1.6: Update chat.service test to pass new constructor args**

Open `backend/tests/services/chat.service.test.ts`. Update the ChatService instantiation in `beforeEach`:

```ts
    const mockStorage = {
      upload: async (_b: string, _k: string, _buf: Buffer, _t: string) => `http://minio/${_k}`,
      init: async () => new Map(),
    } as any;
    service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, mockStorage, {
      historyWindow: 20,
      bucket: "test-bucket",
    });
```

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: 1/1 still passes.

- [ ] **Step 5.1.7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/campaign-chat.route.ts \
  backend/src/services/chat.service.ts \
  backend/src/interfaces/services/chat.service.interface.ts \
  backend/src/index.ts \
  backend/tests/services/chat.service.test.ts
git commit -m "feat(chat): file upload endpoint with PDF text extraction"
```

### Task 5.2: Frontend `AttachmentChips` + drop zone + upload flow

**Files:**
- Create: `frontend/src/components/campaigns/chat/AttachmentChips.tsx`
- Modify: `frontend/src/components/campaigns/chat/ChatInput.tsx`
- Modify: `frontend/src/components/campaigns/chat/ChatPanel.tsx`
- Modify: `frontend/src/hooks/useChatStream.ts`

- [ ] **Step 5.2.1: Create `AttachmentChips.tsx`**

```tsx
import { File, Image as ImageIcon, Loader2, X } from "lucide-react";
import type { ChatAttachment } from "../../../hooks/useChatStream";

export interface PendingAttachment {
  id: string;
  file: File;
  uploading: boolean;
  error?: string;
  result?: ChatAttachment;
}

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {items.map((item) => {
        const isImage = item.file.type.startsWith("image/");
        return (
          <div
            key={item.id}
            className="inline-flex items-center gap-2 px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs"
          >
            {item.uploading ? (
              <Loader2 size={12} className="animate-spin text-gray-400" />
            ) : isImage ? (
              <ImageIcon size={12} className="text-gray-500" />
            ) : (
              <File size={12} className="text-gray-500" />
            )}
            <span className="max-w-[160px] truncate">{item.file.name}</span>
            {item.error && <span className="text-red-600">· {item.error}</span>}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-gray-400 hover:text-gray-700"
              title="Remove"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5.2.2: Rewrite `ChatInput.tsx` with attachments + drop zone**

Replace the contents with:

```tsx
import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { Paperclip, Send } from "lucide-react";
import { AttachmentChips, type PendingAttachment } from "./AttachmentChips";
import type { ChatAttachment } from "../../../hooks/useChatStream";
import { api } from "../../../services/api";

interface ChatInputProps {
  workspaceId: string;
  campaignId: string;
  onSend: (content: string, attachments: ChatAttachment[]) => void;
  disabled?: boolean;
}

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export function ChatInput({ workspaceId, campaignId, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const [isDragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const anyUploading = items.some((i) => i.uploading);
  const canSend = !disabled && !anyUploading && (value.trim().length > 0 || items.some((i) => i.result));

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      if (!ACCEPTED.includes(file.type)) continue;
      if (file.size > MAX_BYTES) continue;
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, file, uploading: true }]);
      uploadOne(id, file);
    }
  };

  const uploadOne = async (id: string, file: File) => {
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api<ChatAttachment>(
        `/api/workspaces/${workspaceId}/campaigns/${campaignId}/chat/upload`,
        { method: "POST", body: form },
      );
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, uploading: false, result: data } : i)),
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, uploading: false, error: e instanceof Error ? e.message : "Upload failed" } : i,
        ),
      );
    }
  };

  const submit = () => {
    if (!canSend) return;
    const attachments = items.filter((i) => i.result).map((i) => i.result!);
    onSend(value.trim(), attachments);
    setValue("");
    setItems([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const onDragEnter = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`border-t border-gray-200 bg-white relative ${isDragOver ? "bg-indigo-50" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-indigo-700 font-medium pointer-events-none bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded">
          Drop PDF or image to attach
        </div>
      )}
      <AttachmentChips items={items} onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))} />
      <div className="flex gap-2 items-end p-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="shrink-0 p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip size={16} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          className="hidden"
          onChange={onFileInput}
        />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={disabled}
          className="flex-1 resize-none px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2.3: Update `ChatPanel.tsx` to wire workspaceId/campaignId + pass attachments**

Replace the `<ChatInput .../>` call with:

```tsx
      <ChatInput
        workspaceId={workspaceId}
        campaignId={campaignId}
        onSend={(content, attachments) => send({ content, attachments })}
        disabled={isStreaming}
      />
```

- [ ] **Step 5.2.4: Update `api` helper to accept FormData if needed**

The existing `api()` helper (in `frontend/src/services/api.ts`) already handles FormData — confirm by reading the function. If it doesn't, add:

```ts
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...((options.headers as Record<string, string>) ?? {}),
  };
```

Skip this step if it's already there (it is, per earlier exploration).

- [ ] **Step 5.2.5: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 5.2.6: Smoke test**

Drag a PDF onto the chat panel → chip appears → uploads → sends as attachment → AI response references it (when we wire context in later, for now it just gets uploaded).

- [ ] **Step 5.2.7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/campaigns/chat/
git commit -m "feat(chat): file upload drop zone + AttachmentChips"
```

### Task 5.3: Include attachment extracted text in AI context

**Files:**
- Modify: `backend/src/services/chat.service.ts`

- [ ] **Step 5.3.1: Use attachments from current and past user messages in history**

Open `backend/src/services/chat.service.ts`. Update `buildHistory` so user messages include their attachment extracted text inline:

```ts
  private async buildHistory(campaignId: string): Promise<ChatMessage[]> {
    const rows = await this.messageRepo.findLatestByCampaign(campaignId, this.config.historyWindow);
    return rows.map((m) => {
      const atts = (m.attachments as unknown as ChatAttachment[]) ?? [];
      const attachmentText = atts
        .filter((a) => a.extractedText && a.extractedText.length > 0)
        .map((a) => `\n\n[Attached file "${a.fileName}"]\n${a.extractedText}`)
        .join("");
      return {
        role: m.role as "user" | "assistant",
        text: flattenBlocks(m.contentBlocks as ChatBlock[]) + attachmentText,
        attachments: atts,
      };
    });
  }
```

Add the import if missing:

```ts
import type { ChatAttachment, ChatBlock, ChatMessage, ToolDefinition } from "../types/chat.types";
```

(Already imported; just confirm.)

- [ ] **Step 5.3.2: Run chat service tests**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: still 1/1 pass.

- [ ] **Step 5.3.3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts
git commit -m "feat(chat): include PDF extracted text inline in AI history"
```

---

## Phase 6 — `propose_topics` tool

### Task 6.1: Define tool schema + wire into GeminiChatProvider

**Files:**
- Modify: `backend/src/services/chat.service.ts` (populate `getTools`)
- Modify: `backend/src/providers/gemini-chat.provider.ts` (accept + forward tools)

- [ ] **Step 6.1.1: Populate `getTools` in ChatService**

Open `backend/src/services/chat.service.ts`. Replace `getTools()`:

```ts
  private getTools(): ToolDefinition[] {
    return [
      {
        name: "propose_topics",
        description:
          "Propose a list of content topics for this campaign. Topics auto-save to the Topic Library.",
        inputSchema: {
          type: "object",
          properties: {
            topics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  pillar: { type: "string" },
                  platform: { type: "string" },
                  format: { type: "string" },
                  objective: { type: "string" },
                  publishDate: { type: "string" },
                },
                required: ["title", "description", "pillar", "platform", "format", "objective"],
              },
            },
          },
          required: ["topics"],
        },
      },
    ];
  }
```

- [ ] **Step 6.1.2: Forward tools in GeminiChatProvider**

Open `backend/src/providers/gemini-chat.provider.ts`. Update the stream method to include tools in config and surface `tool_call` events. Rewrite the inside of `stream`:

```ts
  async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
    const contents = this.buildContents(input.messages);
    const functionDeclarations = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as any,
    }));

    try {
      const response = await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: input.systemPrompt,
          tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
        },
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of response) {
        const text = chunk.text;
        if (text) yield { type: "text_delta", delta: text };

        // Surface any function calls in this chunk.
        const calls = (chunk as any).functionCalls;
        if (Array.isArray(calls)) {
          for (const call of calls) {
            yield {
              type: "tool_call",
              id: call.id || crypto.randomUUID(),
              name: call.name,
              input: call.args ?? call.arguments ?? {},
            };
          }
        }

        const usage = chunk.usageMetadata;
        if (usage) {
          inputTokens = usage.promptTokenCount ?? inputTokens;
          outputTokens = usage.candidatesTokenCount ?? outputTokens;
        }
      }

      yield { type: "done", usage: { inputTokens, outputTokens } };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      yield { type: "error", message };
      yield { type: "done" };
    }
  }
```

Note: the `@google/genai` SDK surfaces function calls via `chunk.functionCalls`. If the SDK's actual shape differs, adapt — the idea is: for each chunk, check for function-call metadata and emit `tool_call`.

- [ ] **Step 6.1.3: Typecheck + commit**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep gemini-chat | head -5`
Expected: no new errors.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts backend/src/providers/gemini-chat.provider.ts
git commit -m "feat(chat): register propose_topics tool with Gemini provider"
```

### Task 6.2: Execute `propose_topics` in ChatService (TDD)

**Files:**
- Modify: `backend/src/services/chat.service.ts`
- Modify: `backend/tests/services/chat.service.test.ts`

- [ ] **Step 6.2.1: Add failing test**

Append to `backend/tests/services/chat.service.test.ts`:

```ts
describe("ChatService.sendMessage (propose_topics)", () => {
  let chatProvider: MockChatAiProvider;
  let messageRepo: MockChatMessageRepository;
  let revisionRepo: MockCampaignRevisionRepository;
  let service: ChatService;
  const createdTopics: any[] = [];
  const prisma = {
    campaign: {
      findUnique: async () => ({ id: "c1", workspaceId: "w1", name: "Test", objective: null, audienceSegment: null, keyMessage: null, outputs: [], briefs: [], brandId: null }),
    },
    campaignOutput: { findFirst: async () => null, upsert: async () => ({}) },
    brandBrainVersion: { findFirst: async () => null },
    contentTopic: {
      findMany: async () => [],
      create: async (args: any) => {
        const row = { id: crypto.randomUUID(), ...args.data };
        createdTopics.push(row);
        return row;
      },
    },
  } as unknown as PrismaClient;
  const mockStorage = { upload: async () => "http://minio/x", init: async () => new Map() } as any;

  beforeEach(() => {
    chatProvider = new MockChatAiProvider();
    messageRepo = new MockChatMessageRepository();
    revisionRepo = new MockCampaignRevisionRepository();
    createdTopics.length = 0;
    service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, mockStorage, { historyWindow: 20, bucket: "b" });
  });

  it("creates ContentTopic rows and emits a topics block", async () => {
    chatProvider.queue([
      { type: "text_delta", delta: "Here are some ideas:" },
      {
        type: "tool_call",
        id: "call-1",
        name: "propose_topics",
        input: {
          topics: [
            { title: "Topic 1", description: "desc 1", pillar: "Education", platform: "instagram", format: "single_image", objective: "awareness" },
            { title: "Topic 2", description: "desc 2", pillar: "Education", platform: "tiktok", format: "tiktok_video", objective: "engagement" },
          ],
        },
      },
      { type: "done" },
    ]);
    // The provider is called AGAIN after the tool call to finish the turn.
    chatProvider.queue([
      { type: "text_delta", delta: "Let me know what you think." },
      { type: "done" },
    ]);

    const emissions: any[] = [];
    for await (const e of service.sendMessage({
      workspaceId: "w1", campaignId: "c1", userId: "u1", content: "Give me topic ideas",
    })) emissions.push(e);

    expect(createdTopics).toHaveLength(2);
    expect(createdTopics[0].title).toBe("Topic 1");

    const topicsEmission = emissions.find((e) => e.type === "topics");
    expect(topicsEmission).toBeTruthy();
    expect(topicsEmission.topics).toHaveLength(2);

    const msgs = await messageRepo.findByCampaign("c1");
    const assistant = msgs.find((m) => m.role === "assistant")!;
    const blocks = assistant.contentBlocks as any[];
    const topicsBlock = blocks.find((b) => b.type === "topics");
    expect(topicsBlock?.topicIds).toHaveLength(2);
  });
});
```

- [ ] **Step 6.2.2: Run test — should fail**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: FAIL — topics are not created.

- [ ] **Step 6.2.3: Implement tool-use loop + propose_topics execution**

Open `backend/src/services/chat.service.ts`. Replace the inner streaming section of `sendMessage` with a loop that handles tool calls. The full `sendMessage` becomes:

```ts
  async *sendMessage(input: SendChatMessageInput): AsyncIterable<ChatStreamEmission> {
    // 1. Persist the user message.
    const userMsg = await this.messageRepo.create({
      campaignId: input.campaignId,
      role: "user",
      userId: input.userId,
      contentBlocks: [{ type: "text", content: input.content }],
      attachments: input.attachments,
    });

    const systemPrompt = await this.buildSystemPrompt(input.campaignId);
    let history = await this.buildHistory(input.campaignId);

    const finalBlocks: ChatBlock[] = [];
    let currentText = "";
    let safety = 0;

    while (safety++ < 4) {
      let sawToolCall = false;
      const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];

      for await (const evt of this.chatProvider.stream({
        systemPrompt,
        messages: history,
        tools: this.getTools(),
      })) {
        if (evt.type === "text_delta") {
          currentText += evt.delta;
          yield { type: "token", delta: evt.delta };
        } else if (evt.type === "tool_call") {
          sawToolCall = true;
          toolCalls.push({ id: evt.id, name: evt.name, input: evt.input });
        } else if (evt.type === "error") {
          yield { type: "error", message: evt.message };
        } else if (evt.type === "done") {
          if (currentText.length > 0) {
            finalBlocks.push({ type: "text", content: currentText });
            currentText = "";
          }
        }
      }

      if (!sawToolCall) break;

      // Execute each tool call.
      const toolResults: Array<{ toolUseId: string; result: unknown }> = [];
      for (const call of toolCalls) {
        try {
          if (call.name === "propose_topics") {
            const result = await this.executeProposeTopics(input.campaignId, call.input as any);
            finalBlocks.push({ type: "topics", topicIds: result.topicIds });
            yield {
              type: "topics",
              block: { type: "topics", topicIds: result.topicIds },
              topics: result.topics,
            };
            toolResults.push({ toolUseId: call.id, result: { ok: true, topicCount: result.topics.length } });
          } else {
            yield { type: "error", message: `Unknown tool: ${call.name}`, toolName: call.name };
            toolResults.push({ toolUseId: call.id, result: { ok: false, error: "unknown tool" } });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          yield { type: "error", message: msg, toolName: call.name };
          toolResults.push({ toolUseId: call.id, result: { ok: false, error: msg } });
        }
      }

      // Feed the tool results back into history so the provider can wrap up.
      history = [
        ...history,
        { role: "assistant", text: `[invoked tools: ${toolCalls.map((c) => c.name).join(", ")}]` },
        { role: "user", text: `[tool results: ${JSON.stringify(toolResults.map((r) => r.result))}]` },
      ];
    }

    const assistant = await this.messageRepo.create({
      campaignId: input.campaignId,
      role: "assistant",
      contentBlocks: finalBlocks,
    });

    yield { type: "done", messageId: assistant.id };
    void userMsg;
  }

  private async executeProposeTopics(
    campaignId: string,
    args: { topics: Array<{ title: string; description: string; pillar: string; platform: string; format: string; objective: string; publishDate?: string }> },
  ): Promise<{ topicIds: string[]; topics: Array<{ id: string; title: string; description: string | null; pillar: string | null; platform: string | null; format: string | null; objective: string | null; publishDate: string | null }> }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { workspaceId: true, brandId: true },
    });
    if (!campaign) throw new Error("Campaign not found");

    const created: any[] = [];
    for (const t of args.topics) {
      const row = await this.prisma.contentTopic.create({
        data: {
          workspaceId: campaign.workspaceId,
          brandId: campaign.brandId,
          campaignId,
          title: t.title,
          description: t.description,
          pillar: t.pillar,
          platform: t.platform,
          format: t.format,
          objective: t.objective,
          publishDate: t.publishDate ? new Date(t.publishDate) : null,
          status: "draft",
        },
      });
      created.push(row);
    }

    return {
      topicIds: created.map((r) => r.id),
      topics: created.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        pillar: r.pillar,
        platform: r.platform,
        format: r.format,
        objective: r.objective,
        publishDate: r.publishDate ? r.publishDate.toISOString().slice(0, 10) : null,
      })),
    };
  }
```

- [ ] **Step 6.2.4: Run tests — should pass**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: 2/2 pass.

- [ ] **Step 6.2.5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts backend/tests/services/chat.service.test.ts
git commit -m "feat(chat): execute propose_topics tool; stream topics block"
```

### Task 6.3: Frontend `TopicsBlock` + `TopicCard`

**Files:**
- Create: `frontend/src/components/campaigns/chat/blocks/TopicCard.tsx`
- Create: `frontend/src/components/campaigns/chat/blocks/TopicsBlock.tsx`
- Modify: `frontend/src/components/campaigns/chat/Message.tsx`

- [ ] **Step 6.3.1: Create `TopicCard.tsx`**

```tsx
import { Zap } from "lucide-react";
import type { TopicSummary } from "../../../../hooks/useChatStream";

interface TopicCardProps {
  topic: TopicSummary;
  workspaceId: string;
  brandId: string | null;
}

export function TopicCard({ topic, brandId }: TopicCardProps) {
  const params = new URLSearchParams();
  if (brandId) params.set("brandId", brandId);
  params.set("topicId", topic.id);
  if (topic.platform) params.set("platform", topic.platform);
  if (topic.format) params.set("format", topic.format);
  if (topic.objective) params.set("objective", topic.objective);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-900">{topic.title}</p>
        {topic.description && (
          <p className="text-xs text-gray-600 leading-relaxed">{topic.description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {topic.pillar && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            {topic.pillar}
          </span>
        )}
        {topic.platform && (
          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 capitalize">
            {topic.platform}
          </span>
        )}
        {topic.format && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
            {topic.format.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <a
        href={`/generate?${params.toString()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
      >
        <Zap size={12} />
        Generate Content
      </a>
    </div>
  );
}
```

- [ ] **Step 6.3.2: Create `TopicsBlock.tsx`**

```tsx
import type { TopicSummary } from "../../../../hooks/useChatStream";
import { TopicCard } from "./TopicCard";

interface TopicsBlockProps {
  topicIds: string[];
  topics?: TopicSummary[];
  workspaceId: string;
  brandId: string | null;
}

export function TopicsBlock({ topicIds, topics, workspaceId, brandId }: TopicsBlockProps) {
  if (!topics || topics.length === 0) {
    return (
      <p className="text-xs text-gray-500">Generated {topicIds.length} topics.</p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
        Proposed Topics
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {topics.map((t) => (
          <TopicCard key={t.id} topic={t} workspaceId={workspaceId} brandId={brandId} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3.3: Update `Message.tsx` to render TopicsBlock**

Open `frontend/src/components/campaigns/chat/Message.tsx`. Add props for workspaceId + brandId and render the topics block:

```tsx
import { User, Sparkles, Loader2 } from "lucide-react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { TextBlock } from "./blocks/TextBlock";
import { TopicsBlock } from "./blocks/TopicsBlock";

export function Message({
  message,
  workspaceId,
  brandId,
}: {
  message: ChatMessage;
  workspaceId: string;
  brandId: string | null;
}) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isAssistant ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-600"}`}>
        {isAssistant ? <Sparkles size={14} /> : <User size={14} />}
      </div>
      <div className={`flex-1 space-y-2 ${isAssistant ? "" : "text-right"}`}>
        <div className={`inline-block text-left rounded-lg px-3 py-2 max-w-[90%] ${isAssistant ? "bg-white border border-gray-200 w-full md:max-w-[720px]" : "bg-indigo-600 text-white"}`}>
          {message.blocks.length === 0 && message.isStreaming && (
            <Loader2 size={14} className="animate-spin inline" />
          )}
          {message.blocks.map((b, i) => {
            if (b.type === "text") return <TextBlock key={i} content={b.content} />;
            if (b.type === "topics")
              return (
                <TopicsBlock
                  key={i}
                  topicIds={b.topicIds}
                  topics={b.topics}
                  workspaceId={workspaceId}
                  brandId={brandId}
                />
              );
            return null;
          })}
          {message.error && (
            <p className="text-xs text-red-600 mt-1">Error: {message.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3.4: Thread props through `MessageList` and `ChatPanel`**

Update `MessageList.tsx` to accept and forward:

```tsx
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { Message } from "./Message";

export function MessageList({
  messages,
  workspaceId,
  brandId,
}: {
  messages: ChatMessage[];
  workspaceId: string;
  brandId: string | null;
}) {
  // ... same refs and handleScroll as before ...
  return (
    <div /* ... */>
      {messages.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">Ask me anything about this campaign.</p>
      ) : (
        messages.map((m) => (
          <Message key={m.id} message={m} workspaceId={workspaceId} brandId={brandId} />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

Update `ChatPanel.tsx` to take `brandId` and pass it down:

```tsx
interface ChatPanelProps {
  workspaceId: string;
  campaignId: string;
  brandId: string | null;
  onPlanEdit?: (revisionId: string) => void;
}

export function ChatPanel({ workspaceId, campaignId, brandId, onPlanEdit }: ChatPanelProps) {
  // ... existing body ...
  return (
    <div className="flex flex-col h-[600px] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      <MessageList messages={messages} workspaceId={workspaceId} brandId={brandId} />
      <ChatInput
        workspaceId={workspaceId}
        campaignId={campaignId}
        onSend={(content, attachments) => send({ content, attachments })}
        disabled={isStreaming}
      />
    </div>
  );
}
```

And in `CampaignDetailPage.tsx`, pass brandId:

```tsx
          <ChatPanel
            workspaceId={activeWorkspace.id}
            campaignId={campaign.id}
            brandId={campaign.brandId}
            onPlanEdit={() => loadCampaign()}
          />
```

- [ ] **Step 6.3.5: Typecheck + smoke test + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

Manual: ask the AI for topics → TopicCards appear with Generate Content links.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/campaigns/chat/ \
  frontend/src/pages/CampaignDetailPage.tsx
git commit -m "feat(chat): TopicsBlock + TopicCard with Generate Content link"
```

---

## Phase 7 — `apply_plan_edit` tool + revisions panel + restore

### Task 7.1: Add `apply_plan_edit` to tools + ChatService execution with revision seeding (TDD)

**Files:**
- Modify: `backend/src/services/chat.service.ts`
- Modify: `backend/tests/services/chat.service.test.ts`

- [ ] **Step 7.1.1: Add failing test**

Append to the test file:

```ts
describe("ChatService.sendMessage (apply_plan_edit)", () => {
  let chatProvider: MockChatAiProvider;
  let messageRepo: MockChatMessageRepository;
  let revisionRepo: MockCampaignRevisionRepository;
  let service: ChatService;
  let lastCampaignUpdate: any = null;
  let lastOutputUpsert: any = null;

  const prisma = {
    campaign: {
      findUnique: async () => ({
        id: "c1", workspaceId: "w1", name: "Test", brandId: null,
        objective: "old", audienceSegment: "old", keyMessage: "old",
        outputs: [{ bigIdea: "old idea", messagingPillars: [{ name: "A", description: "a" }] }],
        briefs: [],
      }),
      update: async (args: any) => { lastCampaignUpdate = args; return {}; },
    },
    campaignOutput: {
      findFirst: async () => ({ id: "o1", bigIdea: "old idea", messagingPillars: [{ name: "A", description: "a" }] }),
      upsert: async (args: any) => { lastOutputUpsert = args; return {}; },
    },
    brandBrainVersion: { findFirst: async () => null },
    contentTopic: { findMany: async () => [], create: async (a: any) => ({ id: crypto.randomUUID(), ...a.data }) },
  } as unknown as PrismaClient;
  const mockStorage = { upload: async () => "http://minio/x", init: async () => new Map() } as any;

  beforeEach(() => {
    chatProvider = new MockChatAiProvider();
    messageRepo = new MockChatMessageRepository();
    revisionRepo = new MockCampaignRevisionRepository();
    lastCampaignUpdate = null;
    lastOutputUpsert = null;
    service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, mockStorage, { historyWindow: 20, bucket: "b" });
  });

  it("seeds Rev 1 on first edit and applies change as Rev 2", async () => {
    chatProvider.queue([
      {
        type: "tool_call", id: "call-1", name: "apply_plan_edit",
        input: { bigIdea: "new big idea", label: "Reframed big idea" },
      },
      { type: "done" },
    ]);
    chatProvider.queue([
      { type: "text_delta", delta: "Updated." },
      { type: "done" },
    ]);

    const emissions: any[] = [];
    for await (const e of service.sendMessage({
      workspaceId: "w1", campaignId: "c1", userId: "u1", content: "Change big idea",
    })) emissions.push(e);

    const revisions = await revisionRepo.findByCampaign("c1");
    expect(revisions).toHaveLength(2);
    const rev1 = revisions.find((r) => r.revisionNumber === 1)!;
    const rev2 = revisions.find((r) => r.revisionNumber === 2)!;
    expect(rev1.label).toBe("Initial plan");
    expect(rev2.label).toBe("Reframed big idea");
    expect((rev2.snapshot as any).bigIdea).toBe("new big idea");

    const planEditEmission = emissions.find((e) => e.type === "plan_edit");
    expect(planEditEmission).toBeTruthy();
    expect(planEditEmission.revisionNumber).toBe(2);
  });
});
```

- [ ] **Step 7.1.2: Run test — should fail**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: FAIL — `apply_plan_edit` unknown tool.

- [ ] **Step 7.1.3: Add tool definition + executor**

Open `backend/src/services/chat.service.ts`. Extend `getTools()`:

```ts
  private getTools(): ToolDefinition[] {
    return [
      {
        name: "apply_plan_edit",
        description:
          "Update one or more fields on the campaign plan. Omit fields you're not changing. Always include a short human-readable label.",
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
                properties: { name: { type: "string" }, description: { type: "string" } },
                required: ["name", "description"],
              },
            },
            label: { type: "string" },
          },
          required: ["label"],
        },
      },
      {
        name: "propose_topics",
        description: "Propose a list of content topics for this campaign. Topics auto-save to the Topic Library.",
        inputSchema: {
          type: "object",
          properties: {
            topics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" }, description: { type: "string" }, pillar: { type: "string" },
                  platform: { type: "string" }, format: { type: "string" }, objective: { type: "string" },
                  publishDate: { type: "string" },
                },
                required: ["title", "description", "pillar", "platform", "format", "objective"],
              },
            },
          },
          required: ["topics"],
        },
      },
    ];
  }
```

Add an executor method:

```ts
  private async executeApplyPlanEdit(
    campaignId: string,
    triggerMessageId: string | null,
    args: {
      objective?: string;
      audienceSegment?: string;
      keyMessage?: string;
      bigIdea?: string;
      messagingPillars?: Array<{ name: string; description: string }>;
      label: string;
    },
  ): Promise<{ revisionId: string; revisionNumber: number; summary: string; snapshot: any }> {
    // Load current state.
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { outputs: { take: 1, orderBy: { createdAt: "desc" } } },
    });
    if (!campaign) throw new Error("Campaign not found");
    const output = campaign.outputs[0];

    // Seed Rev 1 if none exists.
    const existingCount = await this.revisionRepo.countByCampaign(campaignId);
    if (existingCount === 0) {
      await this.revisionRepo.create({
        campaignId,
        triggerMessageId: null,
        label: "Initial plan",
        snapshot: {
          objective: campaign.objective ?? null,
          audienceSegment: campaign.audienceSegment ?? null,
          keyMessage: campaign.keyMessage ?? null,
          bigIdea: output?.bigIdea ?? null,
          messagingPillars: (output?.messagingPillars as any) ?? null,
        },
      });
    }

    // Apply changes.
    const campaignPatch: any = {};
    if (args.objective !== undefined) campaignPatch.objective = args.objective;
    if (args.audienceSegment !== undefined) campaignPatch.audienceSegment = args.audienceSegment;
    if (args.keyMessage !== undefined) campaignPatch.keyMessage = args.keyMessage;
    if (Object.keys(campaignPatch).length > 0) {
      await this.prisma.campaign.update({ where: { id: campaignId }, data: campaignPatch });
    }

    if (args.bigIdea !== undefined || args.messagingPillars !== undefined) {
      const outputPatch: any = {};
      if (args.bigIdea !== undefined) outputPatch.bigIdea = args.bigIdea;
      if (args.messagingPillars !== undefined) outputPatch.messagingPillars = args.messagingPillars as any;
      await this.prisma.campaignOutput.upsert({
        where: { id: output?.id ?? "__none__" },
        create: { campaignId, ...outputPatch },
        update: outputPatch,
      });
    }

    // Build post-change snapshot.
    const snapshot = {
      objective: args.objective ?? campaign.objective ?? null,
      audienceSegment: args.audienceSegment ?? campaign.audienceSegment ?? null,
      keyMessage: args.keyMessage ?? campaign.keyMessage ?? null,
      bigIdea: args.bigIdea ?? output?.bigIdea ?? null,
      messagingPillars: args.messagingPillars ?? (output?.messagingPillars as any) ?? null,
    };

    const newRev = await this.revisionRepo.create({
      campaignId,
      triggerMessageId,
      label: args.label,
      snapshot,
    });

    return {
      revisionId: newRev.id,
      revisionNumber: newRev.revisionNumber,
      summary: args.label,
      snapshot,
    };
  }
```

Extend the tool dispatch in `sendMessage` to handle `apply_plan_edit`:

```ts
      for (const call of toolCalls) {
        try {
          if (call.name === "propose_topics") {
            // ... existing ...
          } else if (call.name === "apply_plan_edit") {
            const result = await this.executeApplyPlanEdit(input.campaignId, null, call.input as any);
            finalBlocks.push({ type: "plan_edit", revisionId: result.revisionId, summary: result.summary });
            yield {
              type: "plan_edit",
              block: { type: "plan_edit", revisionId: result.revisionId, summary: result.summary },
              revisionId: result.revisionId,
              revisionNumber: result.revisionNumber,
              snapshot: result.snapshot,
            };
            toolResults.push({ toolUseId: call.id, result: { ok: true, revisionId: result.revisionId, revisionNumber: result.revisionNumber } });
          } else {
            // unknown tool: existing error path
          }
        } catch (e) { /* existing error path */ }
      }
```

- [ ] **Step 7.1.4: Run test — should pass**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: 3/3 pass.

- [ ] **Step 7.1.5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts backend/tests/services/chat.service.test.ts
git commit -m "feat(chat): apply_plan_edit tool + revision seeding"
```

### Task 7.2: Implement `restoreRevision`

**Files:**
- Modify: `backend/src/services/chat.service.ts`

- [ ] **Step 7.2.1: Implement**

Replace the placeholder `restoreRevision` with:

```ts
  async *restoreRevision(input: {
    workspaceId: string;
    campaignId: string;
    revisionId: string;
    userId: string;
  }): AsyncIterable<ChatStreamEmission> {
    const target = await this.revisionRepo.findById(input.revisionId);
    if (!target || target.campaignId !== input.campaignId) {
      yield { type: "error", message: "Revision not found" };
      return;
    }

    const snap = target.snapshot as any;
    const result = await this.executeApplyPlanEdit(input.campaignId, null, {
      objective: snap.objective ?? undefined,
      audienceSegment: snap.audienceSegment ?? undefined,
      keyMessage: snap.keyMessage ?? undefined,
      bigIdea: snap.bigIdea ?? undefined,
      messagingPillars: snap.messagingPillars ?? undefined,
      label: `Reverted to revision ${target.revisionNumber}`,
    });

    const assistant = await this.messageRepo.create({
      campaignId: input.campaignId,
      role: "assistant",
      contentBlocks: [{ type: "plan_edit", revisionId: result.revisionId, summary: result.summary }],
    });

    yield {
      type: "plan_edit",
      block: { type: "plan_edit", revisionId: result.revisionId, summary: result.summary },
      revisionId: result.revisionId,
      revisionNumber: result.revisionNumber,
      snapshot: result.snapshot,
    };
    yield { type: "done", messageId: assistant.id };
  }
```

- [ ] **Step 7.2.2: Typecheck + commit**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep chat.service | head -5`
Expected: no errors.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts
git commit -m "feat(chat): restoreRevision streams a plan_edit turn"
```

### Task 7.3: Frontend `PlanEditBlock`, `RevisionsPanel`, `RevisionRow`

**Files:**
- Create: `frontend/src/components/campaigns/chat/blocks/PlanEditBlock.tsx`
- Create: `frontend/src/components/campaigns/revisions/RevisionsPanel.tsx`
- Create: `frontend/src/components/campaigns/revisions/RevisionRow.tsx`
- Modify: `frontend/src/components/campaigns/chat/Message.tsx`
- Modify: `frontend/src/pages/CampaignDetailPage.tsx`

- [ ] **Step 7.3.1: Create `PlanEditBlock.tsx`**

```tsx
import { CheckCircle2 } from "lucide-react";

interface PlanEditBlockProps {
  revisionId: string;
  summary: string;
}

export function PlanEditBlock({ summary }: PlanEditBlockProps) {
  return (
    <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5 text-xs text-emerald-800">
      <CheckCircle2 size={14} className="shrink-0" />
      <span className="font-medium">Plan updated:</span>
      <span>{summary}</span>
    </div>
  );
}
```

- [ ] **Step 7.3.2: Update `Message.tsx` to render PlanEditBlock**

In the `message.blocks.map` switch, add:

```tsx
            if (b.type === "plan_edit")
              return <PlanEditBlock key={i} revisionId={b.revisionId} summary={b.summary} />;
```

And add the import at the top.

- [ ] **Step 7.3.3: Create `RevisionRow.tsx`**

```tsx
import { useState } from "react";
import { History, RotateCcw } from "lucide-react";

interface RevisionRowProps {
  revisionNumber: number;
  label: string;
  createdAt: string;
  onRestore: () => Promise<void>;
  restoreDisabled?: boolean;
}

export function RevisionRow({ revisionNumber, label, createdAt, onRestore, restoreDisabled }: RevisionRowProps) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try { await onRestore(); } finally { setBusy(false); }
  };

  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
      <History size={12} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-900">Rev {revisionNumber}</p>
        <p className="text-[11px] text-gray-600 truncate">{label}</p>
        <p className="text-[10px] text-gray-400">{new Date(createdAt).toLocaleString()}</p>
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={busy || restoreDisabled}
        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-gray-700 bg-white border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
        title="Restore this revision"
      >
        <RotateCcw size={10} />
        Restore
      </button>
    </div>
  );
}
```

- [ ] **Step 7.3.4: Create `RevisionsPanel.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { api, getAccessToken } from "../../../services/api";
import { parseSSEStream } from "../../../utils/sse-parser";
import { RevisionRow } from "./RevisionRow";

interface Revision {
  id: string;
  revisionNumber: number;
  label: string;
  createdAt: string;
}

interface RevisionsPanelProps {
  workspaceId: string;
  campaignId: string;
  refreshKey: number;
  onRestored: () => void;
}

export function RevisionsPanel({ workspaceId, campaignId, refreshKey, onRestored }: RevisionsPanelProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(() => {
    api<Revision[]>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/revisions`)
      .then(setRevisions)
      .catch(() => setRevisions([]));
  }, [workspaceId, campaignId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const restore = async (revisionId: string) => {
    setRestoring(true);
    try {
      const token = getAccessToken();
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/workspaces/${workspaceId}/campaigns/${campaignId}/revisions/${revisionId}/restore`,
        { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!resp.ok || !resp.body) return;
      for await (const _evt of parseSSEStream(resp.body)) {
        // consume; events cause the parent to refetch via onRestored below
      }
      onRestored();
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Revisions</p>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {revisions.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-400 text-center">No revisions yet.</p>
        ) : (
          revisions.map((r) => (
            <RevisionRow
              key={r.id}
              revisionNumber={r.revisionNumber}
              label={r.label}
              createdAt={r.createdAt}
              onRestore={() => restore(r.id)}
              restoreDisabled={restoring}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3.5: Update `CampaignDetailPage.tsx` layout**

Open `frontend/src/pages/CampaignDetailPage.tsx`. Add import:

```tsx
import { RevisionsPanel } from "../components/campaigns/revisions/RevisionsPanel";
```

Add state for refresh key:

```tsx
  const [revisionsRefreshKey, setRevisionsRefreshKey] = useState(0);
```

Split the `isGenerating ? ... : <>...</>` body so chat sits alongside revisions:

```tsx
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
          <div className="space-y-6 min-w-0">
            {brief && (
              <CampaignSummaryCard
                summary={brief.documentSummary ?? ""}
                documentName={brief.documentName}
                documentUrl={brief.documentUrl}
              />
            )}
            <CampaignPlanCard
              key={revisionsRefreshKey}
              workspaceId={activeWorkspace.id}
              campaignId={campaign.id}
              initial={{
                objective: campaign.objective ?? "",
                audienceSegment: campaign.audienceSegment ?? "",
                keyMessage: campaign.keyMessage ?? "",
                bigIdea: output?.bigIdea ?? "",
                messagingPillars: output?.messagingPillars ?? [],
              }}
              onToast={showToast}
            />
            <ChatPanel
              workspaceId={activeWorkspace.id}
              campaignId={campaign.id}
              brandId={campaign.brandId}
              onPlanEdit={() => {
                loadCampaign();
                setRevisionsRefreshKey((k) => k + 1);
              }}
            />
            <CampaignTopicsList topics={topics} />
          </div>
          <div>
            <RevisionsPanel
              workspaceId={activeWorkspace.id}
              campaignId={campaign.id}
              refreshKey={revisionsRefreshKey}
              onRestored={() => {
                loadCampaign();
                setRevisionsRefreshKey((k) => k + 1);
              }}
            />
          </div>
        </div>
```

The existing `isGenerating` branch stays unchanged.

- [ ] **Step 7.3.6: Typecheck + manual smoke test + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

Manual smoke test:
- Ask: "change the big idea to Family First"
- Expect: PlanEditBlock appears, plan card refreshes, RevisionsPanel shows Rev 1 (Initial plan) + Rev 2 (Reframed big idea).
- Click Restore on Rev 1 → plan card refetches to old state, new Rev 3 "Reverted to revision 1" appears.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/campaigns/ \
  frontend/src/pages/CampaignDetailPage.tsx
git commit -m "feat(chat): PlanEditBlock + RevisionsPanel + restore flow"
```

---

## Phase 8 — Anthropic provider + env-switchable resolver

### Task 8.1: `AnthropicChatProvider`

**Files:**
- Create: `backend/src/providers/anthropic-chat.provider.ts`

- [ ] **Step 8.1.1: Create the provider**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatStreamEvent,
  ChatStreamInput,
  IChatAiProvider,
} from "../interfaces/providers/chat-ai.provider.interface";
import type { ChatMessage } from "../types/chat.types";

export class AnthropicChatProvider implements IChatAiProvider {
  private client: Anthropic;

  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
    const messages = input.messages.map((m) => ({
      role: m.role,
      content: m.text,
    }));
    const tools = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as any,
    }));

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        system: input.systemPrompt,
        max_tokens: 4096,
        messages: messages as any,
        tools: tools.length > 0 ? (tools as any) : undefined,
      });

      for await (const evt of stream) {
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          yield { type: "text_delta", delta: (evt.delta as any).text };
        }
      }

      const final = await stream.finalMessage();
      for (const block of final.content) {
        if ((block as any).type === "tool_use") {
          yield {
            type: "tool_call",
            id: (block as any).id,
            name: (block as any).name,
            input: (block as any).input,
          };
        }
      }

      yield {
        type: "done",
        usage: final.usage
          ? { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens }
          : undefined,
      };
    } catch (e) {
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
      yield { type: "done" };
    }
  }
}
```

- [ ] **Step 8.1.2: Update the resolver in `backend/src/index.ts`**

Replace `resolveChatProvider` with:

```ts
function resolveChatProvider(): GeminiChatProvider | AnthropicChatProvider {
	const name = env.aiChatProvider || env.aiProvider;
	if (name === "anthropic") {
		return new AnthropicChatProvider(env.anthropicApiKey, env.anthropicModel);
	}
	return new GeminiChatProvider(env.geminiApiKey, env.geminiModel);
}
```

Add the import:

```ts
import { AnthropicChatProvider } from "./providers/anthropic-chat.provider";
```

- [ ] **Step 8.1.3: Typecheck + commit**

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "anthropic-chat|index\.ts" | head -5`
Expected: no errors.

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/anthropic-chat.provider.ts backend/src/index.ts
git commit -m "feat(chat): AnthropicChatProvider + env-switchable resolver"
```

### Task 8.2: Manual smoke test both providers

- [ ] **Step 8.2.1: Test Gemini path**

Set `AI_CHAT_PROVIDER=gemini` in `backend/.env`. Restart backend. Open a campaign, chat: "suggest 3 topics" → expect topic cards. Say "change the big idea to Protect Tomorrow" → expect plan edit block + plan card refresh.

- [ ] **Step 8.2.2: Test Anthropic path**

Set `AI_CHAT_PROVIDER=anthropic` in `backend/.env` (requires `ANTHROPIC_API_KEY` to be set). Restart. Repeat both flows.

- [ ] **Step 8.2.3: Revert to preferred default**

Set `AI_CHAT_PROVIDER=gemini` (or leave blank to fall back to `AI_PROVIDER=gemini`). Restart.

---

## Self-Review

### Spec coverage

- ✅ Page layout (§ spec "Page layout") — Task 7.3.5 (CampaignDetailPage restructure).
- ✅ Block model (§ spec "Message block model") — Task 2.1, persisted per spec.
- ✅ `CampaignChatMessage` + `CampaignPlanRevision` tables — Task 1.2.
- ✅ Chat-generated topics use ContentTopic — Task 6.2.
- ✅ SSE event shapes — Task 3.5.1.
- ✅ POST /chat streaming — Task 3.5.1.
- ✅ Multi-turn tool-use loop — Task 6.2.3.
- ✅ Tools (`apply_plan_edit`, `propose_topics`) — Task 7.1 + 6.2.
- ✅ Upload endpoint + PDF extraction + 10MB cap — Task 5.1.
- ✅ Restore revision endpoint — Tasks 7.2 + 7.3.
- ✅ System prompt composition — Task 3.4.4 (minimal); Phase 5 & 6 & 7 extend context progressively.
- ✅ Context window (last N messages, attachments inline) — Task 5.3.
- ✅ Error handling (stream error bubbles, tool-execution errors) — Task 6.2 + hook in Task 4.3.
- ✅ AI activity logging — NOT IMPLEMENTED. **Gap.** See note below.
- ✅ Provider abstraction + Gemini + Anthropic — Tasks 2.1, 2.2, 8.1.
- ✅ New module layout — matches.
- ✅ Frontend components — Tasks 4.2 – 7.3.
- ✅ Streaming consumer via fetch + parseSSEStream — Tasks 4.2, 4.3.
- ✅ File upload UX — Task 5.2.
- ✅ Markdown rendering — Task 4.4.
- ✅ Auto-scroll pause — Task 4.5.2.
- ✅ Revision panel interactions — Task 7.3.
- ✅ New npm deps — Task 4.1.
- ✅ Env vars — Task 2.3.

**Gap found: AI activity logging.** The spec says every chat request calls `logAiActivity()` with `generator: "campaign-chat"`. Added as an inline micro-task below.

### Task 7.4: Log AI activity for each chat turn

**Files:**
- Modify: `backend/src/services/chat.service.ts`

- [ ] **Step 7.4.1: Inject PrismaClient + log on each provider call**

In `chat.service.ts`, after the inner `for await` stream loop (before the `if (!sawToolCall) break;`), record usage totals and call the existing `logAiActivity` util.

Add to imports:
```ts
import { logAiActivity } from "../utils/ai-activity-logger";
```

Track `streamUsage` in the loop and, on each turn end, call:
```ts
      await logAiActivity(
        this.prisma,
        {
          workspaceId: input.workspaceId,
          generator: "campaign-chat",
          provider: process.env.AI_CHAT_PROVIDER || process.env.AI_PROVIDER || "unknown",
          userId: input.userId,
          systemPrompt: "<chat system prompt omitted — campaign id: " + input.campaignId + ">",
          userPrompt: input.content,
          brandId: null,
        },
        {
          responseJson: { blocks: finalBlocks },
          durationMs: Date.now() - turnStart,
          status: "success",
          inputTokens: streamUsage?.inputTokens,
          outputTokens: streamUsage?.outputTokens,
        },
      );
```

(Capture `turnStart = Date.now()` before the stream and `streamUsage` from the `done` event.)

- [ ] **Step 7.4.2: Run chat service tests**

Run: `cd backend && bun test tests/services/chat.service.test.ts`
Expected: 3/3 still pass (the logger call is fire-and-forget; mock prisma has no dependency on the AiProviderLog table directly since tests run in-memory without hitting the real logger path — adjust the test prisma stub if needed to stub `aiProviderLog.create` as a no-op).

If tests break, add this to the prisma stub in each describe:
```ts
const prisma = {
  // ... existing ...
  aiProviderLog: { create: async () => ({}) },
} as unknown as PrismaClient;
```

- [ ] **Step 7.4.3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/chat.service.ts backend/tests/services/chat.service.test.ts
git commit -m "feat(chat): log AI activity for each chat turn"
```

### Placeholder scan

No TBD / TODO / "handle edge cases" / "similar to Task N" patterns in the plan.

### Type consistency

- `ChatBlock` union used consistently: `text` / `plan_edit` / `topics`. ✓
- `IChatAiProvider.stream` returns `AsyncIterable<ChatStreamEvent>`; `ChatStreamEvent` has `text_delta`, `tool_call`, `error`, `done` — all four handled in the service loop. ✓
- `IChatService.sendMessage` returns `AsyncIterable<ChatStreamEmission>`; `ChatStreamEmission` handled consistently in the route's `streamSSE` handler. ✓
- `ChatAttachment` shape matches between backend and frontend (via JSON; frontend replicates the interface in `useChatStream.ts`). ✓
- `CreateRevisionInput.triggerMessageId` / `executeApplyPlanEdit(campaignId, triggerMessageId, args)` — both accept `null`. ✓

### Known gaps from scope

- Stop-button / cancel mid-stream: not implemented (spec non-goal).
- Responsive mobile layout for sidebar: not implemented (spec non-goal).
- Syntax highlighter for code blocks: not implemented (spec non-goal).

---

## Execution notes

- Phases are ordered so each commit leaves the repo in a working state. If the engineer pauses between phases, what shipped still works end-to-end.
- No destructive schema changes. `prisma db push` in Task 1.2 only adds tables.
- Provider resolver falls back to Gemini if `AI_CHAT_PROVIDER` is empty — no hard crash in dev.
- Tests use mock repositories + a scripted mock AI provider; no integration tests for SSE streaming (too brittle; service tests cover the logic).
- `CampaignPlanCard` reuses `key={revisionsRefreshKey}` to force a remount on plan edits — the existing component already refetches its own initial state on mount.
