# Authentication Patterns

Read this when the user is building login, signup, JWT, sessions, password reset, or MFA.

## Password hashing

### argon2id (preferred)

```ts
import argon2 from 'argon2';

// Registration
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
});
await prisma.user.create({ data: { email, passwordHash: hash } });

// Login
const ok = await argon2.verify(user.passwordHash, inputPassword);
```

### bcrypt (acceptable fallback)

```ts
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 12); // cost 12+
const ok = await bcrypt.compare(inputPassword, user.passwordHash);
```

**Never use**: MD5, SHA-1, SHA-256 alone, PBKDF2 with < 100k iterations, homemade salts.

---

## Session-cookie auth (often simpler and more secure than JWT)

```ts
// Fastify + @fastify/secure-session
await app.register(secureSession, {
  key: Buffer.from(process.env.SESSION_KEY!, 'base64'), // 32 bytes
  cookie: {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
});

app.post('/login', async (req, reply) => {
  const user = await verifyUser(req.body);
  req.session.set('userId', user.id);
  // rotate session id on login to prevent fixation
  await req.session.regenerate();
  return { ok: true };
});
```

**Advantages over JWT**: revocation is just deleting the session row; no token-in-localStorage XSS risk; simpler rotation.

**When JWT is better**: pure API with many independent services that can't share a session store, or mobile apps where cookies are awkward.

---

## JWT with refresh token rotation

The only JWT pattern that's safe for long-lived sessions.

### Token structure

- **Access token**: short-lived (5–15 min), stateless, signed JWT. Carries `sub`, `iat`, `exp`, maybe `roles`.
- **Refresh token**: long-lived (7–30 days), opaque (not a JWT) or JWT with a `jti`. Stored server-side as a *hash*. Rotates on every use.

### Schema

```prisma
model RefreshToken {
  id          String   @id @default(cuid())
  familyId    String   // all tokens rotated from one login share a family
  userId      String
  tokenHash   String   // sha256 of the raw token
  expiresAt   DateTime
  revokedAt   DateTime?
  replacedBy  String?  // id of the token that replaced this one
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id])
  @@index([familyId])
  @@index([tokenHash])
}
```

### Issue on login

```ts
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function issueTokens(userId: string, familyId?: string) {
  const family = familyId ?? crypto.randomUUID();
  const raw = crypto.randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      familyId: family,
      userId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  const access = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, {
    expiresIn: '10m',
    issuer: 'yourdomain.com',
    audience: 'yourdomain.com',
  });
  return { accessToken: access, refreshToken: raw };
}
```

### Refresh endpoint — with reuse detection

```ts
app.post('/auth/refresh', async (req, reply) => {
  const { refreshToken } = req.body;
  const hash = sha256(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

  if (!existing || existing.expiresAt < new Date()) {
    return reply.code(401).send();
  }

  // REUSE DETECTION — if an already-revoked token is replayed, someone stole it.
  if (existing.revokedAt) {
    // Revoke the entire family
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reply.code(401).send({ error: 'token reuse detected' });
  }

  // Rotate: mark current as revoked, issue a new one in the same family
  const tokens = await issueTokens(existing.userId, existing.familyId);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedBy: sha256(tokens.refreshToken) },
  });
  return tokens;
});
```

### Storage on the client

- **Web, same-site**: refresh token in `HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh` cookie. Access token in memory (JS variable).
- **Web, cross-site**: refresh token in `HttpOnly` cookie with `SameSite=None; Secure`, plus CSRF defense on `/auth/refresh`.
- **Mobile**: secure storage (Keychain / EncryptedSharedPreferences).
- **Never** store either token in `localStorage` — XSS will read it.

### Verify access tokens

```ts
const payload = jwt.verify(token, process.env.JWT_SECRET!, {
  issuer: 'yourdomain.com',
  audience: 'yourdomain.com',
  algorithms: ['HS256'], // pin the algorithm — prevent 'none' attack
});
```

---

## MFA (TOTP)

```ts
import { authenticator } from 'otplib';

// Enrollment
const secret = authenticator.generateSecret();
await prisma.user.update({ where: { id }, data: { totpSecret: encrypt(secret) } });
const otpauth = authenticator.keyuri(user.email, 'YourApp', secret);
// Display QR code of otpauth URL to user

// Verify
const ok = authenticator.check(userInputCode, decrypt(user.totpSecret));
```

- **Backup codes**: generate 8–10 random codes at enrollment, hash and store; show once.
- **Rate-limit TOTP verification** (5 per 15 min).
- **WebAuthn / Passkeys** is stronger than TOTP — use `@simplewebauthn/server` if you can.

---

## Password reset

1. User submits email. **Always** respond with the same message ("If an account exists, an email was sent") — don't leak which emails are registered.
2. Generate a random token (`crypto.randomBytes(32).toString('base64url')`), store the hash with a 15–30 min expiry.
3. Email the raw token in a URL.
4. On submit, hash-and-lookup, verify expiry, check single-use (mark as consumed).
5. Invalidate all existing sessions/refresh tokens for that user on password change.

---

## Rate limiting auth endpoints

```ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

const loginLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'login_fail',
  points: 5,          // 5 attempts
  duration: 15 * 60,  // per 15 min
  blockDuration: 15 * 60,
});

app.post('/login', async (req, reply) => {
  const key = `${req.ip}:${req.body.email}`;
  try { await loginLimiter.consume(key); }
  catch { return reply.code(429).send({ error: 'too many attempts' }); }
  // …verify credentials
  if (!ok) { await loginLimiter.consume(key); return reply.code(401).send(); }
  await loginLimiter.delete(key); // reset on success
});
```

Key by **IP + email** together. IP-alone is bypassed by botnets; email-alone gets a user locked out by an attacker.

---

## Common mistakes

- `jwt.verify(token)` without `algorithms` option → accepts `alg: none` tokens.
- Storing JWT in `localStorage` "because it's easier" → XSS steals it.
- No server-side logout → revoked JWTs still work until expiry.
- Refresh tokens that never rotate → stolen token = lifetime access.
- Comparing password hashes with `===` → timing attack. Libraries' `verify()` functions are constant-time; use them.
- Reusing the same JWT secret across dev/staging/prod.
- Using the same token for access and refresh.
- Forgetting to invalidate all sessions on password change or on account email change.
