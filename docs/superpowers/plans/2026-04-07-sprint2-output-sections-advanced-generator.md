# Sprint 2: Output Sections Architecture & Advanced Generator UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose AI-generated content into typed, individually editable sections (hook, caption, CTA, hashtags, visual direction, rationale) and add basic/advanced mode toggle to the generator UI.

**Architecture:** Modify the content generation job to save output as `OutputSection` records. Add per-section edit and regenerate endpoints. Redesign the frontend generation result to show tabbed sections with inline editing.

**Tech Stack:** Prisma 7, Bun, Hono, pg-boss, React 19, Tailwind CSS 4, TypeScript

**Prerequisite:** Sprint 1 must be completed (OutputSection model exists in schema).

---

## Task 1: Output Section Repository Layer

**Files:**
- Create: `backend/src/interfaces/repositories/output-section.repository.interface.ts`
- Create: `backend/src/repositories/output-section.repository.ts`

- [ ] **Step 1: Create output section repository interface**

Create `backend/src/interfaces/repositories/output-section.repository.interface.ts`:

```typescript
export interface IOutputSectionRepository {
	findByOutputId(outputId: string): Promise<OutputSectionRecord[]>;
	findById(id: string): Promise<OutputSectionRecord | null>;
	createMany(outputId: string, sections: CreateOutputSectionInput[]): Promise<void>;
	update(id: string, data: { contentText: string }): Promise<OutputSectionRecord>;
	deleteByOutputId(outputId: string): Promise<void>;
}

export interface OutputSectionRecord {
	id: string;
	outputId: string;
	sectionType: string;
	sectionOrder: number;
	contentText: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface CreateOutputSectionInput {
	sectionType: string;
	sectionOrder: number;
	contentText: string;
}
```

- [ ] **Step 2: Create output section repository implementation**

Create `backend/src/repositories/output-section.repository.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type {
	CreateOutputSectionInput,
	IOutputSectionRepository,
	OutputSectionRecord,
} from "../interfaces/repositories/output-section.repository.interface";

export class OutputSectionRepository implements IOutputSectionRepository {
	constructor(private prisma: PrismaClient) {}

	async findByOutputId(outputId: string): Promise<OutputSectionRecord[]> {
		return this.prisma.outputSection.findMany({
			where: { outputId },
			orderBy: { sectionOrder: "asc" },
		});
	}

	async findById(id: string): Promise<OutputSectionRecord | null> {
		return this.prisma.outputSection.findUnique({ where: { id } });
	}

	async createMany(outputId: string, sections: CreateOutputSectionInput[]): Promise<void> {
		await this.prisma.outputSection.createMany({
			data: sections.map((s) => ({
				outputId,
				sectionType: s.sectionType,
				sectionOrder: s.sectionOrder,
				contentText: s.contentText,
			})),
		});
	}

	async update(id: string, data: { contentText: string }): Promise<OutputSectionRecord> {
		return this.prisma.outputSection.update({ where: { id }, data });
	}

	async deleteByOutputId(outputId: string): Promise<void> {
		await this.prisma.outputSection.deleteMany({ where: { outputId } });
	}
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/interfaces/repositories/output-section.repository.interface.ts \
        backend/src/repositories/output-section.repository.ts
git commit -m "feat: add OutputSection repository layer"
```

---

## Task 2: Modify Content Generation Job to Save Sections

**Files:**
- Modify: `backend/src/jobs/content-generation.job.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update content generation job to parse AI output into sections**

In `backend/src/jobs/content-generation.job.ts`, after the job creates a `GenerationOutput`, add logic to parse the content JSON into `OutputSection` records.

Add the output section repository as a constructor dependency:

```typescript
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";

