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
    id: 'record-survives-tab-switch',
    date: '2026-08-18',
    kind: 'fix',
    title: 'Recordings no longer freeze when you switch to the window you shared',
    body: 'Kan Record captured a still image for any take where you left the studio tab to work in the window you were sharing — which is most of them. It now keeps capturing while the tab is in the background, and warns you during the take if frames ever stop arriving instead of letting you find out on playback.',
  },
  {
    id: 'design-studio-postcard',
    date: '2026-08-17',
    kind: 'capability',
    title: 'Design print pieces at /design',
    body: 'Describe a 9" × 6" postcard, drop in your logo or a design you like, and get print-ready artwork back. Front and back are designed against the same brief, so the back matches the front instead of looking like a different piece, and the address side keeps the postal regions clear. Keep typing to change what you got.',
  },
  {
    id: 'shroom-map',
    date: '2026-08-16',
    kind: 'capability',
    title: 'See the shape of your automations',
    body: 'A map of your shrooms — one per board, and one showing every board at once. Colour says how each one starts: watching a column, on a schedule, or only when you run it. Lines show what feeds what, and a line turns red when the shroom downstream needs more cards than the one upstream can produce, which you could previously only discover by running it. Drag from a shroom\'s right dot onto another to chain them, or onto empty space to unchain.',
  },
  {
    id: 'shrooms-portable-scope-and-capabilities',
    date: '2026-08-16',
    kind: 'capability',
    title: 'Shrooms are portable now — write what to do, not which cards',
    body: 'A shroom no longer guesses what it may do by scanning its own instructions for words like "task" or "label", which is why "break this into steps" used to produce nothing. Tasks, tags, properties and assignment are settings you can see and change, and a shroom can declare it needs more than one card so a run that makes no sense is refused with a reason instead of quietly doing something odd. Write instructions about the card, not the column — the column is already a setting, and the same shroom now runs correctly from a thread, a selection, or a schedule.',
  },
  {
    id: 'slash-shrooms-in-card-thread',
    date: '2026-08-15',
    kind: 'workflow',
    title: 'Type / in a card thread to reach for a shroom',
    body: 'Start a message with a slash and you get a command list; /shrooms then lists the channel\'s shrooms. Picking one drops it into the thread as a card you can run on this card, open, or remove — without leaving the conversation. A shroom that can\'t act on a single card says so in a sentence instead of running and doing nothing.',
  },
  {
    id: 'shroom-web-ability',
    date: '2026-08-15',
    kind: 'capability',
    title: 'Shrooms can be sent to the web on purpose',
    body: 'A shroom now has a Web setting — Auto, Always, or Off — plus an optional line saying what to look for. Before, research only happened if your instructions happened to mention links or articles; now you can ask for it outright, or switch it off. A report shroom with Web on becomes a research mission: it goes and looks something up, then writes what it found back to the board.',
  },
  {
    id: 'shroom-model-selection',
    date: '2026-08-15',
    kind: 'capability',
    title: 'Pick which model a shroom runs on',
    body: 'Each shroom can be pinned to a specific model in its advanced settings, listed by provider. Use a cheap fast model for a tidy-up shroom and your best one for the shroom that writes. It needs a key for that provider — without one, the run quietly falls back to your default rather than failing.',
  },
  {
    id: 'shroom-run-posts-to-card-thread',
    date: '2026-08-15',
    kind: 'workflow',
    title: 'Running a shroom on a card leaves a record on the card',
    body: 'Running a shroom against a card used to be silent — things changed and nothing said why. The shroom now appears in that card\'s thread, with Run again, Open and Delete on it, so the run is part of the card\'s history and the same shroom is one tap away.',
  },
  {
    id: 'shrooms-trigger-on-ai-made-cards',
    date: '2026-08-14',
    kind: 'automation',
    title: 'Automatic shrooms now fire on AI-made cards too',
    body: 'A card a shroom had generated could never set off an automatic shroom again — drag one into a watched column and nothing happened, silently. Any card you move now triggers whatever is watching that column; the only thing a shroom still skips is a card it created itself. Cards run this way also show a working indicator while it happens, and the board updates the moment it finishes.',
  },
  {
    id: 'playground-generation-headroom-and-honest-errors',
    date: '2026-08-13',
    kind: 'fix',
    title: 'Bigger playground apps, and errors that say what actually happened',
    body: 'Long generations had well under half the time they can now use, and apps that outgrew one response were cut off. Both have much more room. Failures also used to be reported as "took too long and timed out" no matter the real cause — you now get the actual reason, so a real timeout means a real timeout.',
  },
  {
    id: 'gemini-3-7-flash-in-playground',
    date: '2026-08-13',
    kind: 'capability',
    title: 'Gemini 3.7 Flash is available in the playground',
    body: 'Google\'s newest Flash model is in the model picker and in the settings list if you bring your own key. It is markedly better at building web layouts, and Auto now sends cosmetic edits to it instead of Gemini 3 Flash — so small visual tweaks should land right more often, in fewer tries.',
  },
  {
    id: 'shroom-settings-save-and-show-steps',
    date: '2026-08-10',
    kind: 'fix',
    title: 'Shroom settings save, and multi-step shrooms show all their steps',
    body: 'Changing when a shroom runs quietly saved the previous setting instead of the new one, so shrooms set to "when a card lands in" could still be sitting on manual — worth reopening yours to check. Shrooms that do more than one thing, like modify a card and then move it, now show the whole sequence in the drawer and on the board instead of just the first action.',
  },
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
