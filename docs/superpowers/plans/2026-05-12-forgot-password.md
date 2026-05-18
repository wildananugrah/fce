# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service password reset to FCE — login page gets a "Forgot password?" link, user enters email, receives reset link, clicks it to set a new password, then logs in manually with new credentials.

**Architecture:** Mirrors the existing `EmailVerificationToken` pattern 1:1. New `PasswordResetToken` Prisma model, two new auth endpoints (`POST /forgot-password`, `POST /reset-password`), `IEmailProvider.sendPasswordReset` added to all three providers (Resend, SMTP, Noop), two new frontend pages (`ForgotPasswordPage`, `ResetPasswordPage`), and a "Forgot password?" link on `LoginPage`.

**Tech Stack:** Bun, Hono, Prisma 7, PostgreSQL, React 19, Tailwind CSS 4, `lucide-react` icons, `Bun.password` bcrypt hashing

---

## File Map

| Action | Path |
|---|---|
| **Modify** | `backend/prisma/schema.prisma` (add `PasswordResetToken` model + User relation) |
| **Modify** | `backend/src/utils/env.ts` (add `passwordResetTokenExpiry`) |
| **Create** | `backend/src/errors/password-reset-token-error.ts` |
| **Modify** | `backend/src/interfaces/providers/email.provider.interface.ts` (add `PasswordResetEmailInput` + `sendPasswordReset`) |
| **Modify** | `backend/src/providers/resend-email.provider.ts` (implement `sendPasswordReset`) |
| **Modify** | `backend/src/providers/smtp-email.provider.ts` (implement `sendPasswordReset`) |
| **Modify** | `backend/src/providers/noop-email.provider.ts` (implement `sendPasswordReset`) |
| **Modify** | `backend/src/interfaces/services/auth.service.interface.ts` (add new methods) |
| **Modify** | `backend/src/services/auth.service.ts` (add `requestPasswordReset` + `resetPassword`) |
| **Modify** | `backend/src/routes/auth.route.ts` (add two new routes) |
| **Modify** | `backend/src/index.ts` (wire new config) |
| **Modify** | `backend/.env.example` (document new env var) |
| **Create** | `frontend/src/pages/ForgotPasswordPage.tsx` |
| **Create** | `frontend/src/pages/ResetPasswordPage.tsx` |
| **Modify** | `frontend/src/pages/LoginPage.tsx` (add "Forgot password?" link + `?passwordReset=1` notice) |
| **Modify** | `frontend/src/App.tsx` (register two new routes) |

---

## Task 1: Add PasswordResetToken model to Prisma schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the model after `EmailVerificationToken`**

Find the existing `EmailVerificationToken` model (around line 850). Right after its closing brace, add:

```prisma
model PasswordResetToken {
  id         String    @id @default(uuid())
  userId     String    @map("user_id")
  // Opaque random token included in the reset URL. Unique so a lookup
  // by token is a single index hit.
  token      String    @unique
  expiresAt  DateTime  @map("expires_at")
  consumedAt DateTime? @map("consumed_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("password_reset_tokens")
}
```

- [ ] **Step 2: Add the relation to the User model**

Find the `User` model (around line 11). In the relations block (around line 48 where `verificationTokens EmailVerificationToken[]` lives), add the new relation right after it:

```prisma
  verificationTokens EmailVerificationToken[]
  passwordResetTokens PasswordResetToken[]
```

- [ ] **Step 3: Apply the schema change**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx prisma db push && bunx prisma generate
```

Expected: `Your database is now in sync with your Prisma schema.` and `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: add PasswordResetToken model and User relation"
```

---

## Task 2: Add `passwordResetTokenExpiry` env config

**Files:**
- Modify: `backend/src/utils/env.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add the env var to `env.ts`**

In `backend/src/utils/env.ts`, find the existing `emailVerificationTokenExpiry` line (around line 59) and add the new var right after it:

```typescript
	emailVerificationTokenExpiry: optionalEnv("EMAIL_VERIFICATION_TOKEN_EXPIRY", "24h"),
	// Expiry for password-reset tokens issued by /forgot-password. Accepts any
	// string parseable by parseDuration (e.g. "1h", "30m", "2d"). Default: 1 hour.
	passwordResetTokenExpiry: optionalEnv("PASSWORD_RESET_TOKEN_EXPIRY", "1h"),
```

- [ ] **Step 2: Document it in `.env.example`**

In `backend/.env.example`, find the `EMAIL_VERIFICATION_TOKEN_EXPIRY=24h` line and add right after it:

```
EMAIL_VERIFICATION_TOKEN_EXPIRY=24h

# Password reset link expiry. Same format as EMAIL_VERIFICATION_TOKEN_EXPIRY
# ("30s", "5m", "2h", "7d"). Default 1h.
PASSWORD_RESET_TOKEN_EXPIRY=1h
```

- [ ] **Step 3: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep "env.ts" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/utils/env.ts backend/.env.example
git commit -m "feat: add PASSWORD_RESET_TOKEN_EXPIRY env config"
```

---

## Task 3: Create the PasswordResetTokenError class

**Files:**
- Create: `backend/src/errors/password-reset-token-error.ts`

- [ ] **Step 1: Write the file**

Create `backend/src/errors/password-reset-token-error.ts`:

```typescript
/**
 * Thrown by AuthService.resetPassword when the supplied token is bad. The route
 * layer maps each `kind` to a 400 response with a human-friendly message.
 */
export type PasswordResetTokenErrorKind = "invalid" | "expired" | "consumed";

const MESSAGES: Record<PasswordResetTokenErrorKind, string> = {
	invalid: "Token is invalid",
	expired: "Token has expired",
	consumed: "Token has already been used",
};