export class ContentGenerationJob {
	constructor(
		private prisma: any,
		private contentGenerator: any,
		private notificationService: any,
		private logger: any,
		private outputSectionRepository?: IOutputSectionRepository,
	) {}
```

After saving the `GenerationOutput`, parse and save sections:

```typescript
		// Parse AI output into typed sections
		if (this.outputSectionRepository && result) {
			const sections = this.parseOutputToSections(result);
			await this.outputSectionRepository.createMany(output.id, sections);
		}
```

Add this private method to the class:

```typescript
	private parseOutputToSections(result: any) {
		const sections: { sectionType: string; sectionOrder: number; contentText: string }[] = [];
		let order = 0;

		// Extract hooks
		if (result.hooks || result.hook) {
			const hooks = result.hooks || [result.hook];
			const hookArray = Array.isArray(hooks) ? hooks : [hooks];
			for (const hook of hookArray) {
				sections.push({
					sectionType: "hook",
					sectionOrder: order++,
					contentText: typeof hook === "string" ? hook : JSON.stringify(hook),
				});
			}
		}

		// Extract caption/main copy
		if (result.caption || result.mainCopy || result.content) {
			const caption = result.caption || result.mainCopy || result.content;
			sections.push({
				sectionType: "caption",
				sectionOrder: order++,
				contentText: typeof caption === "string" ? caption : JSON.stringify(caption),
			});
		}

		// Extract CTA
		if (result.cta || result.callToAction) {
			const cta = result.cta || result.callToAction;
			const ctaArray = Array.isArray(cta) ? cta : [cta];
			for (const c of ctaArray) {
				sections.push({
					sectionType: "cta",
					sectionOrder: order++,
					contentText: typeof c === "string" ? c : JSON.stringify(c),
				});
			}
		}

		// Extract hashtags
		if (result.hashtags) {
			sections.push({
				sectionType: "hashtag",
				sectionOrder: order++,
				contentText: Array.isArray(result.hashtags) ? result.hashtags.join(" ") : result.hashtags,
			});
		}

		// Extract visual direction
		if (result.visualDirection) {
			sections.push({
				sectionType: "visual_direction",
				sectionOrder: order++,
				contentText:
					typeof result.visualDirection === "string"
						? result.visualDirection
						: JSON.stringify(result.visualDirection),
			});
		}

		// Extract rationale
		if (result.rationale) {
			sections.push({
				sectionType: "rationale",
				sectionOrder: order++,
				contentText: result.rationale,
			});
		}

		return sections;
	}
```

- [ ] **Step 2: Wire output section repository into composition root**

In `backend/src/index.ts`, add:

```typescript
import { OutputSectionRepository } from "./repositories/output-section.repository";
```

After the other repository instantiations:

```typescript
	const outputSectionRepository = new OutputSectionRepository(prisma);
```

Update the `ContentGenerationJob` constructor to include the output section repository:

```typescript
	const contentGenerationJob = new ContentGenerationJob(
		prisma,
		resolveContentGenerator(),
		notificationService,
		logger,
		outputSectionRepository,
	);
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/jobs/content-generation.job.ts backend/src/index.ts
git commit -m "feat: parse AI output into typed OutputSection records during generation"
```

---

## Task 3: Section Edit and Regenerate Endpoints

**Files:**
- Modify: `backend/src/routes/library.route.ts`
- Modify: `backend/src/services/library.service.ts`
- Modify: `backend/src/interfaces/services/library.service.interface.ts`

- [ ] **Step 1: Add section endpoints to library route**

In `backend/src/routes/library.route.ts`, add these endpoints:

```typescript
	// Get sections for an output
	app.get("/:id/sections", async (c) => {
		const outputId = c.req.param("id");
		const sections = await libraryService.getSections(outputId);
		return c.json({ data: sections });
	});

	// Update a section's content
	app.patch("/:id/sections/:sectionId", async (c) => {
		const sectionId = c.req.param("sectionId");
		const userId = c.get("userId" as any);
		const body = await c.req.json();
		const section = await libraryService.updateSection(sectionId, body.contentText, userId);
		return c.json({ data: section });
	});
```

- [ ] **Step 2: Add section methods to library service interface**

In `backend/src/interfaces/services/library.service.interface.ts`, add:

```typescript
	getSections(outputId: string): Promise<any[]>;
	updateSection(sectionId: string, contentText: string, userId: string): Promise<any>;
```

- [ ] **Step 3: Add section methods to library service**

In `backend/src/services/library.service.ts`, add constructor dependency and methods:

Add `IOutputSectionRepository` as an optional constructor parameter:

```typescript
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";

export class LibraryService implements ILibraryService {
	constructor(
		private generationRepository: IGenerationRepository,
		private outputSectionRepository?: IOutputSectionRepository,
	) {}
```

Add these methods:

```typescript
	async getSections(outputId: string) {
		if (!this.outputSectionRepository) return [];
		return this.outputSectionRepository.findByOutputId(outputId);
	}

