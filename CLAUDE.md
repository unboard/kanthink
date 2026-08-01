# Project Guidelines for Claude

## Communication Preferences

- **Ask before guessing when decisions affect architecture, data models, or user experience.** For UI layout, naming, and implementation details, pick sensible defaults and proceed. When requirements are unclear or ambiguous, use the `AskUserQuestion` tool to clarify instead of making assumptions.
- Interview the user to understand their intent when:
  - The task has multiple valid interpretations
  - Implementation details aren't specified
  - There are architectural decisions to make
  - The scope or boundaries of a task are unclear

# Kanthink (AI-Driven Kanban Channels) - Project Guide

## One-line summary
A Kanban app where each channel is an AI-assisted, goal-driven space that generates and evolves cards based on user feedback (move, edit, delete).

## Guiding principles
- Kanban first, AI second
- Learning through action, not configuration
- Minimal UI with deep capability
- Calm, intentional, fast

## Kan — the AI personality
- **Kan** is the name of the AI assistant within Kanthink. The mascot is a mushroom character.
- In the UI, refer to the AI as "Kan" (e.g. "Ask Kan", responses labeled "Kan").
- The `KanthinkIcon` component renders the Kan mascot logo.

## Phase 1 goal (MVP)
A single-user Kanban board with channels, columns, cards, and a basic "AI generate cards into Inbox" flow.

## Core objects
- Board: contains channels; left nav selects active channel
- Channel: a goal/domain with agent instructions + fetch settings
- Column: standard Kanban column; optional column instructions
- Card: created manually or by AI; movable across columns; expandable view later

## Phase 1 features (build now)
1. Left navigation
   - list channels
   - create, rename, archive/delete
   - active channel indicator

2. Board + columns
   - default columns: Inbox, Like, Dislike, This Week
   - drag and drop cards between columns
   - create/rename/reorder/delete columns (keep reorder simple if time)

3. Cards
   - create card manually
   - move card between columns (this is feedback)
   - delete card
   - edit title + short content

4. Channel settings (minimal UI)
   - channel name, description
   - status: active/paused
   - AI instructions (freeform)
   - fetch mode: manual only for MVP
   - "Generate cards" button that adds N cards to Inbox

5. AI behavior (MVP)
   - Generate cards using channel instructions + column instructions (optional)
   - No long-term learning yet; just store feedback signals for future

## Instruction Intelligence

The AI is primarily a clarity engine, not just a generator. Its job is to observe how channels are used, infer purpose, and help users clarify and evolve that purpose over time.

### Core Mechanisms

1. **Questions as first-class objects**
   - AI generates clarifying questions based on observed usage patterns
   - Questions appear in channel settings near instructions
   - Each question has a "Why am I being asked this?" context tooltip
   - User can answer, dismiss, or ignore

2. **Instruction refinement**
   - AI can propose changes to channel instructions
   - Changes require user approval (diff view with Apply/Dismiss)
   - Prefer accumulating clarity by appending/refining, not constant rewrites
   - All changes logged in revision history with rollback capability

3. **Drift detection**
   - If channel usage diverges from stated purpose, surface gentle suggestions
   - No hard errors - boards can be playful and messy

4. **Suggestion modes**
   - Off: No AI analysis (default for new users)
   - Manual: "Analyze channel" button in settings
   - Daily: Background analysis runs overnight, surfaces questions next day

### UI Indicators

- Gear icon in channel header shows dot when pending questions exist
- Settings page shows Questions section below instructions
- History section (collapsible) shows instruction revisions

## Phase 2 (later)
- Scheduled/adaptive fetching
- Card full-page view with rich text + comments
- Promote card to channel: Any card can become its own dedicated channel for recursive deep dives
- Email/Newsletter per channel: Prompt-driven digest publishing (not notifications)
- Multi-user real-time collaboration

## Out of scope for initial release
- Complex permissions/roles
- Analytics dashboards
- Marketplace/shared channels
- Native mobile apps

## Deployment

**Deploy by pushing to git.** Vercel auto-deploys from the `main` branch.

```bash
git push
```

Do NOT use the Vercel CLI (`vercel --prod`). The repo is connected to Vercel via GitHub integration - every push to `main` triggers an automatic deployment.

## Working rules for Claude Code
- Ask one clarifying question only when truly blocked; otherwise pick sensible defaults.
- Prefer building small vertical slices end-to-end.
- Keep dependencies minimal.
- Keep the UI clean and fast.

## CRITICAL: Database Schema Changes (DO NOT SKIP MIGRATIONS)

When adding columns to any table in `lib/db/schema.ts`, you **MUST** also add a corresponding `ALTER TABLE` statement to `lib/db/migrations.mjs`. The Turso database is not auto-migrated — Drizzle generates explicit column lists in SELECT queries, so missing columns crash ALL queries on that table.

