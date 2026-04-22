# OWASP Top 10 — Detailed Reference (2021 edition)

Read this when the user needs deep coverage of a specific category, or when auditing an app end-to-end.

## A01: Broken Access Control

**What it is**: users can access resources or perform actions outside their permissions. Most common category in real breaches.

**Common patterns**
- IDOR: `/api/invoices/1234` returns any invoice regardless of owner.
- Missing function-level authorization: `/admin/users` is reachable by any logged-in user because only the frontend hid it.
- Privilege escalation via mass-assignment: `PATCH /users/me` with `{"role":"admin"}` and the server blindly merges.
- JWT with client-chosen claims (`role` trusted from the token without re-verifying in DB for sensitive actions).

**Defenses**
- Deny-by-default middleware; every route must opt into public status.
- Check resource ownership in the handler, not just the middleware.
- Don't trust the client for sensitive fields. Strip `role`, `isAdmin`, `balance`, `userId` from any input body before merging.
- Log every access-control denial — patterns indicate attacks.
- Prefer UUID/ULID over autoincrement IDs.

```ts
// Anti-pattern — mass assignment
await prisma.user.update({ where: { id: userId }, data: req.body });

// Fix — explicit allow-list
const { name, avatarUrl } = req.body;
await prisma.user.update({ where: { id: userId }, data: { name, avatarUrl } });
```

## A02: Cryptographic Failures

**What it is**: sensitive data exposed in transit or at rest because crypto is missing, misconfigured, or broken.

**Common patterns**
- HTTP in production, or HTTP-only internal service calls between trusted zones.
- Passwords hashed with MD5, SHA-1, or unsalted SHA-256.
- Secrets, card data, or tokens in logs.
- Homemade "encryption" — XOR, base64, custom ciphers.
- ECB mode for AES, or reusing IVs.

**Defenses**
- TLS 1.2+ end-to-end. Yes, even between internal services.
- Password hashing: `argon2id` (preferred) with `memoryCost: 65536, timeCost: 3, parallelism: 4`, or `bcrypt` with cost ≥ 12.
- Use `crypto.randomUUID()`, `crypto.randomBytes()` — never `Math.random()` for anything security-relevant.
- For encryption at rest, use `AES-256-GCM` via `node:crypto` or libsodium. Never roll your own.
- Mask card numbers (PCI-DSS: only last 4 visible), mask national IDs.

## A03: Injection

**What it is**: attacker data is interpreted as code/commands by an interpreter (SQL, NoSQL, OS shell, LDAP, XPath, template engine, ORM raw query).

**Common patterns**
- `SELECT * FROM users WHERE email = '${email}'`
- `exec('convert ' + userFile + ' output.png')`
- MongoDB: `User.find({ email: req.body.email })` where `email` is `{ $ne: null }` (operator injection).
- Template injection: `handlebars.compile(userInput)`.

**Defenses**
- Parameterized queries or ORMs.
- `execFile` with argument array, never `exec` with concatenated strings.
- For MongoDB, coerce types and use `express-mongo-sanitize` or Zod to strip `$`-prefixed keys.
- Never pass user input into a template compiler.

## A04: Insecure Design

**What it is**: the system is built such that even perfect implementation is insecure — no rate limits on OTP, secret questions as fallback, forgot-password via last 4 of SSN.

**Defenses**
- Threat-model before building auth, payment, or admin flows. "What can an attacker do if they have X?"
- Require MFA for sensitive actions (password change, add recipient, export).
- Rate limits and lockouts designed-in from day one.
- Principle of least information: password reset emails should not confirm whether the address exists.

## A05: Security Misconfiguration

**What it is**: stack defaults, verbose errors, open ports, unnecessary features enabled.

**Common patterns**
- Development debug endpoints exposed in prod (`/debug`, `/__graphql`, `NODE_ENV` not set).
- Full error stack traces in 500 responses.
- S3 buckets public, Elasticsearch open on 9200, Redis on 6379 without auth, MongoDB without auth.
- Default admin/admin credentials.
- CORS set to reflect any origin with credentials.

**Defenses**
- Set `NODE_ENV=production`. Express/Fastify suppress stack traces then.
- Checklist for every deploy: headers set, CSP on, error handler generic.
- Cloud scanner (AWS Trusted Advisor, GCP Security Command Center).
- Baseline each environment against a hardened template.

## A06: Vulnerable and Outdated Components

**What it is**: you're using a library with a known CVE.

