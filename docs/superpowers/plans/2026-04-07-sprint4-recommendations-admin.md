# Sprint 4: Recommendation & Learning System + Admin Panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frequency-based recommendation engine that learns from user feedback events, and a full admin panel with user management, taxonomy CRUD, and audit log browsing.

**Architecture:** Recommendation profiles computed asynchronously via pg-boss when feedback events occur. Admin routes protected by superadmin middleware. Frontend Learning Center shows brand/product recommendation insights.

**Tech Stack:** Prisma 7, Bun, Hono, pg-boss, React 19, Tailwind CSS 4, TypeScript

**Prerequisite:** Sprints 1-3 completed.

---

## Task 1: Recommendation Repository

**Files:**
- Create: `backend/src/interfaces/repositories/recommendation.repository.interface.ts`
- Create: `backend/src/repositories/recommendation.repository.ts`

- [ ] **Step 1: Create recommendation repository interface**

Create `backend/src/interfaces/repositories/recommendation.repository.interface.ts`:

```typescript
export interface IRecommendationRepository {
	findByScopeTypeAndId(scopeType: string, scopeId: string): Promise<any | null>;
	upsert(
		scopeType: string,
		scopeId: string,
		data: {
			workspaceId?: string;
			preferredFrameworks?: any;
			preferredHooks?: any;
			preferredTones?: any;
			preferredVisualStyles?: any;
			preferredPlatforms?: any;
			commonEditPatterns?: any;
			sampleSize: number;
		},
	): Promise<any>;
}
```

- [ ] **Step 2: Create recommendation repository**

Create `backend/src/repositories/recommendation.repository.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { IRecommendationRepository } from "../interfaces/repositories/recommendation.repository.interface";

export class RecommendationRepository implements IRecommendationRepository {
	constructor(private prisma: PrismaClient) {}

	async findByScopeTypeAndId(scopeType: string, scopeId: string) {
		return this.prisma.recommendationProfile.findUnique({
			where: { scopeType_scopeId: { scopeType, scopeId } },
		});
	}

	async upsert(scopeType: string, scopeId: string, data: any) {
		return this.prisma.recommendationProfile.upsert({
			where: { scopeType_scopeId: { scopeType, scopeId } },
			update: { ...data },
			create: { scopeType, scopeId, ...data },
		});
	}
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/interfaces/repositories/recommendation.repository.interface.ts \
        backend/src/repositories/recommendation.repository.ts
git commit -m "feat: add recommendation repository with upsert support"
```

---

## Task 2: Recommendation Recompute Job

**Files:**
- Create: `backend/src/jobs/recommendation-recompute.job.ts`

- [ ] **Step 1: Create recommendation recompute job**

Create `backend/src/jobs/recommendation-recompute.job.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { IRecommendationRepository } from "../interfaces/repositories/recommendation.repository.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export class RecommendationRecomputeJob {
	constructor(
		private prisma: PrismaClient,
		private recommendationRepository: IRecommendationRepository,
		private logger: ILogger,
	) {}

	async handle(data: { brandId: string; workspaceId: string }) {
		const { brandId, workspaceId } = data;

		try {
			this.logger.info("Recomputing recommendation profile", { brandId });

			// Get all approved generation outputs for this brand
			const approvedOutputs = await this.prisma.generationOutput.findMany({
				where: {
					status: "approved",
					request: { brandId },
				},
				include: { request: true },
			});

			if (approvedOutputs.length === 0) {
				this.logger.info("No approved outputs for brand, skipping", { brandId });
				return;
			}

			// Count frequency of frameworks, hook types, platforms
			const frameworkCounts: Record<string, number> = {};
			const hookTypeCounts: Record<string, number> = {};
			const platformCounts: Record<string, number> = {};

			for (const output of approvedOutputs) {
				const req = output.request;
				frameworkCounts[req.framework] = (frameworkCounts[req.framework] || 0) + 1;
				hookTypeCounts[req.hookType] = (hookTypeCounts[req.hookType] || 0) + 1;
				platformCounts[req.platform] = (platformCounts[req.platform] || 0) + 1;
			}

			// Sort by frequency, take top 5
			const sortByFrequency = (counts: Record<string, number>) =>
				Object.entries(counts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5)
					.map(([name, count]) => ({ name, count }));

			// Get common edit patterns
			const editEvents = await this.prisma.outputFeedbackEvent.findMany({
				where: {
					eventType: { in: ["manual_edit", "section_edit"] },
					output: { request: { brandId } },
				},
				take: 100,
				orderBy: { createdAt: "desc" },
			});

			const editPatterns: Record<string, number> = {};
			for (const event of editEvents) {
				const before = event.before as any;
				if (before?.sectionType) {
					editPatterns[before.sectionType] = (editPatterns[before.sectionType] || 0) + 1;
				}
			}

			await this.recommendationRepository.upsert("brand", brandId, {
				workspaceId,
				preferredFrameworks: sortByFrequency(frameworkCounts),
				preferredHooks: sortByFrequency(hookTypeCounts),
				preferredPlatforms: sortByFrequency(platformCounts),
				commonEditPatterns: sortByFrequency(editPatterns),
				sampleSize: approvedOutputs.length,
			});

			this.logger.info("Recommendation profile updated", { brandId, sampleSize: approvedOutputs.length });
		} catch (error) {
			this.logger.error("Recommendation recompute failed", {
				brandId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/jobs/recommendation-recompute.job.ts
git commit -m "feat: add recommendation recompute job with frequency-based analysis"
```

