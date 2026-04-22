# Estimation Guide

T-shirt sizing for feature execution plans. Use these as baselines, then adjust based on codebase familiarity and team size.

---

## T-Shirt Sizes

| Size | Dev Hours | Description |
|------|-----------|-------------|
| XS   | < 2h      | Single file change, no schema change, no new endpoints |
| S    | 2–6h      | 1–3 files, maybe one new endpoint, no migration |
| M    | 6–16h     | New module with service + controller + schema + tests, simple migration |
| L    | 16–40h    | Multi-module feature, external integration, complex migration, E2E tests |
| XL   | 40h+      | Cross-cutting concern, architecture change, multi-service, data migration |

---

## Risk Levels

| Level  | Criteria |
|--------|----------|
| LOW    | No schema changes, no auth changes, purely additive, isolated module |
| MEDIUM | Schema migration, touches auth/permissions, modifies shared services |
| HIGH   | Breaking schema change, external API dependency, touches payment/security flows, data migration on large tables |

---

## Complexity Multipliers

Add 1 size up for each:
- External API integration (webhooks, OAuth, payment gateway)
- Real-time feature (WebSocket, SSE, polling)
- Background job / queue integration
- Multi-tenant data isolation required
- File upload / media processing
- No existing test coverage in the area being changed
- Unclear or shifting requirements

---

## Effort Breakdown Template (M-size example)

```
[ ] Requirement analysis & design: 1h
[ ] Schema / migration: 1h
[ ] Service layer implementation: 2h
[ ] Controller + route: 1h
[ ] Validation schemas: 0.5h
[ ] Unit tests: 1.5h
[ ] Manual QA + bug fixes: 1h
─────────────────────────────────
Total: ~8h (M)
```
