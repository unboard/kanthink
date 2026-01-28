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

## Working rules for Claude Code
- Ask one clarifying question only when truly blocked; otherwise pick sensible defaults.
- Prefer building small vertical slices end-to-end.
- Keep dependencies minimal.
- Keep the UI clean and fast.

## First build slice (do first)
- Channel list (left nav) + create channel
- Active channel board view with default columns
- Add/move/delete cards
- Channel settings with AI instructions + "Generate cards" button (stubbed data OK)