---

## Task 3: Recommendation Service and Route

**Files:**
- Create: `backend/src/interfaces/services/recommendation.service.interface.ts`
- Create: `backend/src/services/recommendation.service.ts`
- Create: `backend/src/routes/recommendation.route.ts`

- [ ] **Step 1: Create recommendation service interface**

Create `backend/src/interfaces/services/recommendation.service.interface.ts`:

```typescript
export interface IRecommendationService {
	getForBrand(brandId: string): Promise<any | null>;
	getForProduct(productId: string): Promise<any | null>;
}
```

- [ ] **Step 2: Create recommendation service**

Create `backend/src/services/recommendation.service.ts`:

```typescript
import type { IRecommendationRepository } from "../interfaces/repositories/recommendation.repository.interface";
import type { IRecommendationService } from "../interfaces/services/recommendation.service.interface";

export class RecommendationService implements IRecommendationService {
	constructor(private recommendationRepository: IRecommendationRepository) {}

	async getForBrand(brandId: string) {
		return this.recommendationRepository.findByScopeTypeAndId("brand", brandId);
	}

	async getForProduct(productId: string) {
		return this.recommendationRepository.findByScopeTypeAndId("product", productId);
	}
}
```

- [ ] **Step 3: Create recommendation route**

Create `backend/src/routes/recommendation.route.ts`:

```typescript
import { Hono } from "hono";
import type { IRecommendationService } from "../interfaces/services/recommendation.service.interface";

export function createRecommendationRoutes(recommendationService: IRecommendationService) {
	const app = new Hono();

	app.get("/brand/:brandId", async (c) => {
		const brandId = c.req.param("brandId");
		const profile = await recommendationService.getForBrand(brandId);
		return c.json({ data: profile });
	});

	app.get("/product/:productId", async (c) => {
		const productId = c.req.param("productId");
		const profile = await recommendationService.getForProduct(productId);
		return c.json({ data: profile });
	});

	return app;
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/interfaces/services/recommendation.service.interface.ts \
        backend/src/services/recommendation.service.ts \
        backend/src/routes/recommendation.route.ts
git commit -m "feat: add recommendation service and route for brand/product profiles"
```

---

## Task 4: Trigger Recommendation Recompute on Feedback

**Files:**
- Modify: `backend/src/services/library.service.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add pg-boss to library service for recommendation trigger**

In `backend/src/services/library.service.ts`, add PgBoss as constructor dependency:

```typescript
import type { PgBoss } from "pg-boss";