export class PasswordResetTokenError extends Error {
	constructor(public kind: PasswordResetTokenErrorKind) {
		super(MESSAGES[kind]);
		this.name = "PasswordResetTokenError";
	}
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep "password-reset-token-error" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/errors/password-reset-token-error.ts
git commit -m "feat: add PasswordResetTokenError class"
```

---

## Task 4: Extend IEmailProvider with `sendPasswordReset`

**Files:**
- Modify: `backend/src/interfaces/providers/email.provider.interface.ts`

- [ ] **Step 1: Add `PasswordResetEmailInput` and the method signature**

Replace the entire content of `backend/src/interfaces/providers/email.provider.interface.ts` with:

```typescript
export interface InvitationEmailInput {
	to: string;
	workspaceName: string;
	inviterName: string;
	inviterEmail: string;
	role: string;
	acceptUrl: string;
	expiryHuman: string;
}

export interface VerificationEmailInput {
	to: string;
	fullName: string | null;
	verifyUrl: string;
	expiryHuman: string;
}

export interface PasswordResetEmailInput {
	to: string;
	fullName: string | null;
	resetUrl: string;
	expiryHuman: string;
}

export interface IEmailProvider {
	sendInvitation(input: InvitationEmailInput): Promise<void>;
	sendVerification(input: VerificationEmailInput): Promise<void>;
	sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | head -20
```

Expected: errors in `resend-email.provider.ts`, `smtp-email.provider.ts`, `noop-email.provider.ts` (they don't implement the new method yet — fixed in Tasks 5–7).

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/providers/email.provider.interface.ts
git commit -m "feat: add sendPasswordReset to IEmailProvider interface"
```

---

## Task 5: Implement `sendPasswordReset` in ResendEmailProvider

**Files:**
- Modify: `backend/src/providers/resend-email.provider.ts`

- [ ] **Step 1: Add imports and new method**

In `backend/src/providers/resend-email.provider.ts`:

1. Update the import block at the top (line 2–6) to include `PasswordResetEmailInput`:

```typescript
import type {
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

2. Update the `send` method's `context` parameter type. Find this signature near the bottom (around line 79):

```typescript
context: { kind: "invitation" | "verification"; to: string },
```

Replace with:

```typescript
context: { kind: "invitation" | "verification" | "password_reset"; to: string },
```

3. Add the new `sendPasswordReset` method right after `sendVerification` (around line 71, before the `send` private method):

```typescript
	async sendPasswordReset(input: PasswordResetEmailInput): Promise<void> {
		const greeting = input.fullName ? `Hi ${escapeHtml(input.fullName)},` : "Hi there,";
		const subject = "Reset your FCE Dashboard password";
		const html = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
				<h1 style="font-size: 20px; margin-bottom: 16px;">Reset your password</h1>
				<p>${greeting}</p>
				<p>We received a request to reset your FCE Dashboard password. Click the button below to set a new password.</p>
				<p style="margin: 24px 0;">
					<a href="${input.resetUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password</a>
				</p>
				<p style="color: #666; font-size: 13px;">This link expires in ${escapeHtml(input.expiryHuman)}. If the button doesn't work, paste this URL into your browser:</p>
				<p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${input.resetUrl}" style="color: #4f46e5;">${input.resetUrl}</a></p>
				<p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
			</div>
		`;

		await this.send(
			{
				from: this.from,
				to: input.to,
				subject,
				html,
			},
			{ kind: "password_reset", to: input.to },
		);
	}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep "resend-email" | head -5
```

Expected: no errors for `resend-email.provider.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/resend-email.provider.ts
git commit -m "feat: implement sendPasswordReset in ResendEmailProvider"
```

---

## Task 6: Implement `sendPasswordReset` in SmtpEmailProvider

**Files:**
- Modify: `backend/src/providers/smtp-email.provider.ts`

- [ ] **Step 1: Add imports and new method**

In `backend/src/providers/smtp-email.provider.ts`:

1. Update the import block at the top (lines 2–6) to include `PasswordResetEmailInput`:

```typescript
import type {
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";
```

2. Update the `send` method's `context` parameter type (around line 89):

```typescript
context: { kind: "invitation" | "verification" | "password_reset"; to: string },
```

3. Add the new `sendPasswordReset` method right after `sendVerification` (around line 85, before the `send` private method):

```typescript
	async sendPasswordReset(input: PasswordResetEmailInput): Promise<void> {
		const greeting = input.fullName ? `Hi ${escapeHtml(input.fullName)},` : "Hi there,";
		const subject = "Reset your FCE Dashboard password";
		const html = `
			<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #111;">
				<h1 style="font-size: 20px; margin-bottom: 16px;">Reset your password</h1>
				<p>${greeting}</p>
				<p>We received a request to reset your FCE Dashboard password. Click the button below to set a new password.</p>
				<p style="margin: 24px 0;">
					<a href="${input.resetUrl}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset password</a>
				</p>
				<p style="color: #666; font-size: 13px;">This link expires in ${escapeHtml(input.expiryHuman)}. If the button doesn't work, paste this URL into your browser:</p>
				<p style="color: #666; font-size: 12px; word-break: break-all;"><a href="${input.resetUrl}" style="color: #4f46e5;">${input.resetUrl}</a></p>
				<p style="color: #999; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
			</div>
		`;

		await this.send(
			{ to: input.to, subject, html },
			{ kind: "password_reset", to: input.to },
		);
	}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep "smtp-email" | head -5
```

Expected: no errors for `smtp-email.provider.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/smtp-email.provider.ts
git commit -m "feat: implement sendPasswordReset in SmtpEmailProvider"
```

---

## Task 7: Implement `sendPasswordReset` in NoopEmailProvider

**Files:**
- Modify: `backend/src/providers/noop-email.provider.ts`

- [ ] **Step 1: Add import and new method**

Replace the entire content of `backend/src/providers/noop-email.provider.ts` with:

```typescript
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	IEmailProvider,
	InvitationEmailInput,
	PasswordResetEmailInput,
	VerificationEmailInput,
} from "../interfaces/providers/email.provider.interface";

/**
 * Used when RESEND_API_KEY is not configured — logs the email details (and
 * the verification URL, since there's no email client to copy from in dev)
 * instead of sending. Never use in production.
 */
export class NoopEmailProvider implements IEmailProvider {
	constructor(private logger: ILogger) {}

	async sendInvitation(input: InvitationEmailInput): Promise<void> {
		this.logger.warn("Email provider not configured — invitation NOT sent (accept URL omitted from logs)", {
			to: input.to,
			workspaceName: input.workspaceName,
		});
	}

	async sendVerification(input: VerificationEmailInput): Promise<void> {
		// In dev the URL IS logged so the developer can finish their own signup
		// without configuring Resend. Do not mirror this behavior in prod.
		this.logger.warn("Email provider not configured — verification URL logged for dev use", {
			to: input.to,
			verifyUrl: input.verifyUrl,
			expiryHuman: input.expiryHuman,
		});
	}

	async sendPasswordReset(input: PasswordResetEmailInput): Promise<void> {
		// In dev the URL IS logged so the developer can test password reset
		// without configuring Resend. Do not mirror this behavior in prod.
		this.logger.warn("Email provider not configured — password reset URL logged for dev use", {
			to: input.to,
			resetUrl: input.resetUrl,
			expiryHuman: input.expiryHuman,
		});
	}
}
```

- [ ] **Step 2: Type check the whole backend**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -E "noop-email|email.provider" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/noop-email.provider.ts
git commit -m "feat: implement sendPasswordReset in NoopEmailProvider"
```

---

## Task 8: Add `requestPasswordReset` and `resetPassword` to AuthService

**Files:**
- Modify: `backend/src/interfaces/services/auth.service.interface.ts`
- Modify: `backend/src/services/auth.service.ts`

- [ ] **Step 1: Update the IAuthService interface**

Replace the content of `backend/src/interfaces/services/auth.service.interface.ts` with:

```typescript
import type {
	AuthResponse,
	LoginInput,
	SignupInput,
	SignupResult,
} from "../../types/auth.types";

export interface IAuthService {
	signup(input: SignupInput): Promise<SignupResult>;
	login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }>;
	refresh(refreshToken: string): Promise<{ accessToken: string; userId: string }>;
	me(userId: string): Promise<AuthResponse["user"]>;
	verifyEmail(token: string): Promise<{ email: string }>;
	resendVerification(email: string): Promise<{ sent: boolean }>;
	requestPasswordReset(email: string): Promise<{ sent: boolean }>;
	resetPassword(token: string, newPassword: string): Promise<{ email: string }>;
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

- [ ] **Step 2: Update the `AuthConfig` type in `auth.service.ts`**

In `backend/src/services/auth.service.ts`, find `interface AuthConfig` (around line 25) and add `passwordResetTokenExpiry`:

```typescript
interface AuthConfig {
	jwtSecret: string;
	jwtRefreshSecret: string;
	jwtExpiry: string;
	jwtRefreshExpiry: string;
	appUrl: string;
	emailVerificationTokenExpiry: string;
	passwordResetTokenExpiry: string;
	userDefaultMaxWorkspaces: number;
	userDefaultMaxProjects: number;
}
```

- [ ] **Step 3: Add the PasswordResetTokenError import**

Near the top of `backend/src/services/auth.service.ts`, add the import after the existing `EmailNotVerifiedError` import (line 3):

```typescript
import { EmailNotVerifiedError } from "../errors/email-not-verified-error";
import { PasswordResetTokenError } from "../errors/password-reset-token-error";
```

- [ ] **Step 4: Add `requestPasswordReset` and `resetPassword` methods**

In `backend/src/services/auth.service.ts`, add these two new methods inside the `AuthService` class, immediately after `resendVerification` (which ends around line 233) and before `updateProfile`:

```typescript
	async requestPasswordReset(email: string): Promise<{ sent: boolean }> {
		const normalized = email.trim().toLowerCase();
		const user = await this.userRepository.findByEmail(normalized);
		// Enumeration-resistant: return { sent: true } regardless of whether the
		// email exists. Actually send only when there's a real user.
		if (!user) {
			return { sent: true };
		}

		// Throttle: bail out if we issued a token for this user in the last minute.
		const recent = await this.prisma.passwordResetToken.findFirst({
			where: { userId: user.id, consumedAt: null },
			orderBy: { createdAt: "desc" },
		});
		if (recent && Date.now() - recent.createdAt.getTime() < MIN_RESEND_INTERVAL_MS) {
			return { sent: true };
		}

		await this.issuePasswordResetToken(user.id, user.email, user.fullName);
		return { sent: true };
	}

	async resetPassword(token: string, newPassword: string): Promise<{ email: string }> {
		if (!newPassword || newPassword.length < 8) {
			throw new Error("Password must be at least 8 characters");
		}

		const row = await this.prisma.passwordResetToken.findUnique({ where: { token } });
		if (!row) throw new PasswordResetTokenError("invalid");
		if (row.consumedAt) throw new PasswordResetTokenError("consumed");
		if (row.expiresAt.getTime() < Date.now()) throw new PasswordResetTokenError("expired");

		const user = await this.userRepository.findById(row.userId);
		if (!user) throw new PasswordResetTokenError("invalid");

		const passwordHash = await hashPassword(newPassword);

		await this.prisma.$transaction([
			this.prisma.user.update({
				where: { id: user.id },
				data: { passwordHash },
			}),
			this.prisma.passwordResetToken.update({
				where: { id: row.id },
				data: { consumedAt: new Date() },
			}),
		]);

		return { email: user.email };
	}
```

- [ ] **Step 5: Add the private `issuePasswordResetToken` helper**

In `backend/src/services/auth.service.ts`, find the existing private `issueVerificationToken` method (around line 265) at the end of the class. Add this new helper immediately after it:

```typescript
	private async issuePasswordResetToken(
		userId: string,
		email: string,
		fullName: string | null,
	): Promise<void> {
		// Invalidate any previous unconsumed tokens so only the latest link works.
		await this.prisma.passwordResetToken.deleteMany({
			where: { userId, consumedAt: null },
		});

		const token = crypto.randomBytes(32).toString("hex");
		const ttlMs = parseDuration(this.config.passwordResetTokenExpiry);
		const expiresAt = new Date(Date.now() + ttlMs);

		await this.prisma.passwordResetToken.create({
			data: { userId, token, expiresAt },
		});

		const resetUrl = `${this.config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
		const expiryHuman = humanizeDuration(this.config.passwordResetTokenExpiry);

		// Email failures are swallowed here so the API still returns { sent: true }
		// — the token exists in the DB and the user can re-request once delivery
		// is fixed. The provider has logged the underlying error with context.
		try {
			await this.emailProvider.sendPasswordReset({
				to: email,
				fullName,
				resetUrl,
				expiryHuman,
			});
		} catch {
			// Intentionally ignored — provider logged.
		}
	}
```

- [ ] **Step 6: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -E "auth.service|auth.service.interface" | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/interfaces/services/auth.service.interface.ts backend/src/services/auth.service.ts
git commit -m "feat: add requestPasswordReset and resetPassword to AuthService"
```

---

## Task 9: Add `/forgot-password` and `/reset-password` routes

**Files:**
- Modify: `backend/src/routes/auth.route.ts`

- [ ] **Step 1: Add the imports**

In `backend/src/routes/auth.route.ts`, update the imports at the top of the file (around lines 3–5) to add `PasswordResetTokenError`:

```typescript
import { EmailNotVerifiedError } from "../errors/email-not-verified-error";
import { PasswordResetTokenError } from "../errors/password-reset-token-error";
import { ValidationError } from "../errors/validation-error";
```

- [ ] **Step 2: Add the two new routes**

In `backend/src/routes/auth.route.ts`, add the two new routes immediately after the `app.post("/resend-verification", ...)` handler (around line 101) and before `app.post("/logout", ...)`:

```typescript
	app.post("/forgot-password", async (c) => {
		const body = await c.req.json();
		const { email } = body as { email?: string };
		if (!email || typeof email !== "string") {
			return c.json({ error: "email is required" }, 400);
		}
		const result = await authService.requestPasswordReset(email);
		return c.json({ data: result });
	});

	app.post("/reset-password", async (c) => {
		const body = await c.req.json();
		const { token, password } = body as { token?: string; password?: string };
		if (!token || typeof token !== "string") {
			return c.json({ error: "token is required" }, 400);
		}
		if (!password || typeof password !== "string") {
			return c.json({ error: "password is required" }, 400);
		}
		try {
			const result = await authService.resetPassword(token, password);
			return c.json({ data: result });
		} catch (e) {
			if (e instanceof PasswordResetTokenError) {
				return c.json({ error: e.message }, 400);
			}
			if (e instanceof Error) {
				return c.json({ error: e.message }, 400);
			}
			return c.json({ error: "Password reset failed" }, 400);
		}
	});
```

- [ ] **Step 3: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep "auth.route" | head -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.route.ts
git commit -m "feat: add forgot-password and reset-password routes"
```

---

## Task 10: Wire `passwordResetTokenExpiry` into AuthService in index.ts

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Pass the new config field**

In `backend/src/index.ts`, find the `AuthService` instantiation (around line 267). Add `passwordResetTokenExpiry: env.passwordResetTokenExpiry,` after the existing `emailVerificationTokenExpiry` line:

```typescript
	const authService = new AuthService(
		userRepository,
		{
			jwtSecret: env.jwtSecret,
			jwtRefreshSecret: env.jwtRefreshSecret,
			jwtExpiry: env.jwtExpiry,
			jwtRefreshExpiry: env.jwtRefreshExpiry,
			appUrl: env.appUrl,
			emailVerificationTokenExpiry: env.emailVerificationTokenExpiry,
			passwordResetTokenExpiry: env.passwordResetTokenExpiry,
			userDefaultMaxWorkspaces: env.userDefaultMaxWorkspaces,
			userDefaultMaxProjects: env.userDefaultMaxProjects,
		},
		workspaceService,
		prisma,
		emailProvider,
	);
```

- [ ] **Step 2: Type check the whole backend — must be clean for the feature**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: any remaining errors are pre-existing (unrelated to this feature).

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire passwordResetTokenExpiry into AuthService"
```

---

## Task 11: Create `ForgotPasswordPage`

**Files:**
- Create: `frontend/src/pages/ForgotPasswordPage.tsx`

- [ ] **Step 1: Create the page file**

```tsx
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      // Backend always returns success (enumeration-resistant). Show the
      // confirmation regardless.
      setSubmitted(true);
    } catch {
      // Network error — still show success to preserve the enumeration-resistant
      // contract from the user's perspective. The next attempt will work or
      // they'll learn it didn't via the email never arriving.
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <MailCheck size={20} className="text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-black">Check your email</h2>
            <p className="text-sm text-gray-600">
              If an account exists for <strong className="text-gray-900">{email}</strong>, we've sent a password reset link. The link expires in 1 hour.
            </p>
            <Link to="/login" className="block text-xs text-gray-500 hover:text-gray-900">
              ← Back to log in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-2">Reset your password</h2>
          <p className="text-xs text-gray-500 mb-4">
            Enter your email and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-gray-500">
            Remembered it?{" "}
            <Link to="/login" className="text-black font-medium hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run build 2>&1 | tail -5
```

Expected: clean build, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ForgotPasswordPage.tsx
git commit -m "feat: add ForgotPasswordPage with enumeration-resistant submit"
```

---

## Task 12: Create `ResetPasswordPage`

**Files:**
- Create: `frontend/src/pages/ResetPasswordPage.tsx`

- [ ] **Step 1: Create the page file**

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, ApiError } from "../services/api";
import { Button } from "../components/ui/Button";

const labelCls = "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls = "block w-full rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <h2 className="text-base font-semibold text-black">Missing token</h2>
            <p className="text-sm text-gray-600">
              The reset link is incomplete. Request a new link from the forgot-password page.
            </p>
            <Link to="/forgot-password" className="block">
              <Button variant="secondary" className="w-full">
                Request a new link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      navigate("/login?passwordReset=1");
    } catch (err) {
      if (err instanceof ApiError && typeof err.body?.error === "string") {
        setError(err.body.error);
      } else {
        setError(err instanceof Error ? err.message : "Password reset failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-center text-black mb-8">FCE Dashboard</h1>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-base font-semibold text-black mb-4">Set a new password</h2>

          {error && (
            <div className="mb-4 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
              {(error.toLowerCase().includes("token") ||
                error.toLowerCase().includes("expired") ||
                error.toLowerCase().includes("used")) && (
                <div className="mt-2">
                  <Link to="/forgot-password" className="text-red-800 font-medium hover:underline">
                    Request a new link →
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>New password</label>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className={labelCls}>Confirm password</label>
              <input
                type="password"
                className={inputCls}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your new password"
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Reset password
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-gray-500">
            <Link to="/login" className="text-black font-medium hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ResetPasswordPage.tsx
git commit -m "feat: add ResetPasswordPage with token validation and error linking"
```

---

## Task 13: Add "Forgot password?" link and `?passwordReset=1` notice on LoginPage

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Add the passwordReset notice state**

In `frontend/src/pages/LoginPage.tsx`, find the `verifiedNotice` block (around lines 28–33). Replace it with:

```typescript
  // When the user lands from /verify?token=... or /reset-password successfully,
  // show a short confirmation notice on the login form.
  const [verifiedNotice, setVerifiedNotice] = useState<string | null>(null);
  useEffect(() => {
    if (searchParams.get("verified") === "1") {
      setVerifiedNotice("Email verified — please log in.");
    } else if (searchParams.get("passwordReset") === "1") {
      setVerifiedNotice("Password changed — please log in with your new password.");
    }
  }, [searchParams]);
```

- [ ] **Step 2: Add the "Forgot password?" link below the password field**

In `frontend/src/pages/LoginPage.tsx`, find the password input block (around lines 116–119). Replace it with:

```tsx
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls}>Password</label>
                <Link to="/forgot-password" className="text-xs text-gray-500 hover:text-black hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input type="password" className={inputCls.replace("mb-1.5", "")} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
            </div>
```

Note: the original label class includes `mb-1.5`, but in the new layout the row above the input handles spacing, so we no longer need it on the input (but the `inputCls` const doesn't have `mb-1.5`, only the `labelCls` does — leave the input class as `inputCls`). Actually re-check: `inputCls` has no `mb-1.5`, so just use `inputCls` directly:

```tsx
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls.replace(" mb-1.5", "")}>Password</label>
                <Link to="/forgot-password" className="text-xs text-gray-500 hover:text-black hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
            </div>
```

The `labelCls.replace(" mb-1.5", "")` strips the existing margin since the wrapping flex row provides it. (The existing labelCls is `"block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5"`.)

- [ ] **Step 3: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add Forgot password link and passwordReset notice on LoginPage"
```

---

## Task 14: Register new routes in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the page imports**

At the top of `frontend/src/App.tsx`, find the existing page imports (around lines 9–32). Add these two imports near the other auth pages (after `LoginPage` and `SignupPage`):

```typescript
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
```

- [ ] **Step 2: Register the routes**

In `frontend/src/App.tsx`, find the auth routes block (around lines 58–62). Add the two new routes after `/signup`:

```tsx
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
            <Route path="/verify" element={<VerifyPage />} />
```

- [ ] **Step 3: Type check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: register /forgot-password and /reset-password routes"
```

---

## Task 15: Final verification

- [ ] **Step 1: Backend type check + tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit && bun test 2>&1 | tail -10
```

Expected: no new type errors; tests pass (any pre-existing failures from earlier branches are unrelated).

- [ ] **Step 2: Frontend build**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run build 2>&1 | tail -5
```

Expected: clean build, all modules transform successfully.

- [ ] **Step 3: Manual smoke test — happy path**

1. Start backend: `cd backend && bun run --hot src/index.ts`
2. Start frontend: `cd frontend && npm run dev`
3. Go to `/login` — confirm "Forgot password?" link is visible
4. Click it — `/forgot-password` page loads with the email form
5. Enter your email, submit — confirm "Check your email" success screen
6. Check backend logs (NoopEmailProvider logs the reset URL) — copy the URL
7. Open the URL — `/reset-password?token=...` page loads with two password fields
8. Enter a new password (8+ chars) in both fields, submit
9. Confirm redirect to `/login?passwordReset=1` with green "Password changed — please log in with your new password" notice
10. Log in with the new password — success → redirected to planner page

- [ ] **Step 4: Manual smoke test — error paths**

1. Visit `/reset-password` with no token → "Missing token" screen with "Request a new link" button
2. Visit `/reset-password?token=invalid` and submit a password → error "Token is invalid" with "Request a new link →" hint
3. Visit a valid token URL but type mismatching passwords in the two fields → client-side error "Passwords don't match" before submit
4. Type a password shorter than 8 chars → client-side error before submit

- [ ] **Step 5: Final commit (only if any fixes were needed during smoke testing)**

```bash
git add -A
git commit -m "feat: forgot password — complete end-to-end flow"
```
