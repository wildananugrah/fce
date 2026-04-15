# Auto-fill Language Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user choose Bahasa Indonesia or English as the output language for brand and product Auto-fill, with a sticky per-user profile default plus a per-click override toggle on both forms.

**Architecture:** Add a `defaultScrapeLanguage` column to the `User` table (default `"indonesian"`). Extend the auth `/me` and `PATCH /profile` endpoints to read/write it. Surface it in `AuthContext` on the frontend. Add a persistent select on the Settings page and add small `ID / EN` segmented toggles next to the existing Auto-fill buttons in `NewBrandBrainDrawer` and `ProductForm`; the toggle initializes from the profile value and its current value is sent as `language` in the `scrape-preview` POST body. The backend `scrape-preview` routes already accept and forward `language` — no backend route changes required beyond profile.

**Tech Stack:** Prisma 7, Bun test runner, Hono, React 19, Vite 8, Tailwind CSS 4, TypeScript.

---

## File Structure

**Backend — modify:**
- `backend/prisma/schema.prisma` — add column to `User` model
- `backend/src/types/auth.types.ts` — extend `AuthResponse.user`
- `backend/src/interfaces/repositories/user.repository.interface.ts` — widen `update()` `Pick`
- `backend/tests/helpers/mock-user.repository.ts` — seed field on create, allow in update
- `backend/src/services/auth.service.ts` — include field in `signup`, `login`, `me`; validate and persist in `updateProfile`
- `backend/src/interfaces/services/auth.service.interface.ts` — widen `updateProfile` signature
- `backend/src/routes/auth.route.ts` — forward `defaultScrapeLanguage` from `PATCH /profile` body

**Backend — create:**
- (none — tests go in existing `backend/tests/services/auth.service.test.ts`)

**Frontend — modify:**
- `frontend/src/types/index.ts` — extend `User` type
- `frontend/src/contexts/AuthContext.tsx` — expose a `refreshUser` helper so Settings can update the cached user
- `frontend/src/hooks/useAuth.ts` — re-export `refreshUser` (only if the hook already whitelists keys; otherwise no change)
- `frontend/src/pages/SettingsPage.tsx` — add language select
- `frontend/src/components/brands/NewBrandBrainDrawer.tsx` — add toggle, send language
- `frontend/src/components/products/ProductForm.tsx` — add toggle, send language

**Frontend — create:**
- `frontend/src/components/ui/ScrapeLanguageToggle.tsx` — small reusable ID/EN segmented toggle

---

## Task 1: Prisma schema — add `defaultScrapeLanguage` to User

**Files:**
- Modify: `backend/prisma/schema.prisma` (User model, lines 11–29)

- [ ] **Step 1: Add the column to the schema**

Edit `backend/prisma/schema.prisma`, in the `User` model block. Add the new field right below `status`:

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  fullName     String?  @map("full_name")
  avatarUrl    String?  @map("avatar_url")
  isSuperadmin Boolean  @default(false) @map("is_superadmin")
  status       String   @default("active")
  defaultScrapeLanguage String @default("indonesian") @map("default_scrape_language")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  workspaceRoles    UserWorkspaceRole[]
  invitations       WorkspaceInvitation[]
  auditLogs         AuditLog[]
  createdWorkspaces Workspace[]           @relation("WorkspaceCreator")
  researchRuns      ResearchRun[]

  @@map("users")
}
```

- [ ] **Step 2: Push schema and regenerate the Prisma client**

Run from `backend/`:

```bash
bunx prisma db push
bunx prisma generate
```

Expected: `db push` prints "Your database is now in sync with your Prisma schema." and `generate` prints "Generated Prisma Client".

- [ ] **Step 3: Type-check the backend**

Run from `backend/`:

```bash
bunx tsc --noEmit
```

Expected: no errors (or only the same errors that existed on `main` before this task — you'll see `defaultScrapeLanguage` missing from a few spots which later tasks fix).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): add User.defaultScrapeLanguage column"
```

---

## Task 2: Update mock user repository to match new schema

**Files:**
- Modify: `backend/tests/helpers/mock-user.repository.ts`
- Modify: `backend/src/interfaces/repositories/user.repository.interface.ts`

- [ ] **Step 1: Widen the repository interface**

Edit `backend/src/interfaces/repositories/user.repository.interface.ts`. Find the `update` method signature and add `defaultScrapeLanguage` to the `Pick`:

```ts
update(
  id: string,
  data: Partial<Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage">>,
): Promise<User>;
```

- [ ] **Step 2: Update the mock repository**