export class LibraryService implements ILibraryService {
	constructor(
		private generationRepository: IGenerationRepository,
		private outputSectionRepository?: IOutputSectionRepository,
		private boss?: PgBoss,
	) {}
```

In the `addFeedback` method, after recording the feedback event, trigger recompute:

```typescript
	async addFeedback(outputId: string, eventType: string, userId: string, before?: any, after?: any) {
		await this.generationRepository.addFeedback({
			outputId,
			eventType,
			userId,
			before: before || null,
			after: after || null,
		});

		// Trigger recommendation recompute if it's an approve event
		if (this.boss && (eventType === "approve" || eventType === "reject")) {
			const output = await this.generationRepository.findOutputById(outputId);
			if (output?.request) {
				await this.boss.send("recommendation-recompute", {
					brandId: output.request.brandId,
					workspaceId: output.request.workspaceId,
				});
			}
		}
	}
```

- [ ] **Step 2: Wire recommendation system into composition root**

In `backend/src/index.ts`, add imports:

```typescript
import { RecommendationRepository } from "./repositories/recommendation.repository";
import { RecommendationService } from "./services/recommendation.service";
import { RecommendationRecomputeJob } from "./jobs/recommendation-recompute.job";
import { createRecommendationRoutes } from "./routes/recommendation.route";
```

Add instantiations:

```typescript
	const recommendationRepository = new RecommendationRepository(prisma);
	const recommendationService = new RecommendationService(recommendationRepository);
	const recommendationRecomputeJob = new RecommendationRecomputeJob(prisma, recommendationRepository, logger);
```

Update LibraryService to include boss:

```typescript
	const libraryService = new LibraryService(generationRepository, outputSectionRepository, boss);
```

Add queue and worker:

```typescript
	await boss.createQueue("recommendation-recompute");
	await boss.work("recommendation-recompute", async (jobs) => {
		for (const job of jobs) await recommendationRecomputeJob.handle(job.data as any);
	});
```

Add route:

```typescript
	workspaceScoped.route("/recommendations", createRecommendationRoutes(recommendationService));
```

- [ ] **Step 3: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS (some library tests may need mock updates for new constructor params)

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/services/library.service.ts \
        backend/src/index.ts
git commit -m "feat: trigger recommendation recompute on feedback events"
```

---

## Task 5: Admin Service and Routes

**Files:**
- Create: `backend/src/middlewares/admin.middleware.ts`
- Create: `backend/src/services/admin.service.ts`
- Create: `backend/src/interfaces/services/admin.service.interface.ts`
- Create: `backend/src/routes/admin.route.ts`

- [ ] **Step 1: Create admin middleware**

Create `backend/src/middlewares/admin.middleware.ts`:

```typescript
import { createMiddleware } from "hono/factory";
import type { PrismaClient } from "@prisma/client";

export function createAdminMiddleware(prisma: PrismaClient) {
	return createMiddleware(async (c, next) => {
		const userId = c.get("userId" as any);
		const user = await prisma.user.findUnique({ where: { id: userId } });

		if (!user?.isSuperadmin) {
			return c.json({ error: "Superadmin access required" }, 403);
		}

		await next();
	});
}
```

- [ ] **Step 2: Create admin service interface**

Create `backend/src/interfaces/services/admin.service.interface.ts`:

```typescript
export interface IAdminService {
	listUsers(): Promise<any[]>;
	updateUser(userId: string, data: { fullName?: string; status?: string; isSuperadmin?: boolean }): Promise<any>;
	listAuditLogs(workspaceId?: string, limit?: number): Promise<any[]>;
	createTaxonomyItem(type: "framework" | "hookType" | "tonePreset" | "visualStyle", data: { name: string; description?: string }): Promise<any>;
	updateTaxonomyItem(type: "framework" | "hookType" | "tonePreset" | "visualStyle", id: string, data: { name?: string; description?: string }): Promise<any>;
	deleteTaxonomyItem(type: "framework" | "hookType" | "tonePreset" | "visualStyle", id: string): Promise<void>;
}
```

- [ ] **Step 3: Create admin service**

Create `backend/src/services/admin.service.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { IAdminService } from "../interfaces/services/admin.service.interface";

export class AdminService implements IAdminService {
	constructor(private prisma: PrismaClient) {}

	async listUsers() {
		return this.prisma.user.findMany({
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true, createdAt: true },
			orderBy: { createdAt: "desc" },
		});
	}

	async updateUser(userId: string, data: any) {
		return this.prisma.user.update({
			where: { id: userId },
			data,
			select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true },
		});
	}

	async listAuditLogs(workspaceId?: string, limit = 50) {
		return this.prisma.auditLog.findMany({
			where: workspaceId ? { workspaceId } : {},
			include: { user: { select: { email: true, fullName: true } } },
			orderBy: { createdAt: "desc" },
			take: limit,
		});
	}

	async createTaxonomyItem(type: string, data: { name: string; description?: string }) {
		const model = this.getModel(type);
		return (model as any).create({ data });
	}

	async updateTaxonomyItem(type: string, id: string, data: any) {
		const model = this.getModel(type);
		return (model as any).update({ where: { id }, data });
	}

	async deleteTaxonomyItem(type: string, id: string) {
		const model = this.getModel(type);
		await (model as any).delete({ where: { id } });
	}

	private getModel(type: string) {
		switch (type) {
			case "framework": return this.prisma.framework;
			case "hookType": return this.prisma.hookType;
			case "tonePreset": return this.prisma.tonePreset;
			case "visualStyle": return this.prisma.visualStyle;
			default: throw new Error(`Unknown taxonomy type: ${type}`);
		}
	}
}
```

- [ ] **Step 4: Create admin route**

Create `backend/src/routes/admin.route.ts`:

```typescript
import { Hono } from "hono";
import type { IAdminService } from "../interfaces/services/admin.service.interface";

export function createAdminRoutes(adminService: IAdminService) {
	const app = new Hono();

	// User management
	app.get("/users", async (c) => {
		const users = await adminService.listUsers();
		return c.json({ data: users });
	});

	app.patch("/users/:id", async (c) => {
		const userId = c.req.param("id");
		const body = await c.req.json();
		const user = await adminService.updateUser(userId, body);
		return c.json({ data: user });
	});

	// Audit logs
	app.get("/audit-logs", async (c) => {
		const workspaceId = c.req.query("workspaceId");
		const limit = parseInt(c.req.query("limit") || "50");
		const logs = await adminService.listAuditLogs(workspaceId || undefined, limit);
		return c.json({ data: logs });
	});

	// Taxonomy CRUD (frameworks, hookTypes, tonePresets, visualStyles)
	const taxonomyTypes = ["frameworks", "hook-types", "tone-presets", "visual-styles"];
	const typeMap: Record<string, string> = {
		"frameworks": "framework",
		"hook-types": "hookType",
		"tone-presets": "tonePreset",
		"visual-styles": "visualStyle",
	};

	for (const route of taxonomyTypes) {
		const type = typeMap[route];

		app.post(`/taxonomy/${route}`, async (c) => {
			const body = await c.req.json();
			const item = await adminService.createTaxonomyItem(type as any, body);
			return c.json({ data: item }, 201);
		});

		app.patch(`/taxonomy/${route}/:id`, async (c) => {
			const id = c.req.param("id");
			const body = await c.req.json();
			const item = await adminService.updateTaxonomyItem(type as any, id, body);
			return c.json({ data: item });
		});

		app.delete(`/taxonomy/${route}/:id`, async (c) => {
			const id = c.req.param("id");
			await adminService.deleteTaxonomyItem(type as any, id);
			return c.json({ data: { success: true } });
		});
	}

	return app;
}
```

- [ ] **Step 5: Wire admin into composition root**

In `backend/src/index.ts`, add imports:

```typescript
import { AdminService } from "./services/admin.service";
import { createAdminRoutes } from "./routes/admin.route";
import { createAdminMiddleware } from "./middlewares/admin.middleware";
```

Add instantiations after other services:

```typescript
	const adminService = new AdminService(prisma);
	const adminMiddleware = createAdminMiddleware(prisma);
```

Register admin routes (auth + admin middleware, not workspace-scoped):

```typescript
	const adminScoped = new Hono();
	adminScoped.use("*", adminMiddleware);
	adminScoped.route("/", createAdminRoutes(adminService));
	app.route("/api/admin", adminScoped);
```

- [ ] **Step 6: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/middlewares/admin.middleware.ts \
        backend/src/interfaces/services/admin.service.interface.ts \
        backend/src/services/admin.service.ts \
        backend/src/routes/admin.route.ts \
        backend/src/index.ts
git commit -m "feat: add admin panel with user management, taxonomy CRUD, and audit logs"
```

---

## Task 6: Frontend — Learning Center Page

**Files:**
- Modify: `frontend/src/pages/LearningPage.tsx`

- [ ] **Step 1: Replace LearningPage with recommendation-driven content**

Replace `frontend/src/pages/LearningPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";

interface RecommendationProfile {
	preferredFrameworks?: { name: string; count: number }[];
	preferredHooks?: { name: string; count: number }[];
	preferredTones?: { name: string; count: number }[];
	preferredPlatforms?: { name: string; count: number }[];
	commonEditPatterns?: { name: string; count: number }[];
	sampleSize: number;
}

export function LearningPage() {
	const { activeWorkspace } = useWorkspace();
	const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
	const [selectedBrandId, setSelectedBrandId] = useState("");
	const [profile, setProfile] = useState<RecommendationProfile | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!activeWorkspace) return;
		api<{ id: string; name: string }[]>(`/api/workspaces/${activeWorkspace.id}/brands`).then(setBrands);
	}, [activeWorkspace]);

	useEffect(() => {
		if (!selectedBrandId || !activeWorkspace) return;
		setLoading(true);
		api<RecommendationProfile>(`/api/workspaces/${activeWorkspace.id}/recommendations/brand/${selectedBrandId}`)
			.then(setProfile)
			.catch(() => setProfile(null))
			.finally(() => setLoading(false));
	}, [selectedBrandId, activeWorkspace]);

	const renderInsightCards = (title: string, items?: { name: string; count: number }[]) => {
		if (!items || items.length === 0) return null;
		const maxCount = Math.max(...items.map((i) => i.count));

		return (
			<div className="bg-white border border-gray-200 rounded-lg p-4">
				<h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>
				<div className="space-y-2">
					{items.map((item) => (
						<div key={item.name} className="flex items-center gap-3">
							<span className="text-sm w-32 truncate">{item.name}</span>
							<div className="flex-1 bg-gray-100 rounded-full h-2">
								<div
									className="bg-blue-500 h-2 rounded-full"
									style={{ width: `${(item.count / maxCount) * 100}%` }}
								/>
							</div>
							<span className="text-xs text-gray-400 w-8 text-right">{item.count}</span>
						</div>
					))}
				</div>
			</div>
		);
	};

	return (
		<div className="p-6 space-y-6">
			<h1 className="text-xl font-semibold">Learning Center</h1>

			<Select
				label="Select Brand"
				value={selectedBrandId}
				onChange={(e) => setSelectedBrandId(e.target.value)}
				options={[
					{ value: "", label: "-- Choose a brand --" },
					...brands.map((b) => ({ value: b.id, label: b.name })),
				]}
			/>

			{loading && <Spinner size="md" />}

			{profile && !loading && (
				<div className="space-y-4">
					<div className="bg-gray-50 rounded-lg p-3">
						<p className="text-xs text-gray-500">
							Based on <span className="font-medium text-gray-700">{profile.sampleSize}</span> approved outputs
						</p>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						{renderInsightCards("Top Frameworks", profile.preferredFrameworks)}
						{renderInsightCards("Top Hook Types", profile.preferredHooks)}
						{renderInsightCards("Top Platforms", profile.preferredPlatforms)}
						{renderInsightCards("Common Edit Patterns", profile.commonEditPatterns)}
					</div>
				</div>
			)}

			{!profile && selectedBrandId && !loading && (
				<p className="text-sm text-gray-400">No recommendation data yet. Approve more content to build insights.</p>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Build frontend**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/LearningPage.tsx
git commit -m "feat: redesign Learning Center with brand recommendation insights"
```

---

## Task 7: Frontend — Admin Page with User Management and Taxonomy CRUD

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Replace AdminPage with full admin panel**

Replace `frontend/src/pages/AdminPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Tabs } from "../components/ui/Tabs";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Toast } from "../components/ui/Toast";

interface AdminUser {
	id: string;
	email: string;
	fullName: string | null;
	status: string;
	isSuperadmin: boolean;
	createdAt: string;
}

interface TaxonomyItem {
	id: string;
	name: string;
	description: string | null;
	isGlobal: boolean;
}

const TAXONOMY_TABS = [
	{ label: "Users", value: "users" },
	{ label: "Frameworks", value: "frameworks" },
	{ label: "Hook Types", value: "hook-types" },
	{ label: "Tone Presets", value: "tone-presets" },
	{ label: "Visual Styles", value: "visual-styles" },
	{ label: "Audit Logs", value: "audit-logs" },
];

export function AdminPage() {
	const { user } = useAuth();
	const [activeTab, setActiveTab] = useState("users");
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [taxonomyItems, setTaxonomyItems] = useState<TaxonomyItem[]>([]);
	const [auditLogs, setAuditLogs] = useState<any[]>([]);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [newItemName, setNewItemName] = useState("");
	const [newItemDesc, setNewItemDesc] = useState("");
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	if (!user?.isSuperadmin) {
		return <div className="p-6 text-red-600">Access denied. Superadmin only.</div>;
	}

	useEffect(() => {
		if (activeTab === "users") {
			api<AdminUser[]>("/api/admin/users").then(setUsers).catch(() => setUsers([]));
		} else if (activeTab === "audit-logs") {
			api<any[]>("/api/admin/audit-logs").then(setAuditLogs).catch(() => setAuditLogs([]));
		} else {
			api<TaxonomyItem[]>(`/api/admin/taxonomy/${activeTab}`)
				.then(setTaxonomyItems)
				.catch(() => setTaxonomyItems([]));
		}
	}, [activeTab]);

	const refreshTaxonomy = () => {
		api<TaxonomyItem[]>(`/api/admin/taxonomy/${activeTab}`)
			.then(setTaxonomyItems)
			.catch(() => setTaxonomyItems([]));
	};

	const handleCreateItem = async () => {
		try {
			await api(`/api/admin/taxonomy/${activeTab}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newItemName, description: newItemDesc || null }),
			});
			setShowCreateModal(false);
			setNewItemName("");
			setNewItemDesc("");
			refreshTaxonomy();
			setToast({ message: "Item created", type: "success" });
		} catch {
			setToast({ message: "Failed to create item", type: "error" });
		}
	};

	const handleDeleteItem = async (id: string) => {
		try {
			await api(`/api/admin/taxonomy/${activeTab}/${id}`, { method: "DELETE" });
			refreshTaxonomy();
			setToast({ message: "Item deleted", type: "success" });
		} catch {
			setToast({ message: "Failed to delete item", type: "error" });
		}
	};

	return (
		<div className="p-6 space-y-6">
			<h1 className="text-xl font-semibold">Admin Panel</h1>

			<Tabs tabs={TAXONOMY_TABS} activeTab={activeTab} onTabChange={setActiveTab} />

			{activeTab === "users" && (
				<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Email</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Admin</th>
							</tr>
						</thead>
						<tbody>
							{users.map((u) => (
								<tr key={u.id} className="border-t border-gray-100">
									<td className="px-4 py-2">{u.email}</td>
									<td className="px-4 py-2">{u.fullName || "-"}</td>
									<td className="px-4 py-2">
										<Badge variant={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
									</td>
									<td className="px-4 py-2">{u.isSuperadmin ? "Yes" : "No"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{activeTab === "audit-logs" && (
				<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">User</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Action</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Entity</th>
							</tr>
						</thead>
						<tbody>
							{auditLogs.map((log) => (
								<tr key={log.id} className="border-t border-gray-100">
									<td className="px-4 py-2 text-xs">{new Date(log.createdAt).toLocaleString()}</td>
									<td className="px-4 py-2">{log.user?.email || "-"}</td>
									<td className="px-4 py-2">{log.action}</td>
									<td className="px-4 py-2">{log.entityType}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{!["users", "audit-logs"].includes(activeTab) && (
				<div>
					<div className="flex justify-end mb-3">
						<Button size="sm" onClick={() => setShowCreateModal(true)}>
							Add New
						</Button>
					</div>
					<div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
						<table className="w-full text-sm">
							<thead className="bg-gray-50">
								<tr>
									<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
									<th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Description</th>
									<th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
								</tr>
							</thead>
							<tbody>
								{taxonomyItems.map((item) => (
									<tr key={item.id} className="border-t border-gray-100">
										<td className="px-4 py-2 font-medium">{item.name}</td>
										<td className="px-4 py-2 text-gray-500">{item.description || "-"}</td>
										<td className="px-4 py-2 text-right">
											<button
												onClick={() => handleDeleteItem(item.id)}
												className="text-xs text-red-500 hover:text-red-700"
											>
												Delete
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{showCreateModal && (
				<Modal title="Add Taxonomy Item" onClose={() => setShowCreateModal(false)}>
					<div className="space-y-4">
						<Input label="Name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} />
						<Input label="Description" value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} />
						<Button onClick={handleCreateItem} disabled={!newItemName.trim()}>
							Create
						</Button>
					</div>
				</Modal>
			)}

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 2: Build frontend**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat: implement admin panel with user management, taxonomy CRUD, audit logs"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run frontend build**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds
