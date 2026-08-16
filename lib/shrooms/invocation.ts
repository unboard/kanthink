import type {
  Channel,
  InstructionCard,
  InstructionTarget,
  ShroomCapabilities,
  ShroomInputRequirements,
} from '@/lib/types';

/**
 * A shroom knows what to do. An invocation says what to do it to.
 *
 * Keeping those apart is the whole point: the same shroom is reached from a card thread,
 * a multi-select, a schedule, and a chain, and it has to mean the same thing in all four.
 * Anything that varies per run lives here, never on the shroom — the test being that
 * moving a shroom to another column must not change what its instructions mean.
 *
 * This is a value, not a record. Run history already lives in three places that work
 * (`executionHistory` on the shroom, `InstructionRun` for undo, `reviewRunId` grouping
 * the cards one run produced); a fourth would be bookkeeping without a new capability.
 */

/** Where a run came from. Used to describe the scope, not to change behaviour. */
export type InvocationSource =
  | 'manual'
  | 'thread'
  | 'selection'
  | 'schedule'
  | 'event'
  | 'chain';

export type ScopeKind = 'card' | 'selection' | 'column' | 'board' | 'none';

export interface ShroomScope {
  /** The cards this run acts on, already resolved. */
  cardIds: string[];
  kind: ScopeKind;
  /** Column names behind the scope, when it came from columns. */
  columnNames?: string[];
}

export interface Invocation {
  shroom: InstructionCard;
  scope: ShroomScope;
  source: InvocationSource;
}

/**
 * Capabilities to apply to a run.
 *
 * Unset means unrestricted, deliberately. The old behaviour — infer from the prose —
 * failed in both directions, and the failure that hurt was the false negative: a
 * prohibition reaching the model because the user's sentence lacked a keyword. An
 * un-narrowed ceiling can't produce that. What the shroom actually does is still
 * governed by its instructions.
 */
export function resolveCapabilities(shroom: Pick<InstructionCard, 'capabilities'>): ShroomCapabilities {
  return (
    shroom.capabilities ?? { tasks: true, tags: true, properties: true, assignment: true }
  );
}

/**
 * The natural minimum for an action, when a shroom hasn't declared one.
 *
 * `report` reads a set and writes one digest across it, so a single card leaves it
 * nothing to weigh. `generate` writes new cards and doesn't need any input — pointing it
 * at a card is still useful, the card just becomes a seed. Everything else transforms the
 * cards it's given, so it needs at least one.
 */
function defaultMinCards(action: InstructionCard['action']): number {
  if (action === 'report') return 2;
  if (action === 'generate') return 0;
  return 1;
}

export function resolveInputRequirements(
  shroom: Pick<InstructionCard, 'action' | 'inputRequirements'>
): ShroomInputRequirements {
  return shroom.inputRequirements ?? { minCards: defaultMinCards(shroom.action) };
}

/**
 * Why this shroom can't run on the cards it's being offered, in a sentence — or null
 * when it can.
 *
 * Derived from what the shroom declares rather than switched on its action, so a shroom
 * that needs a set for reasons of its own ("rank these against each other") is refused
 * for the reason its author gave, not for a reason hardcoded here.
 */
export function explainScopeConflict(
  shroom: Pick<InstructionCard, 'title' | 'action' | 'inputRequirements'>,
  cardCount: number
): string | null {
  const { minCards, reason } = resolveInputRequirements(shroom);
  if (cardCount >= minCards) return null;
  if (reason?.trim()) return reason.trim();

  const need = minCards === 1 ? 'at least one card' : `at least ${minCards} cards`;
  const got = cardCount === 0 ? 'none' : cardCount === 1 ? 'one' : `${cardCount}`;
  return `“${shroom.title}” needs ${need} to work on, and this run has ${got}.`;
}

/** Whether pointing this shroom at a single card is a meaningful thing to ask for. */
export function canRunOnSingleCard(
  shroom: Pick<InstructionCard, 'title' | 'action' | 'inputRequirements'>
): boolean {
  return explainScopeConflict(shroom, 1) === null;
}

/** The cards a target resolves to, when nothing narrower was supplied. */
export function cardIdsForTarget(target: InstructionTarget, channel: Channel): string[] {
  const columnIds =
    target.type === 'column'
      ? [target.columnId]
      : target.type === 'columns'
        ? target.columnIds
        : channel.columns.map((c) => c.id);
  return columnIds.flatMap((id) => channel.columns.find((c) => c.id === id)?.cardIds ?? []);
}

/**
 * What the scope's cards are *for* in this run.
 *
 * The same set of cards means different things per action: modify transforms them, report
 * reads them, generate treats them as a starting point. Saying "apply the instructions to
 * these cards" would be wrong for the last two.
 */
export type ScopeRole = 'transform' | 'read' | 'seed';

const ROLE_SENTENCE: Record<ScopeRole, string> = {
  transform: 'Apply them to the cards in this run and nothing else.',
  read: 'Base your answer on the cards in this run and nothing else.',
  seed: 'Treat them as the starting point for what you create, not as a set to work through.',
};

/**
 * The scope section handed to the model.
 *
 * The second sentence is the one that matters. A shroom's instructions were often written
 * while thinking about one column ("write a PRD for everything in Inbox"), and the same
 * shroom now gets invoked on a single card from a thread. Without this, the model reads a
 * column-wide instruction while holding one card and is left to infer the narrowing from
 * the absence of the others.
 */
export function describeScope(scope: ShroomScope, role: ScopeRole = 'transform'): string {
  const count = scope.cardIds.length;
  const cards = count === 1 ? '1 card' : `${count} cards`;

  let opening: string;
  switch (scope.kind) {
    case 'card':
      opening = 'This run is scoped to the single card below.';
      break;
    case 'selection':
      opening = `This run is scoped to the ${cards} below — a selection, not a whole column.`;
      break;
    case 'column': {
      const where = scope.columnNames?.length ? scope.columnNames.join(', ') : 'the target columns';
      opening = `This run covers ${cards} — everything currently in ${where}.`;
      break;
    }
    case 'board':
      opening = `This run covers ${cards} across the whole board.`;
      break;
    default:
      opening = 'This run has no input cards.';
  }

  return `## Scope\n${opening}\nIf the instructions below name a column or say "all cards", that describes where this shroom usually runs, not what it was handed now. ${ROLE_SENTENCE[role]}`;
}
