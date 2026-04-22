# Stack Patterns Reference

Quick-reference conventions per stack to ensure plans stay consistent with existing code.

---

## Node.js + Fastify + Prisma + TypeScript (Wildan's primary stack)

### Layer Order
```
Request → Route → Middleware (auth/validate) → Controller → Service → Repository → Prisma
```

### File Naming
```
feature.route.ts       → Fastify route registration
feature.controller.ts  → thin, delegates to service
feature.service.ts     → business logic lives here
feature.repository.ts  → DB queries via Prisma (optional layer)
feature.schema.ts      → Zod schemas for request/response
feature.types.ts       → TS interfaces/types
feature.errors.ts      → custom error classes
```

### Error Handling Pattern
```typescript
// Custom error with HTTP code
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

// In service — throw, don't return
if (!user) throw new NotFoundError('User')

// Global error handler in Fastify catches and formats
```

### Response Envelope
```typescript
// Successful response
{ data: T, meta?: { page, total } }

// Error response
{ error: { message: string, code: string } }
```

### Validation (Zod)
```typescript
export const CreateOfferSchema = z.object({
  listingId: z.string().uuid(),
  amount: z.number().positive(),
})
export type CreateOfferDTO = z.infer<typeof CreateOfferSchema>
```

---

## Next.js + TypeScript (App Router or Pages Router)

### App Router Pattern
```
app/
  (route-group)/
    feature/
      page.tsx         → server component, data fetching
      _components/     → co-located client components
      actions.ts       → server actions
      loading.tsx      → suspense fallback
      error.tsx        → error boundary
```

### Data Fetching Preference
- Server components → direct DB/service call (no fetch overhead)
- Client components → React Query / SWR for mutations and polling
- Server Actions → for forms and mutations from client

### Auth Pattern (NextAuth / Lucia)
```typescript
// Always check session server-side for protected routes
const session = await getServerSession(authOptions)
if (!session) redirect('/login')
```

---

## React + Vite + TypeScript (Frontend)

### Component Structure
```
src/
  components/
    ui/              → primitives (Button, Input, Modal)
    [Feature]/       → feature-specific components
  hooks/             → custom hooks
  store/             → Zustand stores
  services/          → API call functions (axios/fetch wrappers)
  types/             → shared TypeScript types
  utils/             → pure helper functions
```

### API Call Pattern
```typescript
// services/offer.service.ts
export const createOffer = async (dto: CreateOfferDTO) => {
  const res = await api.post('/offers', dto)  // api = axios instance
  return res.data as CreateOfferResponse
}

// In component — use React Query
const { mutate, isPending } = useMutation({
  mutationFn: createOffer,
  onSuccess: () => queryClient.invalidateQueries(['listings'])
})
```

---

## Docker + Nginx (Deployment)

### Service Addition Checklist
- [ ] Add service to `docker-compose.yml` (or `stack.yml` for Swarm)
- [ ] Add Nginx `location` block if new public route
- [ ] Add env vars to `.env.production` template
- [ ] Health check endpoint (`/health`) required for new services
- [ ] Network: ensure service joins correct Docker network

### Nginx Location Block Pattern
```nginx
location /api/v1/feature {
    proxy_pass http://app:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## PostgreSQL + Prisma

### Migration Safety Rules
- `ADDITIVE` changes (new column with default or nullable) → safe hot deploy
- `BREAKING` changes (rename column, change type) → requires downtime or multi-step deploy
- Always generate named migrations: `prisma migrate dev --name add_payment_model`
- Never edit existing migration files in production

### Common Index Patterns
```prisma
// Foreign key index (Prisma doesn't auto-create in all versions)
@@index([userId])

// Composite unique
@@unique([userId, listingId])

// Full-text search (PostgreSQL)
// Handle via raw SQL migration for GIN indexes
```
