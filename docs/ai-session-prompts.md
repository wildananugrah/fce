# AI Session Prompts — FCE UI Redesign

These prompts are designed to start and end AI coding sessions efficiently
on the `ui/adam-redesign` branch. Copy-paste them as-is; fill in the
`[bracketed]` placeholders before sending.

---

## 🟢 SESSION START PROMPT

```
You are continuing UI development on the Floothink Content Engine (FCE)
project. We are on branch `ui/adam-redesign`.

## Scope
- ONLY UI / frontend changes. Do NOT touch backend, infrastructure,
  workflow logic, database schema, or API routes.
- Working directory: `/Users/adamlahm/fce/frontend/src`

## Tech stack (frontend only)
- React 19, TypeScript (strict), Vite 8
- Tailwind CSS 4 (utility-first; avoid arbitrary inline styles)
- React Router 7, Hono (API calls via frontend services)
- File conventions: pages in `src/pages/`, shared components in
  `src/components/`, layout shell in `src/components/layout/AppShell.tsx`

## Project docs to read before anything else
1. `CLAUDE.md` — full project overview and code style rules (Frontend
   Structure section: lines 146–152 is most relevant)
2. `docs/todo.md` — completed phases; Phase 7 is the baseline
3. `docs/notes.md` — latest discussion notes and pending items

## Current session goal
[DESCRIBE EXACTLY WHAT YOU WANT TO DO — e.g., "Redesign the sidebar in
AppShell.tsx with a collapsible nav and new icon set" or "Restyle the
DashboardPage.tsx KPI cards with glassmorphism and animated counters"]

## Files in scope this session
[LIST THE SPECIFIC FILES YOU EXPECT TO CHANGE — keeps the AI focused]
- e.g. `src/components/layout/AppShell.tsx`
- e.g. `src/pages/DashboardPage.tsx`
- e.g. `src/index.css`

## Constraints / design direction
[ANY SPECIFIC DESIGN CONSTRAINTS — or delete this block if none]
- e.g. "Dark mode only, keep the existing sidebar color palette"
- e.g. "Match the mockup I described; do not change any API calls or
  state management hooks"

## Do NOT change
- Any `.ts` / `.tsx` file under `backend/`
- Any API service calls in `src/services/`
- Any context providers in `src/contexts/`
- Any hook logic in `src/hooks/`
- Route definitions in `src/App.tsx`
- `docker-compose.yml`, `CLAUDE.md`, `docs/`, deploy scripts

Begin by confirming the files you will touch and the approach you will
take, then proceed.
```

---

## 🔴 SESSION END PROMPT

```
This session is wrapping up. Please do the following before we close:

1. **Summary of changes made**
   List every file you modified (path + one-line description of what changed).

2. **What is working**
   Briefly describe what is visually/functionally complete after this session.

3. **What is still pending / broken**
   List anything unfinished, any known visual regressions, or any TODO
   comments you left in the code.

4. **Recommended next session start**
   Write 1–3 sentences I can paste at the top of the next START PROMPT's
   "Current session goal" field so the next session picks up exactly where
   we left off.

5. **Build check**
   Run `npm run typecheck` from `frontend/` and report the result.
   If there are errors, fix them now before summarising.
```

---

## 📝 Quick-start checklist (before every session)

- [ ] Confirm you are on branch `ui/adam-redesign`
  (`git branch --show-current`)
- [ ] Pull latest changes if you paused for more than a day
  (`git pull origin ui/adam-redesign`)
- [ ] Dev server is running: `cd frontend && npm run dev` (port 5173)
- [ ] Fill in the `[bracketed]` fields in the START PROMPT
- [ ] Paste the complete START PROMPT as the first message of the session

## 📝 Quick-end checklist (after every session)

- [ ] Paste the END PROMPT as the last message
- [ ] Copy the "Recommended next session start" text into a note / this file
- [ ] Commit work-in-progress: `git add -A && git commit -m "wip: [short description]"`
- [ ] Push: `git push origin ui/adam-redesign`

---

## 🗂 Last session recap
*(Update this block after every END PROMPT so you always know where you left off)*

**Date:** —
**Completed:** —
**Pending:** —
**Next goal:** —
