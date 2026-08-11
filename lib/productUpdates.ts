/**
 * Noteworthy Kanthink updates.
 *
 * The filter is editorial, and deliberately so: an entry earns a place here only if it
 * changes how someone works. The test is whether a user who read nothing else would
 * behave differently tomorrow — a new capability, a new surface, a changed default, a
 * fixed workflow they'd given up on.
 *
 * Do NOT add: visual polish, copy tweaks, refactors, perf work, dependency bumps, or
 * bug fixes in code paths nobody hit. Those are why most changelogs go unread. If
 * you're unsure, leave it out — a short list people trust beats a long one they skim.
 *
 * Newest first. `id` is permanent: the "seen" marker is stored against it, so editing
 * an existing id re-surfaces that entry to everyone.
 */

export type ProductUpdateKind = 'capability' | 'workflow' | 'automation' | 'fix';

export interface ProductUpdate {
  id: string;
  /** ISO date (YYYY-MM-DD) the change reached users. */
  date: string;
  kind: ProductUpdateKind;
  title: string;
  /** One or two sentences: what changed, and what it lets you do now. */
  body: string;
}

export const PRODUCT_UPDATE_KIND_LABELS: Record<ProductUpdateKind, string> = {
  capability: 'New',
  workflow: 'Workflow',
  automation: 'Automation',
  fix: 'Fixed',
};

export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: 'mention-kan-to-get-a-reply',
    date: '2026-08-10',
    kind: 'workflow',
    title: 'Mention Kan when you want him to answer',
    body: 'The Note / Ask Kan toggle is gone. Kan replies when you put @kan in the message and stays out of it otherwise — type it, tap the @kan under the box, or pick him from the @ list, where he is always the first name. Data sources like @mixpanel now only appear on channels that have them connected.',
  },
  {
    id: 'record-pick-your-microphone',
    date: '2026-08-06',
    kind: 'fix',
    title: 'Pick your microphone before you record',
    body: 'The record studio now shows which mic it is using right under the screen and webcam buttons, with a level bar that moves when you talk and a picker for switching devices. Screen-only recordings previously captured no voice at all unless you had turned the webcam on first — that is fixed, and your mic choice is remembered.',
  },
  {
    id: 'open-cards-awaiting-approval',
    date: '2026-08-01',
    kind: 'workflow',
    title: 'Open a card before you approve it',
    body: 'Cards a shroom made now open like any other card, so you can read the whole thread, images and tasks before deciding. The approve and reject buttons move to the bottom of the card, and the quick buttons stay on the board for clearing a run without opening anything.',
  },
  {
    id: 'shrooms-handle-long-cards',
    date: '2026-08-01',
    kind: 'fix',
    title: 'Shrooms now finish on long cards',
    body: 'A shroom running over a long card — a pasted article, a full transcript — used to run out of room mid-answer and quietly record a run that changed nothing, taking its email with it. It now has room to finish, and if a run genuinely can\'t complete you get a notification saying so instead of silence.',
  },
  {
    id: 'ask-kan-whats-new',
    date: '2026-07-31',
    kind: 'capability',
    title: 'Ask Kan what has changed',
    body: 'Kan now knows what has shipped recently, so you can ask "what\'s new?" in chat or out loud in voice mode instead of hunting for a changelog. The full history lives on the system log page.',
  },
  {
    id: 'analytics-breakdowns-and-followups',
    date: '2026-07-31',
    kind: 'capability',
    title: 'Analytics breakdowns, and questions about the answer',
    body: 'Asking for something "by user" or "per category" now reliably returns a table rather than a single total, and you can keep asking about what came back — which order was largest, whose email is on it — without running the query again.',
  },
  {
    id: 'playground-card-tab',
    date: '2026-07-30',
    kind: 'workflow',
    title: 'Playground is now a tab on every card',
    body: 'Build a working app against any card without converting it into a playground first — it sits next to Thread, Tasks and Info, with Build/Preview and publish controls in one bar. It reads the card\'s thread and tasks, so requirements you already wrote down get used.',
  },
  {
    id: 'share-destinations-and-notes',
    date: '2026-07-30',
    kind: 'workflow',
    title: 'Choose where shares land, and add a note',
    body: 'Sharing a link to Kanthink now lets you pick the channel and column and attach a note about why you saved it. Set a default once and it applies from your phone and your desktop.',
  },
  {
    id: 'sticky-column-sort',
    date: '2026-07-30',
    kind: 'fix',
    title: 'Column sort order sticks',
    body: 'Sorting a column newest-first is now a saved rule rather than a one-time shuffle, so new cards — including shared bookmarks — land where you expect instead of at the bottom.',
  },
  {
    id: 'voice-session-history',
    date: '2026-07-30',
    kind: 'workflow',
    title: 'Voice conversations stay up after you stop',
    body: 'Ending an audio session keeps the window open as browsable history, so the cards and drafts it produced are still there to tap through instead of vanishing.',
  },
  {
    id: 'bookmark-shroom-summaries',
    date: '2026-07-24',
    kind: 'automation',
    title: 'Shrooms can work your shared bookmarks',
    body: 'A shroom watching your bookmark inbox now wakes on anything you share to it — summarising the link, tying it into your other channels, and emailing you the digest without you opening the app.',
  },
];

/** The most recent update, or null when the list is empty. */
export function latestProductUpdate(): ProductUpdate | null {
  return PRODUCT_UPDATES[0] ?? null;
}

/**
 * The same list, written for Kan rather than for a panel.
 *
 * Kan is asked "what's new?" in conversation far more often than anyone opens a
 * changelog, so these belong in the prompt. Capped because this rides along on
 * every turn — recent entries are what people mean by "new"; older ones are on
 * the system log page.
 */
export function buildProductUpdateContext(limit = 8): string {
  const entries = PRODUCT_UPDATES.slice(0, limit);
  if (entries.length === 0) return '';

  const lines = entries.map((u) => {
    const label = PRODUCT_UPDATE_KIND_LABELS[u.kind];
    return `- [${u.date}] ${label}: ${u.title} — ${u.body}`;
  });

  return `\n\n## RECENT KANTHINK UPDATES (reference only — do not raise unprompted)

This is background knowledge for answering a question, not a topic to steer toward. Treat it like a manual on the shelf: consult it when asked, otherwise ignore it completely.

DO NOT:
- Open a conversation, or a reply, by mentioning what is new.
- Announce, tease, promote or recommend anything from this list on your own initiative.
- Circle back to it, or work it into an answer about something else.
- Treat a passing mention of a feature as an invitation to list related updates.

DO use it when the user actually asks — "what's new?", "what changed?", "what features were added?", "is X available yet?" — or when they hit a problem that one of these updates directly solves.

${lines.join('\n')}

When you are answering such a question:
- Lead with the ones that change what the user can do, not the fixes.
- Summarize conversationally; never read the list verbatim or recite dates unless asked.
- This list is not exhaustive and only covers recent notable changes. If asked about something not here, say you don't have it in your notes rather than guessing — the full history is on the system log page at /system-log.`;
}

/**
 * Updates newer than the last one the user acknowledged.
 *
 * Position-based rather than date-based: an unrecognised id (an entry that was removed,
 * or a marker from a future build) means we can't place the user in the list, so we
 * show nothing as unseen rather than dumping the whole history back on them.
 */
export function unseenProductUpdates(lastSeenId: string | null): ProductUpdate[] {
  if (!lastSeenId) return PRODUCT_UPDATES;
  const index = PRODUCT_UPDATES.findIndex((u) => u.id === lastSeenId);
  if (index === -1) return [];
  return PRODUCT_UPDATES.slice(0, index);
}
