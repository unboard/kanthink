/**
 * Shared fixture for the "where do shrooms live inside a channel" round.
 *
 * The problem being explored: today a channel gives no sign that shrooms exist. They
 * live in a global left-nav panel, so from inside a board you have to already know to
 * go looking. Every option here puts them in the channel — the difference is *where*,
 * and what that costs the board.
 *
 * Each option is scored against the same board, the same five shrooms. Five is the
 * honest number: one or two would flatter every layout, twenty would flatter none.
 */

export type ShroomAction = 'generate' | 'modify' | 'move' | 'report';
export type ShroomState = 'watching' | 'scheduled' | 'manual';

export interface DemoShroom {
  id: string;
  title: string;
  /** One sentence, written for the person scanning the board — not the model. */
  blurb: string;
  action: ShroomAction;
  state: ShroomState;
  /** "New card in Inbox", "Mondays 07:00", or null when it only runs on demand. */
  trigger: string | null;
  /** Column it reads from, if any. */
  watches: string | null;
  /** Column it drops cards into, if it moves things. */
  movesTo: string | null;
  lastRun: string | null;
  /** Can it act on one card in isolation? Drives the on-card options. */
  cardScoped: boolean;
}

export interface DemoCard {
  id: string;
  title: string;
  meta?: string;
  /** Marks the card as freshly touched by a shroom, for the options that show that. */
  touchedBy?: string;
}

export interface DemoColumn {
  id: string;
  name: string;
  cards: DemoCard[];
}

export const COLUMNS: DemoColumn[] = [
  {
    id: 'inbox',
    name: 'Inbox',
    cards: [
      { id: 'c1', title: 'Pretext — pure arithmetic text layout', meta: 'Link · 2h', touchedBy: 'analyzer' },
      { id: 'c2', title: 'The cost of a context switch, measured', meta: 'Link · 5h' },
      { id: 'c3', title: 'Why spreadsheets beat most internal tools', meta: 'Note · 1d' },
      { id: 'c4', title: 'Local-first CRDTs, three years on', meta: 'Link · 1d' },
    ],
  },
  {
    id: 'like',
    name: 'Like',
    cards: [
      { id: 'c5', title: 'Small teams, long feedback loops', meta: 'Link · 3d' },
      { id: 'c6', title: 'Interface as a place, not a page', meta: 'Note · 4d' },
    ],
  },
  {
    id: 'dislike',
    name: 'Dislike',
    cards: [{ id: 'c7', title: '10 AI tools that will 10x your day', meta: 'Link · 6d' }],
  },
  {
    id: 'week',
    name: 'This Week',
    cards: [
      { id: 'c8', title: 'Draft the layout note', meta: 'Task · due Fri' },
      { id: 'c9', title: 'Reply to the CRDT thread', meta: 'Task · due Wed' },
    ],
  },
];

export const SHROOMS: DemoShroom[] = [
  {
    id: 'analyzer',
    title: 'Inbox Analyzer',
    blurb: 'Reads every link that lands in Inbox and writes the TL;DR onto the card.',
    action: 'modify',
    state: 'watching',
    trigger: 'New card in Inbox',
    watches: 'inbox',
    movesTo: null,
    lastRun: '2h ago',
    cardScoped: true,
  },
  {
    id: 'triage',
    title: 'Weekly Triage',
    blurb: 'Pulls anything worth acting on out of Inbox and into This Week.',
    action: 'move',
    state: 'scheduled',
    trigger: 'Mondays 07:00',
    watches: 'inbox',
    movesTo: 'week',
    lastRun: '3d ago',
    cardScoped: true,
  },
  {
    id: 'digest',
    title: 'Monday Digest',
    blurb: 'Summarises what moved last week into one card, then emails it.',
    action: 'report',
    state: 'scheduled',
    trigger: 'Mondays 07:00',
    watches: null,
    movesTo: null,
    lastRun: '3d ago',
    cardScoped: false,
  },
  {
    id: 'dedupe',
    title: 'Dedupe the inbox',
    blurb: 'Finds links you already saved and files the second copy under Dislike.',
    action: 'move',
    state: 'manual',
    trigger: null,
    watches: 'inbox',
    movesTo: 'dislike',
    lastRun: 'yesterday',
    cardScoped: true,
  },
  {
    id: 'finder',
    title: 'Find me five more',
    blurb: 'Looks at what you liked and brings back five things in the same vein.',
    action: 'generate',
    state: 'manual',
    trigger: null,
    watches: 'like',
    movesTo: 'inbox',
    lastRun: null,
    cardScoped: false,
  },
];

export const STATE_COLOR: Record<ShroomState, string> = {
  watching: '#4ade80',
  scheduled: '#60a5fa',
  manual: '#a1a1aa',
};

export const STATE_LABEL: Record<ShroomState, string> = {
  watching: 'Watching',
  scheduled: 'Scheduled',
  manual: 'On demand',
};

export const ACTION_LABEL: Record<ShroomAction, string> = {
  generate: 'Generates',
  modify: 'Enriches',
  move: 'Moves',
  report: 'Reports',
};

/** Every option gets the same handle on running state, so they behave alike. */
export interface OptionProps {
  shrooms: DemoShroom[];
  runningId: string | null;
  onRun: (s: DemoShroom) => void;
  onOpen: (s: DemoShroom) => void;
}