	async updateSection(sectionId: string, contentText: string, userId: string) {
		if (!this.outputSectionRepository) throw new Error("Sections not available");

		const existing = await this.outputSectionRepository.findById(sectionId);
		if (!existing) throw new Error("Section not found");

		// Record feedback event for the edit
		await this.generationRepository.addFeedback({
			outputId: existing.outputId,
			eventType: "section_edit",
			before: { sectionType: existing.sectionType, contentText: existing.contentText },
			after: { sectionType: existing.sectionType, contentText },
			userId,
		});

		return this.outputSectionRepository.update(sectionId, { contentText });
	}
```

- [ ] **Step 4: Wire output section repository into library service in index.ts**

In `backend/src/index.ts`, update the LibraryService instantiation:

```typescript
	const libraryService = new LibraryService(generationRepository, outputSectionRepository);
```

- [ ] **Step 5: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/routes/library.route.ts \
        backend/src/services/library.service.ts \
        backend/src/interfaces/services/library.service.interface.ts \
        backend/src/index.ts
git commit -m "feat: add section view and edit endpoints to library"
```

---

## Task 4: Update Generation Repository to Include Sections in Output Queries

**Files:**
- Modify: `backend/src/repositories/generation.repository.ts`

- [ ] **Step 1: Include sections in output queries**

In `backend/src/repositories/generation.repository.ts`, update `findById` to include sections:

In the `findById` method, update the `include` clause for `outputs`:

```typescript
	async findById(id: string) {
		return this.prisma.generationRequest.findUnique({
			where: { id },
			include: {
				outputs: {
					include: {
						feedbackEvents: true,
						sections: { orderBy: { sectionOrder: "asc" } },
					},
				},
			},
		});
	}
```

Also update `findOutputsByWorkspace` to include sections:

```typescript
	async findOutputsByWorkspace(workspaceId: string) {
		return this.prisma.generationOutput.findMany({
			where: { request: { workspaceId } },
			include: {
				request: true,
				feedbackEvents: true,
				sections: { orderBy: { sectionOrder: "asc" } },
			},
			orderBy: { createdAt: "desc" },
		});
	}
```

- [ ] **Step 2: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/repositories/generation.repository.ts
git commit -m "feat: include output sections in generation queries"
```

---

## Task 5: Frontend — Output Section Types and API

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add OutputSection type**

Add to `frontend/src/types/index.ts`:

```typescript
export interface OutputSection {
	id: string;
	outputId: string;
	sectionType: "hook" | "caption" | "cta" | "hashtag" | "visual_direction" | "rationale";
	sectionOrder: number;
	contentText: string;
	createdAt: string;
	updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/types/index.ts
git commit -m "feat: add OutputSection frontend type"
```

---

## Task 6: Frontend — Redesign LibraryPage with Section Viewer

**Files:**
- Modify: `frontend/src/pages/LibraryPage.tsx`
- Create: `frontend/src/components/library/SectionViewer.tsx`

- [ ] **Step 1: Create SectionViewer component**

Create `frontend/src/components/library/SectionViewer.tsx`:

```tsx
import { useState } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Toast } from "../ui/Toast";
import type { OutputSection } from "../../types";

interface SectionViewerProps {
	sections: OutputSection[];
	workspaceId: string;
	outputId: string;
	onSectionUpdated: () => void;
}

const SECTION_LABELS: Record<string, string> = {
	hook: "Hooks",
	caption: "Caption",
	cta: "CTA",
	hashtag: "Hashtags",
	visual_direction: "Visual Direction",
	rationale: "Rationale",
};

const SECTION_ORDER = ["hook", "caption", "cta", "hashtag", "visual_direction", "rationale"];

export function SectionViewer({ sections, workspaceId, outputId, onSectionUpdated }: SectionViewerProps) {
	const [activeTab, setActiveTab] = useState(SECTION_ORDER[0]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editText, setEditText] = useState("");
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	const groupedSections: Record<string, OutputSection[]> = {};
	for (const section of sections) {
		if (!groupedSections[section.sectionType]) {
			groupedSections[section.sectionType] = [];
		}
		groupedSections[section.sectionType].push(section);
	}

	const availableTabs = SECTION_ORDER.filter((type) => groupedSections[type]?.length > 0);

	const handleEdit = (section: OutputSection) => {
		setEditingId(section.id);
		setEditText(section.contentText);
	};

	const handleSave = async (sectionId: string) => {
		setSaving(true);
		try {
			await api(`/api/workspaces/${workspaceId}/library/${outputId}/sections/${sectionId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ contentText: editText }),
			});
			setEditingId(null);
			setToast({ message: "Section updated", type: "success" });
			onSectionUpdated();
		} catch {
			setToast({ message: "Failed to update section", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	if (sections.length === 0) {
		return <p className="text-xs text-gray-400">No sections available for this output.</p>;
	}

	return (
		<div>
			<div className="flex gap-1 border-b border-gray-200 mb-4">
				{availableTabs.map((type) => (
					<button
						key={type}
						onClick={() => setActiveTab(type)}
						className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
							activeTab === type
								? "border-black text-black"
								: "border-transparent text-gray-500 hover:text-gray-700"
						}`}
					>
						{SECTION_LABELS[type] || type}
						{groupedSections[type]?.length > 1 && (
							<Badge variant="default" className="ml-1">{groupedSections[type].length}</Badge>
						)}
					</button>
				))}
			</div>