**Checklist for every schema change:**
1. Add column to `lib/db/schema.ts`
2. Add `ALTER TABLE <table> ADD <column> <type> [DEFAULT <value>]` to the `ALTER_STATEMENTS` array in `lib/db/migrations.mjs`
3. Run `npm test` — the schema migration guard fails if step 2 was missed

That's it. You do **not** need to touch `ensure-schema.ts` or add `ensureSchema()` calls to routes.

### How migrations run

`lib/db/migrations.mjs` is the single source of truth for all DDL. Two things consume it:

- **`scripts/migrate.mjs`** — the real mechanism. Wired into `npm run build`, so Vercel applies migrations *before* the new deployment serves traffic. It fails the build if a migration errors, or if any migrated column is missing afterwards.
- **`ensureSchema()`** — a fallback for local dev and drifted databases. It runs at request time.

**Why the deploy step exists:** `auth()` uses a database session strategy, so it reads the `users` table, and in almost every route `auth()` runs *before* `ensureSchema()`. Request-time migration therefore had a cold-start window where Drizzle SELECTed a column that didn't exist yet, breaking every query on the table. Migrating before traffic arrives removes the race. Don't move migration back to request time.

## CRITICAL: Mobile Drag-and-Drop (DO NOT BREAK)

The Kanban card drag-drop uses `@dnd-kit` with specific configuration that **must not change**:

### Sensors (Board.tsx)
- **MouseSensor** for desktop (distance: 8px to activate)
- **TouchSensor** for mobile (250ms long-press to activate)
- **DO NOT use PointerSensor** - it responds to touch-synthesized pointer events and hijacks touch, breaking mobile scroll

### Card CSS (Card.tsx)
- `touch-manipulation` when not dragging (allows scroll in any direction)
- `touch-none` when isDragging (prevents scroll interference during drag)

### Mobile behavior
- Swipe = scroll (horizontal or vertical)
- Long-press 250ms = drag activates

### Why this matters
PointerSensor + touch-manipulation = broken (drag activates on swipe, can't scroll)
PointerSensor + touch-none = broken (can't scroll at all)
MouseSensor + TouchSensor + touch-manipulation = works (proper long-press to drag)

## First build slice (do first)
- Channel list (left nav) + create channel
- Active channel board view with default columns
- Add/move/delete cards
- Channel settings with AI instructions + "Generate cards" button (stubbed data OK)

## Bug/Feature Workflow

The user logs bugs and features as cards in a Kanthink channel from their phone. Use the `/bugs` slash command to read and implement them. See `.claude/commands/bugs.md` for the full workflow.

## System Log (product updates)

`lib/productUpdates.ts` is the changelog. It feeds two things: the `/system-log` page, and Kan's own knowledge — the most recent entries are injected into the system prompt on every AI surface, so Kan can answer "what's new?" in chat and in voice.

**After shipping, ask one question: would someone who read nothing else behave differently tomorrow?** If yes, add an entry. If no, don't. That is the whole test.

Add an entry for:
- A new capability, or a new surface to work in
- A changed default that alters how something behaves
- A workflow that was broken or missing and now works

Do **not** add an entry for:
- Visual polish, copy tweaks, refactors, perf work, dependency bumps
- Bug fixes in paths nobody hit, or fixes to something shipped the same day
- Prototypes and anything behind `/prototypes` — those aren't shipped
- Internal work with no user-visible surface (migrations, logging, tests, error handling)

Most commits do not earn an entry. A short list people trust beats a long one they skim — when unsure, leave it out.

### Writing an entry

```ts
{
  id: 'stable-kebab-case-id',   // permanent — see below
  date: '2026-07-31',           // ISO date it reached users, not the commit date
  kind: 'capability',           // capability | workflow | automation | fix
  title: 'Short, in plain language',
  body: 'One or two sentences: what changed, and what it lets you do now.',
}
```

- **Newest first.** Add to the top of the array.
- **`id` is permanent.** The "seen" marker is stored against it, so editing an existing id re-surfaces that entry to everyone. Never reuse or rewrite one.
- Write the `title` and `body` for the user, not the changelog. Say what they can now do, not what was refactored.
- Kan is given the most recent 8 entries; everything older lives on `/system-log` only. That cap exists because this rides along on every AI turn — keep entries tight.

### Kan's use of it

Kan treats the list as reference material only and must never raise it unprompted — no announcing, teasing or steering conversation toward what's new. This matters most in voice mode, where a chatty model will otherwise turn a conversation into a changelog reading. The prompt in `buildProductUpdateContext()` enforces this, and `tests/product-updates.test.ts` guards it. If you edit that prompt, keep the "do not raise unprompted" block.