Edit `backend/tests/helpers/mock-user.repository.ts`. In `create()`, initialize `defaultScrapeLanguage`. In `update()`, widen the `Pick` to match the interface. Final file:

```ts
import type { User } from "@prisma/client";
import type { IUserRepository } from "../../src/interfaces/repositories/user.repository.interface";

export class MockUserRepository implements IUserRepository {
	private users: User[] = [];

	async findById(id: string): Promise<User | null> {
		return this.users.find((u) => u.id === id) ?? null;
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.users.find((u) => u.email === email) ?? null;
	}

	async create(data: { email: string; passwordHash: string; fullName?: string }): Promise<User> {
		const user: User = {
			id: crypto.randomUUID(),
			email: data.email,
			passwordHash: data.passwordHash,
			fullName: data.fullName ?? null,
			avatarUrl: null,
			isSuperadmin: false,
			status: "active",
			defaultScrapeLanguage: "indonesian",
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.users.push(user);
		return user;
	}

	async update(
		id: string,
		data: Partial<Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage">>,
	): Promise<User> {
		const index = this.users.findIndex((u) => u.id === id);
		if (index === -1) throw new Error("User not found");
		this.users[index] = { ...this.users[index], ...data, updatedAt: new Date() };
		return this.users[index];
	}

	clear(): void {
		this.users = [];
	}
}
```

- [ ] **Step 3: Run the existing auth test to confirm nothing broke**

Run from `backend/`:

```bash
bun test tests/services/auth.service.test.ts
```

Expected: all previously-passing tests still pass (the service doesn't yet touch the new field so behavior is unchanged).

- [ ] **Step 4: Commit**

```bash
git add backend/src/interfaces/repositories/user.repository.interface.ts backend/tests/helpers/mock-user.repository.ts
git commit -m "test: add defaultScrapeLanguage to user repository interface and mock"
```

---

## Task 3: Extend `AuthResponse.user` type

**Files:**
- Modify: `backend/src/types/auth.types.ts`

- [ ] **Step 1: Add the field to the response type**

Edit `backend/src/types/auth.types.ts`:

```ts
export interface SignupInput {
	email: string;
	password: string;
	fullName?: string;
}

export interface LoginInput {
	email: string;
	password: string;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface AuthResponse {
	user: {
		id: string;
		email: string;
		fullName: string | null;
		avatarUrl: string | null;
		isSuperadmin: boolean;
		defaultScrapeLanguage: "indonesian" | "english";
	};
	accessToken: string;
}
```

- [ ] **Step 2: Type-check**

Run from `backend/`:

```bash
bunx tsc --noEmit
```

Expected: errors in `backend/src/services/auth.service.ts` because `signup`, `login`, and `me` now need to include `defaultScrapeLanguage` in the returned user object. Task 4 fixes them.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/auth.types.ts
git commit -m "feat(types): add defaultScrapeLanguage to AuthResponse.user"
```

---

## Task 4: Test — `updateProfile` persists and validates `defaultScrapeLanguage`

**Files:**
- Modify: `backend/tests/services/auth.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` block to the bottom of `backend/tests/services/auth.service.test.ts`, inside the top-level `describe("AuthService", ...)` (just before its closing `});`):

```ts
	describe("updateProfile — defaultScrapeLanguage", () => {
		it("defaults new users to 'indonesian'", async () => {
			await authService.signup({ email: "lang@example.com", password: "password123" });
			const signupUser = await userRepo.findByEmail("lang@example.com");
			expect(signupUser?.defaultScrapeLanguage).toBe("indonesian");
		});

		it("returns defaultScrapeLanguage from me()", async () => {
			const signup = await authService.signup({
				email: "me-lang@example.com",
				password: "password123",
			});
			const me = await authService.me(signup.user.id);
			expect(me.defaultScrapeLanguage).toBe("indonesian");
		});

		it("persists a valid language update", async () => {
			const signup = await authService.signup({
				email: "update-lang@example.com",
				password: "password123",
			});
			const updated = await authService.updateProfile(signup.user.id, {
				defaultScrapeLanguage: "english",
			});
			expect(updated.defaultScrapeLanguage).toBe("english");
		});

		it("rejects an invalid language value", async () => {
			const signup = await authService.signup({
				email: "bad-lang@example.com",
				password: "password123",
			});
			await expect(
				authService.updateProfile(signup.user.id, {
					defaultScrapeLanguage: "french" as any,
				}),
			).rejects.toThrow("Invalid defaultScrapeLanguage");
		});

		it("leaves defaultScrapeLanguage unchanged when other fields are updated", async () => {
			const signup = await authService.signup({
				email: "keep-lang@example.com",
				password: "password123",
			});
			await authService.updateProfile(signup.user.id, { defaultScrapeLanguage: "english" });
			await authService.updateProfile(signup.user.id, { fullName: "New Name" });
			const me = await authService.me(signup.user.id);
			expect(me.defaultScrapeLanguage).toBe("english");
			expect(me.fullName).toBe("New Name");
		});
	});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:

```bash
bun test tests/services/auth.service.test.ts
```

Expected: the five new tests fail. Likely errors: `me()` and `updateProfile()` don't return `defaultScrapeLanguage`, `updateProfile()` doesn't accept `defaultScrapeLanguage`, and there's no validation.

(Don't commit yet — implementation follows in Task 5.)

---

## Task 5: Implement `defaultScrapeLanguage` in `AuthService`

**Files:**
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/interfaces/services/auth.service.interface.ts`

- [ ] **Step 1: Widen the service interface**

Edit `backend/src/interfaces/services/auth.service.interface.ts`. Update `updateProfile`:

```ts
import type { AuthResponse, LoginInput, SignupInput } from "../../types/auth.types";

export interface IAuthService {
	signup(input: SignupInput): Promise<AuthResponse>;
	login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }>;
	refresh(refreshToken: string): Promise<{ accessToken: string }>;
	me(userId: string): Promise<AuthResponse["user"]>;
	updateProfile(
		userId: string,
		data: {
			fullName?: string;
			avatarUrl?: string;
			defaultScrapeLanguage?: "indonesian" | "english";
		},
	): Promise<AuthResponse["user"]>;
}
```

- [ ] **Step 2: Update `AuthService` to return and persist the field**

Edit `backend/src/services/auth.service.ts`. Make the following changes:

1. Add a validation constant near the top of the file (after imports):

```ts
const ALLOWED_SCRAPE_LANGUAGES = ["indonesian", "english"] as const;
type ScrapeLanguage = (typeof ALLOWED_SCRAPE_LANGUAGES)[number];
```

2. Inside `signup()`, find the `return { user: { ... }, accessToken }` shape (around line 45) and add `defaultScrapeLanguage` to the returned user:

```ts
return {
	user: {
		id: user.id,
		email: user.email,
		fullName: user.fullName,
		avatarUrl: user.avatarUrl,
		isSuperadmin: user.isSuperadmin,
		defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
	},
	accessToken,
};
```

3. Inside `login()`, apply the same addition to the returned user object (around line 80).

4. Replace the `me()` method body so it returns the new field:

```ts
async me(userId: string): Promise<AuthResponse["user"]> {
	const user = await this.userRepository.findById(userId);
	if (!user) {
		throw new Error("User not found");
	}

	return {
		id: user.id,
		email: user.email,
		fullName: user.fullName,
		avatarUrl: user.avatarUrl,
		isSuperadmin: user.isSuperadmin,
		defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
	};
}
```

5. Replace `updateProfile()` so it validates and persists the new field:

```ts
async updateProfile(
	userId: string,
	data: {
		fullName?: string;
		avatarUrl?: string;
		defaultScrapeLanguage?: "indonesian" | "english";
	},
): Promise<AuthResponse["user"]> {
	if (
		data.defaultScrapeLanguage !== undefined &&
		!ALLOWED_SCRAPE_LANGUAGES.includes(data.defaultScrapeLanguage as ScrapeLanguage)
	) {
		throw new Error(
			`Invalid defaultScrapeLanguage: ${data.defaultScrapeLanguage}. Allowed: ${ALLOWED_SCRAPE_LANGUAGES.join(", ")}`,
		);
	}

	const user = await this.userRepository.update(userId, data);
	return {
		id: user.id,
		email: user.email,
		fullName: user.fullName,
		avatarUrl: user.avatarUrl,
		isSuperadmin: user.isSuperadmin,
		defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
	};
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `backend/`:

```bash
bun test tests/services/auth.service.test.ts
```

Expected: all tests pass (original tests plus the five new ones).

- [ ] **Step 4: Type-check**

Run from `backend/`:

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth.service.ts backend/src/interfaces/services/auth.service.interface.ts backend/tests/services/auth.service.test.ts
git commit -m "feat(auth): persist and validate User.defaultScrapeLanguage"
```

---

## Task 6: Route — forward `defaultScrapeLanguage` from `PATCH /auth/profile`

**Files:**
- Modify: `backend/src/routes/auth.route.ts`

- [ ] **Step 1: Add the field to the PATCH handler**

Edit `backend/src/routes/auth.route.ts`. Replace the `PATCH /profile` handler (lines 66–74):

```ts
app.patch("/profile", async (c) => {
	const userId = c.get("userId" as any);
	const body = await c.req.json();
	try {
		const user = await authService.updateProfile(userId, {
			fullName: body.fullName,
			avatarUrl: body.avatarUrl,
			defaultScrapeLanguage: body.defaultScrapeLanguage,
		});
		return c.json({ data: user });
	} catch (e) {
		const message = e instanceof Error ? e.message : "Failed to update profile";
		if (message.startsWith("Invalid defaultScrapeLanguage")) {
			return c.json({ error: message }, 400);
		}
		throw e;
	}
});
```

- [ ] **Step 2: Type-check**

Run from `backend/`:

```bash
bunx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Manual smoke test (optional, but encouraged)**

Start the backend (`bun run --hot src/index.ts`), then using an authenticated session send:

```bash
curl -X PATCH http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"defaultScrapeLanguage":"english"}'
```

Expected: `200` with `data.defaultScrapeLanguage === "english"`. Sending `"french"` returns `400` with the validation error.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.route.ts
git commit -m "feat(api): accept defaultScrapeLanguage in PATCH /auth/profile"
```

---

## Task 7: Frontend — extend `User` type and `AuthContext`

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Extend the `User` type**

Edit `frontend/src/types/index.ts`. Replace the `User` interface:

```ts
export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isSuperadmin: boolean;
  defaultScrapeLanguage: "indonesian" | "english";
}
```

- [ ] **Step 2: Expose a `refreshUser` method from `AuthContext`**

Edit `frontend/src/contexts/AuthContext.tsx`. The full updated file:

```tsx
import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, setAccessToken } from "../services/api";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const refreshRes = await fetch(
          `${import.meta.env.VITE_API_URL || ""}/api/auth/refresh`,
          { method: "POST", credentials: "include" },
        );
        if (refreshRes.ok) {
          const json = await refreshRes.json();
          setAccessToken(json.data.accessToken);
          const userData = await api<User>("/api/auth/me");
          setUser(userData);
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User; accessToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signup = useCallback(async (email: string, password: string, fullName?: string) => {
    const result = await api<{ user: User; accessToken: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const userData = await api<User>("/api/auth/me");
    setUser(userData);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 3: Type-check**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/contexts/AuthContext.tsx
git commit -m "feat(frontend): expose defaultScrapeLanguage and refreshUser from AuthContext"
```

---

## Task 8: Create the `ScrapeLanguageToggle` component

**Files:**
- Create: `frontend/src/components/ui/ScrapeLanguageToggle.tsx`

- [ ] **Step 1: Create the component**

Write the file at `frontend/src/components/ui/ScrapeLanguageToggle.tsx`:

```tsx
export type ScrapeLanguage = "indonesian" | "english";

interface ScrapeLanguageToggleProps {
  value: ScrapeLanguage;
  onChange: (value: ScrapeLanguage) => void;
  disabled?: boolean;
}

const OPTIONS: { value: ScrapeLanguage; label: string }[] = [
  { value: "indonesian", label: "ID" },
  { value: "english", label: "EN" },
];

export function ScrapeLanguageToggle({ value, onChange, disabled }: ScrapeLanguageToggleProps) {
  return (
    <div
      role="group"
      aria-label="Auto-fill output language"
      className="inline-flex rounded-md border border-gray-300 overflow-hidden"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`px-2.5 py-2 text-xs font-medium transition-colors ${
              active
                ? "bg-black text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run from `frontend/`:

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ScrapeLanguageToggle.tsx
git commit -m "feat(ui): add ScrapeLanguageToggle component"
```

---

## Task 9: Settings page — add language select

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add the select and wire it to the profile API**

Replace the full contents of `frontend/src/pages/SettingsPage.tsx`:

```tsx
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Toast } from "../components/ui/Toast";
import { TokenUsageSection } from "../components/token-usage/TokenUsageSection";
import type { ScrapeLanguage } from "../components/ui/ScrapeLanguageToggle";

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [defaultScrapeLanguage, setDefaultScrapeLanguage] = useState<ScrapeLanguage>(
    user?.defaultScrapeLanguage ?? "indonesian",
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, avatarUrl, defaultScrapeLanguage }),
      });
      await refreshUser();
      setToast({ message: "Profile updated successfully", type: "success" });
    } catch {
      setToast({ message: "Failed to update profile", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Profile Settings</h1>

      <div className="space-y-4 max-w-lg">
        <Input label="Email" value={user?.email || ""} disabled />
        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your full name"
        />
        <Input
          label="Avatar URL"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://example.com/avatar.png"
        />
        <Select
          label="Default auto-fill language"
          value={defaultScrapeLanguage}
          onChange={(e) => setDefaultScrapeLanguage(e.target.value as ScrapeLanguage)}
        >
          <option value="indonesian">Bahasa Indonesia</option>
          <option value="english">English</option>
        </Select>
        <p className="text-xs text-gray-500 -mt-2">
          Controls the language used when auto-filling brand and product forms from a URL. You can
          still override this per click using the toggle next to each Auto-fill button.
        </p>

        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>

      {activeWorkspace && (
        <div className="mt-8 pt-8 border-t border-gray-200">
          <TokenUsageSection
            workspaceId={activeWorkspace.id}
            scope="user"
            title="Your Token Usage"
            description={`Tokens consumed by your generations in ${activeWorkspace.name}.`}
          />
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run from `frontend/`:

```bash
npm run typecheck
npm run lint
```

Expected: zero errors.

- [ ] **Step 3: Manual verification**

Start both backend and frontend dev servers:

```bash
# terminal 1
cd backend && bun run --hot src/index.ts
# terminal 2
cd frontend && npm run dev
```

1. Log in, open Settings, pick "English", click Save — expect success toast.
2. Reload the page — the select should still show "English".
3. Pick "Bahasa Indonesia", save, reload — should show Indonesian.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat(settings): add default auto-fill language select"
```

---

## Task 10: Wire language toggle into `NewBrandBrainDrawer`

**Files:**
- Modify: `frontend/src/components/brands/NewBrandBrainDrawer.tsx`

- [ ] **Step 1: Import the toggle and auth hook**

Edit `frontend/src/components/brands/NewBrandBrainDrawer.tsx`. At the top of the file, add these imports alongside the existing ones:

```tsx
import { useAuth } from "../../hooks/useAuth";
import { ScrapeLanguageToggle, type ScrapeLanguage } from "../ui/ScrapeLanguageToggle";
```

- [ ] **Step 2: Add component state for the language**

Inside the `NewBrandBrainDrawer` component body, near the other `useState` calls (somewhere around line 70–80, alongside `const [scraping, setScraping] = useState(false)`), add:

```tsx
const { user } = useAuth();
const [scrapeLanguage, setScrapeLanguage] = useState<ScrapeLanguage>(
  user?.defaultScrapeLanguage ?? "indonesian",
);
```

Also add a `useEffect` just below it to keep the local state in sync when the user profile loads after the component mounts:

```tsx
useEffect(() => {
  if (user?.defaultScrapeLanguage) {
    setScrapeLanguage(user.defaultScrapeLanguage);
  }
}, [user?.defaultScrapeLanguage]);
```

- [ ] **Step 3: Send the language in the scrape-preview POST body**

Find `handleAutoFill` (line ~384) and update the POST body on line ~405:

```tsx
body: JSON.stringify({ url: form.websiteUrl.trim(), language: scrapeLanguage }),
```

- [ ] **Step 4: Render the toggle next to the Auto-fill button**

Find the JSX block at lines ~573–589 (the `<div className="flex gap-2">` wrapping the URL input and Auto-fill button). Replace it with:

```tsx
<div className="flex gap-2 items-stretch">
  <input
    value={form.websiteUrl}
    onChange={(e) => update("websiteUrl", e.target.value)}
    placeholder="https://brand.com"
    className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
  />
  <ScrapeLanguageToggle
    value={scrapeLanguage}
    onChange={setScrapeLanguage}
    disabled={scraping}
  />
  <Button
    variant="secondary"
    onClick={handleAutoFill}
    loading={scraping}
    disabled={!form.websiteUrl.trim()}
  >
    <Sparkles size={14} className="mr-1.5" />
    Auto-fill from Website
  </Button>
</div>
```

- [ ] **Step 5: Type-check and lint**

Run from `frontend/`:

```bash
npm run typecheck
npm run lint
```

Expected: zero errors.

- [ ] **Step 6: Manual verification**

With both servers running:

1. Open "New Brand Brain" drawer. The toggle should match the user's profile default (e.g. "ID" if Indonesian).
2. Enter a real English-language brand URL, flip toggle to "EN", click Auto-fill.
3. Confirm the populated fields (Summary, Personality, Tone, Audience) are in English.
4. Flip to "ID", click Auto-fill again — populated fields should be in Bahasa Indonesia.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/brands/NewBrandBrainDrawer.tsx
git commit -m "feat(brand): add auto-fill language toggle to New Brand Brain drawer"
```

---

## Task 11: Wire language toggle into `ProductForm`

**Files:**
- Modify: `frontend/src/components/products/ProductForm.tsx`

- [ ] **Step 1: Import the toggle and auth hook**

Edit `frontend/src/components/products/ProductForm.tsx`. At the top, add:

```tsx
import { useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ScrapeLanguageToggle, type ScrapeLanguage } from "../ui/ScrapeLanguageToggle";
```

(If `useEffect` is already imported from `"react"` on line 1, merge it into the existing import instead of adding a duplicate line.)

- [ ] **Step 2: Add component state**

Inside the `ProductForm` component body, alongside `const [productUrl, setProductUrl] = useState("")` (around line 60), add:

```tsx
const { user } = useAuth();
const [scrapeLanguage, setScrapeLanguage] = useState<ScrapeLanguage>(
  user?.defaultScrapeLanguage ?? "indonesian",
);

useEffect(() => {
  if (user?.defaultScrapeLanguage) {
    setScrapeLanguage(user.defaultScrapeLanguage);
  }
}, [user?.defaultScrapeLanguage]);
```

- [ ] **Step 3: Send the language in the POST body**

Find `handleAutoFill` and update the body on line ~89:

```tsx
body: JSON.stringify({ url: productUrl.trim(), language: scrapeLanguage }),
```

- [ ] **Step 4: Render the toggle next to the Auto-fill button**

Find the JSX block at lines ~259–279 (the `<div className="flex gap-2">` wrapping the product URL input and Auto-fill button). Replace it with:

```tsx
<div className="flex gap-2 items-stretch">
  <input
    value={productUrl}
    onChange={(e) => setProductUrl(e.target.value)}
    placeholder="https://example.com/product"
    className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
  />
  <ScrapeLanguageToggle
    value={scrapeLanguage}
    onChange={setScrapeLanguage}
    disabled={scraping}
  />
  <button
    type="button"
    onClick={handleAutoFill}
    disabled={scraping || !productUrl.trim()}
    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
  >
    {scraping ? (
      <Loader2 size={14} className="animate-spin" />
    ) : (
      <Sparkles size={14} />
    )}
    {scraping ? "Analyzing..." : "Auto-fill from URL"}
  </button>
</div>
```

- [ ] **Step 5: Type-check and lint**

Run from `frontend/`:

```bash
npm run typecheck
npm run lint
```

Expected: zero errors.

- [ ] **Step 6: Manual verification**

1. Open the "New Product" form. The toggle should match the profile default.
2. Paste a real English product page URL, flip toggle to "EN", click Auto-fill.
3. Confirm the populated fields (Summary, USP, RTB, Functional Benefits, Emotional Benefits, Target Audience) are in English.
4. Repeat with "ID" — fields should come back in Bahasa Indonesia.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/products/ProductForm.tsx
git commit -m "feat(product): add auto-fill language toggle to product form"
```

---

## Task 12: End-to-end regression check

**Files:** (none — verification only)

- [ ] **Step 1: Backend full test suite**

Run from `backend/`:

```bash
bun test
bunx biome check --write .
bunx tsc --noEmit
```

Expected: all tests pass; Biome reports no issues (or only formats files); `tsc` prints no errors.

- [ ] **Step 2: Frontend checks**

Run from `frontend/`:

```bash
npm run typecheck
npm run lint
npm run build
```

Expected: all three succeed.

- [ ] **Step 3: Manual smoke test matrix**

Run both dev servers. For each combination below, confirm the auto-filled content's language matches expectation:

| Profile default | Toggle on click | Expected output |
| --- | --- | --- |
| Indonesian | ID | Bahasa Indonesia |
| Indonesian | EN | English |
| English | EN | English |
| English | ID | Bahasa Indonesia |

Test on **both** the brand drawer and the product form.

- [ ] **Step 4: Final commit (if any formatting changes from biome)**

```bash
git status
# If there are staged formatting-only changes:
git add -u
git commit -m "chore: biome format pass"
```

---

## Out of scope

- Language options beyond Indonesian and English.
- Workspace-level default.
- Applying the language setting to content/topic/campaign generation.
- Localizing the FCE UI itself.