			<div className="space-y-3">
				{(groupedSections[activeTab] || []).map((section, idx) => (
					<div key={section.id} className="border border-gray-100 rounded-lg p-3">
						{groupedSections[activeTab].length > 1 && (
							<p className="text-xs text-gray-400 mb-2">Option {idx + 1}</p>
						)}

						{editingId === section.id ? (
							<div>
								<textarea
									className="w-full border border-gray-300 rounded p-2 text-sm min-h-[100px] focus:outline-none focus:border-black"
									value={editText}
									onChange={(e) => setEditText(e.target.value)}
								/>
								<div className="flex gap-2 mt-2">
									<Button size="sm" onClick={() => handleSave(section.id)} loading={saving}>
										Save
									</Button>
									<Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
										Cancel
									</Button>
								</div>
							</div>
						) : (
							<div>
								<p className="text-sm whitespace-pre-wrap">{section.contentText}</p>
								<button
									onClick={() => handleEdit(section)}
									className="text-xs text-gray-400 hover:text-black mt-2"
								>
									Edit
								</button>
							</div>
						)}
					</div>
				))}
			</div>

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 2: Update LibraryPage to show sections in output detail modal**

In `frontend/src/pages/LibraryPage.tsx`, import and use `SectionViewer` when viewing output detail.

When a user clicks on an output row, fetch its sections and display them in the modal:

```typescript
import { SectionViewer } from "../components/library/SectionViewer";
import type { OutputSection } from "../types";
```

Add state for sections:

```typescript
const [sections, setSections] = useState<OutputSection[]>([]);
```

When opening the output detail modal, fetch sections:

```typescript
const handleViewOutput = async (output: any) => {
	setSelectedOutput(output);
	try {
		const secs = await api<OutputSection[]>(
			`/api/workspaces/${activeWorkspace.id}/library/${output.id}/sections`
		);
		setSections(secs);
	} catch {
		setSections([]);
	}
};
```

In the modal, add the SectionViewer after the existing content display:

```tsx
{sections.length > 0 && (
	<div className="mt-4">
		<h3 className="text-sm font-medium mb-2">Content Sections</h3>
		<SectionViewer
			sections={sections}
			workspaceId={activeWorkspace.id}
			outputId={selectedOutput.id}
			onSectionUpdated={() => handleViewOutput(selectedOutput)}
		/>
	</div>
)}
```

- [ ] **Step 3: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/components/library/SectionViewer.tsx \
        frontend/src/pages/LibraryPage.tsx
git commit -m "feat: add SectionViewer component with tabbed sections and inline editing"
```

---

## Task 7: Frontend — Basic/Advanced Mode Toggle on GeneratePage

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Add mode toggle state and conditional rendering**

In `frontend/src/pages/GeneratePage.tsx`, add a mode toggle:

```typescript
const [advancedMode, setAdvancedMode] = useState(false);
```

Add a toggle button after the page title:

```tsx
<div className="flex items-center justify-between mb-4">
	<h1 className="text-xl font-semibold">Generate Content</h1>
	<button
		onClick={() => setAdvancedMode(!advancedMode)}
		className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
	>
		{advancedMode ? "Switch to Basic" : "Switch to Advanced"}
	</button>
</div>
```

Wrap the optional selectors (framework, hookType, tonePreset, visualStyle, outputLength, language, custom prompt) in a conditional:

```tsx
{/* Always shown: Brand, Product, Platform, Content Type */}
<Select label="Brand" ... />
<Select label="Product" ... />
<Select label="Platform" ... />
<Select label="Content Type" ... />

{/* Basic mode: Objective only */}
<Select label="Objective" ... />

{advancedMode && (
	<>
		<Select label="Framework" ... />
		<Select label="Hook Type" ... />
		<Select label="Tone Preset" ... />
		<Select label="Visual Style" ... />
		<Select label="Output Length" ... />
		<Select label="Language" ... />
		<div>
			<label className="text-xs font-medium text-gray-700">Additional Context</label>
			<textarea
				className="w-full mt-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:border-black"
				rows={3}
				value={customPrompt}
				onChange={(e) => setCustomPrompt(e.target.value)}
				placeholder="Add any additional context or instructions..."
			/>
		</div>
	</>
)}
```

- [ ] **Step 2: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat: add basic/advanced mode toggle to content generator page"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run frontend build**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Verify Prisma schema**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bunx prisma validate`
Expected: Schema is valid
