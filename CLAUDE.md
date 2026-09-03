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

## Core objects
- Board: contains channels; left nav selects active channel
- Channel: a goal/domain with agent instructions + fetch settings
- Column: standard Kanban column; optional column instructions
- Card: created manually or by AI; movable across columns
- Instruction card: a reusable prompt that lives on a channel and can be run on demand
- Shroom: an automation — trigger + steps, with safeguards and loop prevention.
  Actions: `generate` | `modify` | `move` | `report` | `build`. A `build` shroom runs
  the playground generator against a card, using the card's own thread as the brief —
  which is what lets a chain of shrooms enrich a card and assemble an app at the end.
  It builds into the card's existing app when there is one, rather than adding another.
- Task: a checklist item on a card

Default column names live in `lib/constants.ts` (Inbox, Like, Dislike, This Week).

## What exists now

Kanthink is well past MVP. A rough map of the surfaces, so you don't rebuild something that ships:

- **Board** — channels, folders, columns, cards, tasks, tags, search, bulk actions, list/focus views, card detail drawer with threads
- **Shrooms** (`app/shrooms`, `lib/shrooms/*`) — the automation engine: triggers, scheduled + event runs, run history, graph view, summaries, learning from rejections. Arguably the centre of the product; nothing else here is as load-bearing.
- **Instruction cards** — per-channel reusable prompts, with guide/suggest/chat flows and learnings
- **AI surfaces** — channel chat, card chat, operator chat, task chat, voice (live + transcribe + TTS), image generation
- **Apps / playground** (`components/playground`, `app/api/playground/*`) — generates single-file React apps that hang off a card as artifacts, listed under its tasks on the Apps tab. Many per card; each row in `playground_apps` owns its own code, thread, model choice, design notes and share token, and publishes at `/play/{token}`. The source card seeds the **first** build only (its thread and tasks go in as the brief); every build after that reads the app's own thread plus the current code. Talking in that thread is ordinary chat with Kan and never touches the code — building is the explicit Update app action. Libraries resolve through `lib/playground/runtime.ts` — **every declaration must go through `resolveDeps`**, because resolved URLs are interpolated into the iframe's import map.
- **Sharing & multi-user** — orgs, folder/channel shares with owner/editor/viewer roles, invite links, presence, notifications (all realtime via Pusher)
- **Publishing** — public card pages (`/p`), digests + newsletters, Customer.IO email
- **Billing** — Stripe checkout + webhooks, usage records, BYOK
- **Record studio** (`app/record`) — screen/audio recording, gallery, sharing
- **Games** — `/catlife`, `/wildwood`, `/rescue`. Personal side projects for the user's family, not Kanthink features. Leave them alone unless asked directly.

`app/prototypes` holds live UI experiments. Nothing in there ships.

## Testing

`npm test` runs vitest (`tests/`). The suite is small but load-bearing — it guards schema
migrations, product-update prompt rules, and a good chunk of shroom behaviour. Run it before
you deploy.

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

## CRITICAL: Deployment (git push does NOT deploy)

**`git push` only updates GitHub history.** Vercel's "Ignored Build Step" is set to
"Don't build anything", so pushing does not put anything on the live site. If you push and
walk away, you have not shipped.

Deploys happen **only** via the CLI, and only when the user asks for one:

```bash
vercel deploy --prod --yes
```

The user signals this with a reusable **Deploy card** (id: `deploy-toggle`) dragged into
"Do these". See `.claude/commands/kan.md` for the full deploy-card protocol. If no Deploy
card is present, do not deploy — commit and push, and say plainly that the work is on
GitHub but not live.

After a deploy completes, say **"Deployed"**.

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

## Bug/Feature Workflow

The user logs bugs and features as cards from their phone, into the **Work** channel. Use the
`/kan` slash command to read and implement them — see `.claude/commands/kan.md` for the full
workflow, including the deploy-card protocol.

The driver script is `scripts/kan.ts` (list / `--move` / `--note` / `--tag` / `--untag` /
`--create`, plus `--channel` to point it at another channel).

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
