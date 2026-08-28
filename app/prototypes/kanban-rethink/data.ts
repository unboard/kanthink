/**
 * One board, shared by every concept in this round.
 *
 * It is deliberately in the state a real board reaches after four months: an
 * inbox nobody empties, a Someday column that is really a graveyard, and a
 * handful of things that actually matter buried in the middle. Every concept
 * here is judged on what it does with THIS data — not with a tidy demo board.
 */

export type ColumnId = 'inbox' | 'week' | 'waiting' | 'someday' | 'done';

export const COLUMNS: { id: ColumnId; name: string }[] = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'week', name: 'This week' },
  { id: 'waiting', name: 'Waiting' },
  { id: 'someday', name: 'Someday' },
  { id: 'done', name: 'Done' },
];

export type DemoCard = {
  id: string;
  title: string;
  note?: string;
  column: ColumnId;
  /** Days since anyone touched it. The number a kanban board never shows you. */
  age: number;
  /** Rough bulk, 1–3. Used where cards need to occupy physical space. */
  size: 1 | 2 | 3;
};

export const CARDS: DemoCard[] = [
  // Inbox — the part that only ever grows.
  { id: 'c1', title: 'Reply to Marta about the lease', note: 'She needs an answer before the 6th.', column: 'inbox', age: 3, size: 1 },
  { id: 'c2', title: 'Export the Q2 numbers for Dan', column: 'inbox', age: 1, size: 2 },
  { id: 'c3', title: 'Reply to the school about the trip', column: 'inbox', age: 2, size: 1 },
  { id: 'c4', title: 'Book the dentist', column: 'inbox', age: 11, size: 1 },
  { id: 'c5', title: 'Look into the noise from the boiler', column: 'inbox', age: 19, size: 2 },
  { id: 'c6', title: 'Find a plumber for the upstairs radiator', column: 'inbox', age: 26, size: 2 },
  { id: 'c7', title: 'Chase the invoice from March', note: 'Third time asking.', column: 'inbox', age: 34, size: 1 },
  { id: 'c8', title: 'That podcast someone recommended — find it', column: 'inbox', age: 41, size: 1 },
  { id: 'c9', title: 'Cancel the storage unit', note: '£62 a month for a box of cables.', column: 'inbox', age: 63, size: 1 },
  { id: 'c10', title: 'Renew passport', column: 'inbox', age: 88, size: 2 },
  { id: 'c11', title: 'Sort out the photo backup', column: 'inbox', age: 120, size: 3 },

  // This week — the only column anyone actually reads.
  { id: 'c12', title: 'Finish the pricing deck', note: 'Twelve slides. Eight exist.', column: 'week', age: 0, size: 3 },
  { id: 'c13', title: 'Ship the onboarding fix', column: 'week', age: 1, size: 2 },
  { id: 'c14', title: 'Write the team update', column: 'week', age: 2, size: 1 },
  { id: 'c15', title: 'Call the accountant', column: 'week', age: 4, size: 1 },

  // Waiting — things that are somebody else's problem, held here out of anxiety.
  { id: 'c16', title: 'Quote from the roofer', column: 'waiting', age: 9, size: 1 },
  { id: 'c17', title: 'Approval on the contract', column: 'waiting', age: 16, size: 1 },
  { id: 'c18', title: 'Reply from the council', note: 'Sent in June. Nothing since.', column: 'waiting', age: 45, size: 1 },

  // Someday — a graveyard wearing an optimistic label.
  { id: 'c19', title: 'Take the girls to the observatory', column: 'someday', age: 30, size: 2 },
  { id: 'c20', title: 'Write up the postmortem', column: 'someday', age: 55, size: 2 },
  { id: 'c21', title: 'Read the Bachelard book', column: 'someday', age: 71, size: 1 },
  { id: 'c22', title: 'Rebuild the shed', column: 'someday', age: 96, size: 3 },
  { id: 'c23', title: 'Learn to make sourdough', column: 'someday', age: 140, size: 2 },
  { id: 'c24', title: 'Digitise the tapes', column: 'someday', age: 180, size: 3 },
  { id: 'c25', title: 'Start running again', column: 'someday', age: 210, size: 1 },

  // Done — kept forever, read never.
  { id: 'c26', title: 'Pay the car insurance', column: 'done', age: 5, size: 1 },
  { id: 'c27', title: 'Fix the gate latch', column: 'done', age: 8, size: 1 },
];

export function byColumn(cards: DemoCard[], column: ColumnId) {
  return cards.filter((c) => c.column === column);
}

/** "3d", "5w", "7mo" — age at a glance, in one or two characters. */
export function ageLabel(days: number) {
  if (days === 0) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}