**Defenses**
- CI step: `npm audit --audit-level=high` or `pnpm audit` or `bun audit` — fails the build on high+critical.
- Renovate/Dependabot auto-PRs; merge weekly.
- `npm ls <pkg>` to find transitive dependents when a CVE lands.
- Subscribe to GitHub security advisories for your language.
- Drop unused dependencies — every one is attack surface.

## A07: Identification and Authentication Failures

**What it is**: weak login, session handling, password storage, or recovery flows.

**Common patterns**
- Login works without rate limiting → credential stuffing.
- Session IDs predictable or not rotated after login.
- Remember-me cookies never expire.
- Password policies requiring complexity but allowing "Password123!".
- Logout doesn't invalidate tokens server-side.

**Defenses**
- Rate-limit login (IP + email). Increase delay on repeated failures.
- Minimum password length 12+; check against HaveIBeenPwned password list.
- Rotate session ID on privilege change (login, MFA, password change).
- Invalidate server-side on logout — store session or refresh token JTI in Redis/DB.
- MFA via TOTP or WebAuthn. SMS last resort (SIM-swap risk).
- Generic errors: "Invalid credentials" not "User not found".

## A08: Software and Data Integrity Failures

**What it is**: code or data from untrusted sources is trusted.

**Common patterns**
- `curl | bash` install scripts in CI.
- GitHub Actions pinned by tag (`@v3`) not SHA — tags can move.
- Auto-update mechanisms that don't verify signatures.
- Deserializing untrusted data with `JSON.parse` + `eval` fallback, `pickle`, `unserialize()` (PHP), or BSON.

**Defenses**
- Pin actions by SHA. Use `dependabot` to update SHAs.
- Lockfiles committed; CI uses `npm ci` / `pnpm install --frozen-lockfile` / `bun install --frozen-lockfile`.
- Signed container images (cosign, Docker Content Trust).
- Never deserialize untrusted data with unsafe deserializers.

## A09: Security Logging and Monitoring Failures

**What it is**: you can't detect or investigate an attack because logs are missing, noisy, or hold PII.

**Defenses**
- Log: auth successes & failures, privilege changes, admin actions, data exports, password resets, MFA changes, access-denied events.
- Structured JSON with request ID, user ID (not email), IP, UA.
- Redact passwords, tokens, card numbers, full PII at the logger layer.
- Alert on: >N failed logins, new IP for admin, burst of 401s, 500s above baseline.
- Retain logs per compliance (UU PDP, GDPR, PCI) — and ensure they're tamper-resistant (WORM storage or separate account).

## A10: Server-Side Request Forgery (SSRF)

**What it is**: the app fetches a URL supplied by the user, and the attacker makes it fetch internal resources (cloud metadata, Redis, admin panels).

**Common patterns**
- Image proxy, URL preview / unfurler, webhook sender, PDF generator with user-supplied HTML that loads external resources.
- Attacker points at `http://169.254.169.254/latest/meta-data/` (AWS IMDS) and reads IAM credentials.

**Defenses**
- DNS-resolve the URL and check the resolved IP is public — reject link-local (`169.254.0.0/16`), loopback (`127.0.0.0/8`), private (`10/8`, `172.16/12`, `192.168/16`), IPv6 equivalents (`fc00::/7`, `::1`, `fe80::/10`).
- Enforce an allow-list of domains if possible.
- Disable HTTP redirects (or re-validate every hop).
- On AWS, require IMDSv2 (token-based) — mitigates most SSRF credential theft.
- Fetch with a strict timeout and small max body.

```ts
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

async function assertPublicUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
  const { address } = await lookup(u.hostname);
  const parsed = ipaddr.parse(address);
  const range = parsed.range();
  if (['private', 'loopback', 'linkLocal', 'uniqueLocal', 'reserved'].includes(range)) {
    throw new Error('blocked: non-public address');
  }
}
```

---

## Compliance cross-reference

| Framework | Relevant sections |
|---|---|
| **PCI-DSS** | A02 (crypto), A03 (injection), A07 (auth), A09 (logging) |
| **GDPR / UU PDP** | A02 (data protection), A09 (breach detection) |
| **SOC 2** | All — especially A05, A06, A08, A09 |
| **ISO 27001** | All — system-wide ISMS |
| **POJK / OJK (Indonesia fintech)** | A01, A02, A07, A09 — plus BI/OJK-specific reporting |

When auditing a financial/banking app in Indonesia, explicitly check: BI-RTGS integration secrets, customer data encryption at rest, audit trail immutability, MFA enforcement for every internal console, quarterly pentest evidence.
