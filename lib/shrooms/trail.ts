import type { Channel, InstructionCard, InstructionAction } from '@/lib/types';

/**
 * Where a shroom reaches, in the order it reaches there.
 *
 * The first sketch of this lit columns blue for "reads" and green for "writes", which
 * is a lie for a good share of real shrooms: `steps` means a shroom can touch three
 * columns in sequence, `target: board` means all of them, `report` writes to an email
 * and no column at all, and a `generate` that isn't auto-approved lands in the review
 * bucket rather than on the column. Two colours cannot say any of that.
 *
 * So a trail is an ordered list of stops, and destinations that aren't columns get to
 * be stops too. A map you cannot trust is worse than no map — that is the lesson of
 * the graph view this replaces.
 */

export interface TrailStop {
  /** Column the stop lands on, or null for somewhere off the board. */
  columnId: string | null;
  columnName: string | null;
  /** What happens here, in the words a person uses. */
  verb: string;
  /** A destination that isn't a column. */
  offBoard?: 'report' | 'review';
}

export interface ShroomTrail {
  stops: TrailStop[];
  /** Columns read only for context — not acted on. */
  readsColumnIds: string[];
  /** True when it reads the whole board, which is drawn as one wash rather than lit columns. */
  readsEverything: boolean;
  /**
   * The shroom's behaviour depends on a judgement it makes per card, so the trail is
   * what it *may* do rather than what it will. Stated in words, because a drawing
   * cannot show a conditional.
   */
  conditional: boolean;
}

const ACTION_VERB: Record<InstructionAction, string> = {
  generate: 'adds new cards',
  modify: 'rewrites cards',
  move: 'moves cards here',
  report: 'writes a report',
  build: 'builds an app',
};

/**
 * Words that mean the shroom decides per card.
 *
 * A heuristic on the instructions, deliberately: there is no field for this, and
 * saying "may" when it always acts is a much smaller error than drawing a certainty
 * that isn't there.
 */
const CONDITIONAL_HINTS = /\b(if|when it|only|unless|where the|those that|any that|should it)\b/i;

function columnName(channel: Channel | undefined, columnId: string): string | null {
  return channel?.columns.find((c) => c.id === columnId)?.name ?? null;
}

/**
 * Build the trail for a shroom.
 *
 * `steps` wins when present — it is the explicit sequence, and the top-level action is
 * then only a summary of it. Otherwise the single action against the target is the
 * whole trail.
 */
export function buildShroomTrail(
  shroom: InstructionCard,
  channel: Channel | undefined
): ShroomTrail {
  const stops: TrailStop[] = [];

  const pushColumnStop = (columnId: string, action: InstructionAction, description?: string) => {
    // A generate that goes to review has a different destination than one that doesn't,
    // and saying "adds new cards here" of a card you still have to approve is wrong.
    const toReview = action === 'generate' && !shroom.autoApprove;
    stops.push({
      columnId,
      columnName: columnName(channel, columnId),
      verb: description?.trim() || ACTION_VERB[action],
      ...(toReview ? { offBoard: 'review' as const } : {}),
    });
  };

  if (shroom.steps && shroom.steps.length > 0) {
    for (const step of shroom.steps) {
      if (step.action === 'report') {
        stops.push({
          columnId: null,
          columnName: null,
          verb: ACTION_VERB.report,
          offBoard: 'report',
        });
        continue;
      }
      pushColumnStop(step.targetColumnId, step.action, step.description);
    }
  } else if (shroom.action === 'report') {
    stops.push({ columnId: null, columnName: null, verb: ACTION_VERB.report, offBoard: 'report' });
  } else {
    const target = shroom.target;
    if (target.type === 'column') {
      pushColumnStop(target.columnId, shroom.action);
    } else if (target.type === 'columns') {
      for (const columnId of target.columnIds) pushColumnStop(columnId, shroom.action);
    } else {
      // Board-wide. One stop with no column, so it isn't drawn as every column at once.
      stops.push({ columnId: null, columnName: null, verb: `${ACTION_VERB[shroom.action]} anywhere on the board` });
    }
  }

  // Context: what it reads but does not change. Columns it acts on are already
  // accounted for by a stop, so listing them again would double-colour them.
  const actedOn = new Set(stops.map((s) => s.columnId).filter((id): id is string => !!id));
  const context = shroom.contextColumns;
  const readsEverything = !context || context.type === 'all';
  const readsColumnIds =
    context && context.type === 'columns'
      ? context.columnIds.filter((id) => !actedOn.has(id))
      : [];

  return {
    stops,
    readsColumnIds,
    readsEverything,
    conditional: CONDITIONAL_HINTS.test(shroom.instructions ?? ''),
  };
}

/** One line describing the whole trail, for the row's status line and the mobile sheet. */
export function describeTrail(trail: ShroomTrail): string {
  if (trail.stops.length === 0) return 'does nothing on this board';
  const parts = trail.stops.map((s) => {
    const where = s.columnName ? ` · ${s.columnName}` : '';
    return `${s.verb}${where}`;
  });
  const sentence = parts.join(', then ');
  return trail.conditional ? `may ${sentence}` : sentence;
}
