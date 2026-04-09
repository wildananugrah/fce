# Content Library Phase 1 — Table View + Instagram Previews

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Content Library from card grid to searchable table with platform-specific preview modals, starting with Instagram formats.

**Architecture:** Table view with search/filters fetching library items (including brand/product names). Clicking "View" opens a modal with platform-specific preview components. Preview components are modular — one per content type — rendered via a registry pattern so adding new platforms later is just adding a new component file.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Hono backend, Prisma 7

---

## File Structure

### Backend Changes
- **Modify:** `backend/prisma/schema.prisma` — Add Brand/Product relations on GenerationRequest
- **Modify:** `backend/src/repositories/generation.repository.ts` — Include brand/product in library query

### Frontend — New Files
- **Create:** `frontend/src/components/library/ContentPreviewModal.tsx` — Main preview modal with platform routing
- **Create:** `frontend/src/components/library/previews/InstagramCarousel.tsx` — Instagram carousel preview
- **Create:** `frontend/src/components/library/previews/InstagramSingleImage.tsx` — Single image post preview
- **Create:** `frontend/src/components/library/previews/InstagramReels.tsx` — Reels script preview
- **Create:** `frontend/src/components/library/previews/InstagramStory.tsx` — Story (image + video) preview
- **Create:** `frontend/src/components/library/previews/GenericPreview.tsx` — Fallback for unsupported platforms
- **Create:** `frontend/src/components/library/previews/PreviewRegistry.tsx` — Maps contentType to preview component

### Frontend — Modified Files
- **Modify:** `frontend/src/pages/LibraryPage.tsx` — Full rewrite: table view with search, filters, brand/product columns

---

## Task 1: Backend — Include Brand/Product Names in Library Response

The library API currently returns only `brandId`/`productId` as strings. We need brand and product names for the table.

### Step 1.1: Add Brand relation on GenerationRequest in schema

**File:** `backend/prisma/schema.prisma`

The GenerationRequest model needs `brand` and `product` relations. Check if they exist — if not, add:

```prisma
// Inside model GenerationRequest, after the workspace relation:
brand        Brand?        @relation(fields: [brandId], references: [id], onDelete: SetNull)
product      Product?      @relation(fields: [productId], references: [id], onDelete: SetNull)
```

Also add the reverse relations on Brand and Product models:
```prisma
// Inside model Brand:
generationRequests GenerationRequest[]

// Inside model Product:
generationRequests GenerationRequest[]
```

Run: `set -a && source .env && set +a && bunx prisma db push`

### Step 1.2: Update the library query to include brand/product

**File:** `backend/src/repositories/generation.repository.ts`

Change the `findOutputsByWorkspace` method's include to nest brand/product inside request:

```typescript
include: {
  request: {
    include: {
      brand: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  },
  sections: { orderBy: { sectionOrder: "asc" } },
},
```

### Step 1.3: Verify with type check

Run: `cd backend && bunx tsc --noEmit 2>&1 | grep -E "library|generation.repository"`

If there are type mismatches on the return type, update the repository interface to use a broader type or `any` for the library query since the nested includes change the shape.

### Step 1.4: Commit

```bash
git add backend/prisma/schema.prisma backend/src/repositories/generation.repository.ts
git commit -m "feat(library): include brand/product names in library API response"
```

---

## Task 2: Preview Registry + Generic Fallback

Create the infrastructure for routing content types to preview components.

### Step 2.1: Create PreviewRegistry

**File:** `frontend/src/components/library/previews/PreviewRegistry.tsx`

```tsx
import type { ComponentType } from "react";
import { InstagramCarousel } from "./InstagramCarousel";
import { InstagramSingleImage } from "./InstagramSingleImage";
import { InstagramReels } from "./InstagramReels";
import { InstagramStory } from "./InstagramStory";
import { GenericPreview } from "./GenericPreview";

export interface PreviewProps {
  content: Record<string, unknown>;
  sections: {
    id: string;
    sectionType: string;
    sectionOrder: number;
    contentText: string;
  }[];
  brandName: string;
  productName?: string;
  contentTitle?: string;
}

const PREVIEW_MAP: Record<string, ComponentType<PreviewProps>> = {
  // Instagram
  single_image: InstagramSingleImage,
  carousel: InstagramCarousel,
  reels: InstagramReels,
  story_image: InstagramStory,
  story_video: InstagramStory,
};

export function getPreviewComponent(contentType: string): ComponentType<PreviewProps> {
  return PREVIEW_MAP[contentType] ?? GenericPreview;
}
```

### Step 2.2: Create GenericPreview

**File:** `frontend/src/components/library/previews/GenericPreview.tsx`

A clean fallback that displays sections in a structured way. Shows hook, caption/body, CTA, hashtags, and visual direction in labeled blocks. This is used for all platforms not yet implemented (TikTok, YouTube, Twitter, LinkedIn, Facebook).

Structure:
- Title bar with content type
- Sections grouped by type with labels
- Content JSON fields displayed as labeled paragraphs
- Hashtags as inline badges

### Step 2.3: Commit

```bash
git add frontend/src/components/library/previews/
git commit -m "feat(library): add preview registry and generic fallback"
```

---

## Task 3: Instagram Carousel Preview

The most complex Instagram format — a swipeable multi-slide preview mimicking Instagram's UI.

### Step 3.1: Create InstagramCarousel component

**File:** `frontend/src/components/library/previews/InstagramCarousel.tsx`

UI Structure (matching the reference screenshot):
- Instagram-like phone mockup wrapper
- Brand avatar (first letter, colored circle) + brand name + "Sponsored" label
- Image placeholder area (gray with image icon)
- Slide dots indicator at bottom of image area
- Left/Right navigation arrows on hover
- Current slide content: headline + body text below image
- Below the card: caption text, hashtags, CTA
- Slide counter "1 / 7"

Data sources:
- `content.slides[]` array — each slide has `headline`, `body`, `visualDirection`
- If no slides, fall back to sections grouped by type
- `brandName` for the header
- `content.hashtags` for tags
- `content.cta` or CTA section for call-to-action

State: `currentSlide` index, navigated via arrows or dots.

### Step 3.2: Commit

```bash
git add frontend/src/components/library/previews/InstagramCarousel.tsx
git commit -m "feat(library): add Instagram carousel preview component"
```

---

## Task 4: Instagram Single Image, Reels, Story Previews

### Step 4.1: Create InstagramSingleImage

**File:** `frontend/src/components/library/previews/InstagramSingleImage.tsx`

Similar to carousel but single frame:
- Brand avatar + name + "Sponsored"
- Image placeholder
- Below: hook text, caption/body, hashtags, CTA
- No slide navigation

Data: Uses `content.hook` or hook section, `content.caption`/`content.body`, `content.hashtags`, `content.cta`

### Step 4.2: Create InstagramReels

**File:** `frontend/src/components/library/previews/InstagramReels.tsx`

Vertical phone mockup (9:16 aspect ratio) mimicking Reels:
- Dark background
- Brand avatar + name on top overlay
- Scene list: each scene shows scene number, voiceover text, on-screen text, visual direction
- If `content.scenes[]` exists, iterate scenes
- If no scenes, show hook + body + CTA in a single scene layout
- Bottom: music icon, like/comment/share icons (decorative)

### Step 4.3: Create InstagramStory

**File:** `frontend/src/components/library/previews/InstagramStory.tsx`

Vertical phone mockup (9:16):
- Story progress bar at top
- Brand avatar + name
- Image/video placeholder area
- Text overlay area showing hook/headline
- CTA button ("Swipe up" or link sticker style)
- For story_video: add a play icon overlay

### Step 4.4: Commit

```bash
git add frontend/src/components/library/previews/
git commit -m "feat(library): add Instagram single image, reels, and story previews"
```

---

## Task 5: Content Preview Modal

The modal wrapper that renders the appropriate preview component.

### Step 5.1: Create ContentPreviewModal

**File:** `frontend/src/components/library/ContentPreviewModal.tsx`

Props:
```typescript
interface ContentPreviewModalProps {
  item: LibraryItem; // The full library item with request, sections, content
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}
```

Layout:
- Modal with max-width ~640px
- Header: content title + platform/contentType subtitle + "Copy All" button + close X
- Body: renders the preview component from registry based on `item.request.contentType`
- Footer: Status buttons (Approved / Draft / Rejected) — clicking changes status via API

"Copy All" button: collects all text from sections into clipboard (hook + caption + cta + hashtags).

### Step 5.2: Commit

```bash
git add frontend/src/components/library/ContentPreviewModal.tsx
git commit -m "feat(library): add content preview modal with status controls"
```

---

## Task 6: Rewrite LibraryPage — Table View

Full rewrite of `frontend/src/pages/LibraryPage.tsx`.

### Step 6.1: Rewrite LibraryPage

**File:** `frontend/src/pages/LibraryPage.tsx`

New interface for the enriched library item:
```typescript
interface LibraryItem {
  id: string;
  contentTitle?: string | null;
  content: Record<string, unknown>;
  status: string;
  createdAt: string;
  request: {
    platform: string;
    contentType: string;
    brand?: { id: string; name: string } | null;
    product?: { id: string; name: string } | null;
  };
  sections: {
    id: string;
    sectionType: string;
    sectionOrder: number;
    contentText: string;
  }[];
}
```

**Page layout:**
1. Header: "Content Library" + subtitle "Your database of generated social media content."
2. Search bar (filters by title, brand name, content text) + Platform dropdown + Status dropdown + item count
3. Table columns:
   - **Content Title** — title + subtitle showing slide/scene count (e.g., "7 slides")
   - **Brand** — brand name + product name below
   - **Platform** — colored badge (Instagram=purple, TikTok=black, etc.)
   - **Status** — badge (Approved=green, Draft=gray, Rejected=red)
   - **Generated** — relative time ("Today", "yesterday", "2 days ago")
   - **Actions** — "View" button
4. Clicking "View" opens ContentPreviewModal

**Helpers:**
- `getSlideCount(content)` — counts slides/scenes/frames arrays
- `getContentSubtitle(contentType, content)` — returns "7 slides", "6 scenes", etc.
- `formatRelativeDate(dateStr)` — "Today", "yesterday", "3 days ago"
- `getPlatformColor(platform)` — returns tailwind classes for platform badges

### Step 6.2: Verify build

Run: `cd frontend && bun run build`

### Step 6.3: Commit

```bash
git add frontend/src/pages/LibraryPage.tsx
git commit -m "feat(library): rewrite content library as searchable table with preview modal"
```

---

## Task 7: Final Integration & Polish

### Step 7.1: Test the full flow

1. Navigate to `/content-library`
2. Verify table loads with brand/product names, platform badges, status badges
3. Test search filtering
4. Test platform and status dropdowns
5. Click "View" on an Instagram carousel item — verify carousel preview renders with slides
6. Click "View" on other Instagram types — verify each preview renders
7. Click "View" on non-Instagram content — verify generic fallback renders
8. Test status change buttons (Approved/Draft/Rejected) in the preview modal
9. Test "Copy All" button

### Step 7.2: Fix any issues found during testing

### Step 7.3: Final commit

```bash
git add -A
git commit -m "feat(library): content library phase 1 complete — table view + Instagram previews"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Backend: brand/product in library API | schema.prisma, generation.repository.ts |
| 2 | Preview registry + generic fallback | PreviewRegistry.tsx, GenericPreview.tsx |
| 3 | Instagram carousel preview | InstagramCarousel.tsx |
| 4 | Instagram single/reels/story previews | 3 component files |
| 5 | Content preview modal wrapper | ContentPreviewModal.tsx |
| 6 | Rewrite LibraryPage as table | LibraryPage.tsx |
| 7 | Integration testing & polish | All files |

**Phase 2 (future):** Add TikTok, YouTube, Twitter/X, LinkedIn, Facebook preview components to the registry.
