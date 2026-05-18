# Forgot Password Feature — Design

**Date:** 2026-05-12
**Status:** Approved
**Branch:** `feat/forgot-password` (off `main`)

## Summary

Add self-service password reset to the FCE auth flow. From the login page, a user clicks "Forgot password?" → enters their email → receives a reset link → opens the link → enters a new password → is redirected to the login page with a confirmation notice and must log in manually.

Mirrors the existing `EmailVerificationToken` pattern exactly — opaque single-use tokens, expiry, email delivery, idempotency guards.

---

## Data Model

**New Prisma model: `PasswordResetToken`**

```prisma
model PasswordResetToken {
  id         String    @id @default(uuid())
  userId     String    @map("user_id")
  token      String    @unique
  expiresAt  DateTime  @map("expires_at")
  consumedAt DateTime? @map("consumed_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("password_reset_tokens")
}
```

**Relation:** Add `passwordResetTokens PasswordResetToken[]` to the existing `User` model.

**Migration:** A single `prisma db push` after pulling the schema. No backfill script needed — the table starts empty.

**Token lifecycle:**
1. User submits email → server generates `crypto.randomBytes(32).toString("hex")` (64-char opaque token).
2. Any existing unconsumed tokens for that user are deleted (one active reset per user).
3. New row inserted with `expiresAt = now + PASSWORD_RESET_TOKEN_EXPIRY` (default `1h`).
4. Email sent with link `${APP_URL}/reset-password?token=<token>`.
5. When the user submits a new password: server validates the token → updates `User.passwordHash` → sets `consumedAt = now()` in the same transaction.
6. Expired or already-consumed tokens are rejected with a clear error.

**Configuration:**
- New env var `PASSWORD_RESET_TOKEN_EXPIRY` — default `1h`, parsed the same way as `EMAIL_VERIFICATION_TOKEN_EXPIRY` (formats: `"30s"`, `"5m"`, `"2h"`, `"7d"`).
- Token expiry surfaced in the email body (e.g. "This link expires in 1 hour.").

---

## Backend

### New endpoints in `backend/src/routes/auth.route.ts`

```
POST /api/auth/forgot-password
  Body:    { email: string }
  Returns: 200 { success: true } — ALWAYS, regardless of whether the email exists.
           Prevents email enumeration. The "we sent you a link if the email exists"
           copy lives in the frontend.

POST /api/auth/reset-password
  Body:    { token: string, password: string }
  Returns: 200 { success: true }
  Errors:
    400 { error: "Token is invalid" }              — token not found
    400 { error: "Token has expired" }             — past expiresAt
    400 { error: "Token has already been used" }   — consumedAt is set
    400 { error: "Password must be at least 8 characters" } — validation
```

### New methods on `AuthService`

```typescript
requestPasswordReset(email: string): Promise<void>
// - Look up user by email
// - If not found: silently return (enumeration protection)
// - Delete any existing unconsumed PasswordResetToken for this user
// - Insert new token, expiresAt = now + PASSWORD_RESET_TOKEN_EXPIRY
// - Build reset URL: `${APP_URL}/reset-password?token=<token>`
// - Call emailProvider.sendPasswordReset({...}) — failures logged, not thrown
// - Throttle: 60-second minimum interval between requests for the same user
//   (mirrors the existing resendVerification throttle pattern)

resetPassword(token: string, newPassword: string): Promise<void>
// - Find token by unique `token`
// - Throw PasswordResetTokenError("invalid" | "expired" | "consumed") accordingly
// - Validate password (length >= 8)
// - Hash password via hashPassword()
// - In a single transaction: update User.passwordHash AND set consumedAt = now() on the token
```

A new error class `PasswordResetTokenError` is added next to `EmailNotVerifiedError`, and the route handler maps each variant to a 400 response with the appropriate message string.

### Email provider extension

`backend/src/interfaces/providers/email.provider.interface.ts`:

```typescript
interface PasswordResetEmailInput {
  to: string;
  fullName: string | null;
  resetUrl: string;
  expiryHuman: string;
}

interface IEmailProvider {
  sendInvitation(input: InvitationEmailInput): Promise<void>;
  sendVerification(input: VerificationEmailInput): Promise<void>;
  sendPasswordReset(input: PasswordResetEmailInput): Promise<void>;  // new
}
```

All three implementations get a new `sendPasswordReset` method:
- `ResendEmailProvider` — inline-styled HTML matching the existing verification email layout
- `SmtpEmailProvider` — same template, sent via nodemailer
- `NoopEmailProvider` — logs the reset URL to stdout (dev only)

Email copy:
- Subject: "Reset your FCE password"
- Body: Greeting (with fullName fallback), main CTA button "Reset password" → `resetUrl`, plain-text fallback link, "This link expires in {expiryHuman}", and a safety line ("If you didn't request this, you can safely ignore this email.")

---

## Frontend

### New page: `ForgotPasswordPage` (`frontend/src/pages/ForgotPasswordPage.tsx`)

Reached via a new "Forgot password?" link on `LoginPage`. Single email input + "Send reset link" button.

States:
- **Initial:** form with email input
- **Submitting:** button shows spinner
- **Submitted:** form replaced with a "Check your email" confirmation screen (mirrors `SignupPage`'s pending state). Always shows this state regardless of whether the email exists, matching the backend's enumeration-resistant behavior. Includes a "← Back to login" link.

### New page: `ResetPasswordPage` (`frontend/src/pages/ResetPasswordPage.tsx`)

Reached via `/reset-password?token=<token>` from the email link.

States:
- **Initial:** two password inputs (new password + confirm), "Reset password" button. Client-side requires length ≥ 8 and both fields matching before allowing submit.
- **Submitting:** button shows spinner
- **Token error:** if token missing/invalid/expired/consumed → red error block with the server's error message + "Request a new link" button linking to `/forgot-password`
- **Success:** redirects to `/login?passwordReset=1`

### Updated: `LoginPage`

- "Forgot password?" link added below the password field, right-aligned.
- Reads `?passwordReset=1` from the URL and renders a green notice "Password changed — log in with your new password" (same pattern as the existing `?verified=1` notice).

### Updated: `App.tsx`

Two new routes in the auth route group:
```tsx
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
```

---

## Error Handling

| Surface | Scenario | Behavior |
|---|---|---|
| `POST /forgot-password` | Email not registered | 200 `{ success: true }` (enumeration protection) |
| `POST /forgot-password` | Throttled (<60s since last request) | 200 `{ success: true }` (silent skip — same response as success) |
| `POST /forgot-password` | Email provider fails | Logged via Winston, response is still 200. User can retry. |
| `POST /reset-password` | Token not found | 400 `{ error: "Token is invalid" }` |
| `POST /reset-password` | Token expired | 400 `{ error: "Token has expired" }` |
| `POST /reset-password` | Token already consumed | 400 `{ error: "Token has already been used" }` |
| `POST /reset-password` | Password < 8 chars | 400 `{ error: "Password must be at least 8 characters" }` |
| `ResetPasswordPage` | Token query param missing | Show token-error state with "Request a new link" |

---

## Configuration

New env var added to `.env.example`:
```
# Password reset link expiry. Same format as EMAIL_VERIFICATION_TOKEN_EXPIRY
# ("30s", "5m", "2h", "7d"). Default 1h.
PASSWORD_RESET_TOKEN_EXPIRY=1h
```

---

## Out of Scope

- Password strength meter (length ≥ 8 is the only requirement, matching the existing signup flow).
- Account lockout after N failed reset attempts (separate hardening feature).
- 2FA / TOTP — not in the codebase yet.
- Logging out existing sessions after reset — out of scope; the issued JWT/refresh remains valid until expiry. (Can be added later by clearing refresh tokens for the user on successful reset.)
- Updating the CLI `scripts/reset-password.ts` — it's an admin tool and remains as-is.
