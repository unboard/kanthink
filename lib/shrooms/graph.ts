import type { Channel, EventTrigger, InstructionCard, ScheduledTrigger } from '@/lib/types';
import { resolveCapabilities, resolveInputRequirements } from './invocation';

/**
 * The shape of a set of shrooms, as something you can draw.
 *
 * This is deliberately a model, not a picture: layout, reachability and every warning
 * are computed here and tested here, so the canvas only has to place what it's given.
 *
 * What makes a graph worth drawing at all is that the pieces were pulled apart. A shroom
 * declares what it needs (`minCards`) and what it may do; a chain declares what feeds
 * what. Those are ports and edges — and a mismatch between them is a broken wire you can
 * see, where today it's a sentence that appears only after you press Run.
 */

export type NodeWarning =
  | { kind: 'unreachable'; detail: string }
  | { kind: 'arity'; detail: string }
  | { kind: 'cycle'; detail: string }
  | { kind: 'dangling-chain'; detail: string };

export type EntryKind = 'schedule' | 'column' | 'manual';

export interface GraphNode {
  id: string;
  shroom: InstructionCard;
  /** Channel this shroom belongs to, when known. Absent for a global shroom. */
  channelName?: string;
  /** How a run of this node starts, when it isn't started by another node. */
  entry: EntryKind;
  /** Human phrase for the entry — "Every day at 09:00", "Inbox". */
  entryLabel: string | null;
  /** Horizontal band: 0 for entry points, +1 for each chain hop. */
  depth: number;
  /** Vertical slot within the band. */
  row: number;
  /** Whether anything at all can start this node. */
  reachable: boolean;
  warnings: NodeWarning[];
}

export interface GraphEdge {
  from: string;
  to: string;
  /** True when the downstream shroom can't be satisfied by what flows into it. */
  broken: boolean;
  label?: string;
}

export interface ShroomGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Width of the widest band, for sizing the canvas. */
  columns: number;
  rows: number;
}

const INTERVAL_LABEL: Record<string, string> = {
  hourly: 'Every hour',
  every4hours: 'Every 4 hours',
  daily: 'Every day',
  weekly: 'Every week',
};

const DAY = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function describeEntry(
  shroom: InstructionCard,
  channel: Channel | undefined
): { entry: EntryKind; entryLabel: string | null } {
  const triggers = shroom.triggers ?? [];
  const event = triggers.find((t) => t.type === 'event') as EventTrigger | undefined;
  const scheduled = triggers.find((t) => t.type === 'scheduled') as ScheduledTrigger | undefined;

  if (shroom.isEnabled && event) {
    const name = channel?.columns.find((c) => c.id === event.columnId)?.name ?? 'a column';
    return { entry: 'column', entryLabel: name };
  }
  if (shroom.isEnabled && scheduled) {
    const base = INTERVAL_LABEL[scheduled.interval] ?? 'On a schedule';
    if (scheduled.interval === 'weekly' && scheduled.dayOfWeek !== undefined) {
      return {
        entry: 'schedule',
        entryLabel: `${DAY[scheduled.dayOfWeek]}${scheduled.specificTime ? ` at ${scheduled.specificTime}` : ''}`,
      };
    }
    if (scheduled.specificTime && (scheduled.interval === 'daily' || scheduled.interval === 'weekly')) {
      return { entry: 'schedule', entryLabel: `${base} at ${scheduled.specificTime}` };
    }
    return { entry: 'schedule', entryLabel: base };
  }
  return { entry: 'manual', entryLabel: null };
}

/**
 * How many cards a shroom hands on to whatever it chains into.
 *
 * `generate` produces its configured count. `modify` and `move` pass along what they were
 * given, which we can't know statically — so this is a lower bound used only to catch the
 * case that is always wrong: a downstream shroom needing several cards fed by one that
 * can only ever produce one.
 */
function guaranteedOutput(shroom: InstructionCard): number | null {
  if (shroom.action === 'generate') return shroom.cardCount ?? 5;
  if (shroom.action === 'report') return 1;
  return null; // pass-through: unknowable without a run
}

/**
 * Build the drawable graph.
 *
 * Depth is assigned by walking chains forward from every node that isn't the target of
 * one. A node inside a cycle is never reached that way, which is exactly how cycles are
 * detected: anything left unplaced after the walk is in one.
 */
export function buildShroomGraph(
  shrooms: InstructionCard[],
  channels: Record<string, Channel>
): ShroomGraph {
  const byId = new Map(shrooms.map((s) => [s.id, s]));
  const present = new Set(byId.keys());

  // Who is chained into by whom. Only edges to shrooms in this view count — a chain into
  // another channel is real, but it isn't drawable here.
  const incoming = new Map<string, string[]>();
  for (const s of shrooms) {
    const next = s.nextInstructionId;
    if (next && present.has(next)) {
      incoming.set(next, [...(incoming.get(next) ?? []), s.id]);
    }
  }

  const depths = new Map<string, number>();
  const roots = shrooms.filter((s) => (incoming.get(s.id) ?? []).length === 0);

  // Breadth-first from the roots. `seen` is per-walk so a diamond doesn't loop forever,
  // while depth keeps the longest path — a node should sit to the right of everything
  // that can reach it.
  const queue: { id: string; depth: number }[] = roots.map((s) => ({ id: s.id, depth: 0 }));
  const guard = shrooms.length * shrooms.length + 1;
  let steps = 0;
  while (queue.length > 0 && steps++ < guard) {
    const { id, depth } = queue.shift()!;
    const existing = depths.get(id);
    if (existing !== undefined && existing >= depth) continue;
    depths.set(id, depth);
    const next = byId.get(id)?.nextInstructionId;
    if (next && present.has(next)) queue.push({ id: next, depth: depth + 1 });
  }

  // Anything still unplaced is only reachable from itself.
  const inCycle = new Set(shrooms.filter((s) => !depths.has(s.id)).map((s) => s.id));
  for (const id of inCycle) depths.set(id, 0);

  const rowCursor = new Map<number, number>();
  const nodes: GraphNode[] = shrooms
    .slice()
    .sort((a, b) => (depths.get(a.id)! - depths.get(b.id)!) || a.title.localeCompare(b.title))
    .map((shroom) => {
      const channel = channels[shroom.channelId];
      const { entry, entryLabel } = describeEntry(shroom, channel);
      const depth = depths.get(shroom.id)!;
      const row = rowCursor.get(depth) ?? 0;
      rowCursor.set(depth, row + 1);

      const fedBy = incoming.get(shroom.id) ?? [];
      const warnings: NodeWarning[] = [];

      if (inCycle.has(shroom.id)) {
        warnings.push({
          kind: 'cycle',
          detail: 'This shroom is part of a loop — the chain never reaches an end.',
        });
      }

      // Nothing starts it and nothing feeds it, so it only ever runs if you press Run.
      // Not an error; boards are allowed to be manual. Worth saying, though, because a
      // shroom with a schedule that got switched off looks identical to one without.
      const reachable = entry !== 'manual' || fedBy.length > 0;
      if (!reachable) {
        warnings.push({
          kind: 'unreachable',
          detail: 'Nothing triggers this — it runs only when you run it by hand.',
        });
      }

      const needs = resolveInputRequirements(shroom).minCards;
      for (const upstreamId of fedBy) {
        const upstream = byId.get(upstreamId);
        if (!upstream) continue;
        const output = guaranteedOutput(upstream);
        if (output !== null && output < needs) {
          warnings.push({
            kind: 'arity',
            detail: `Needs ${needs} cards, but “${upstream.title}” only ever produces ${output}.`,
          });
        }
      }

      if (shroom.nextInstructionId && !present.has(shroom.nextInstructionId)) {
        warnings.push({
          kind: 'dangling-chain',
          detail: 'Chains into a shroom that is not on this board.',
        });
      }

      return {
        id: shroom.id,
        shroom,
        channelName: channel?.name,
        entry,
        entryLabel,
        depth,
        row,
        reachable,
        warnings,
      };
    });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    const next = node.shroom.nextInstructionId;
    if (!next || !nodeById.has(next)) continue;
    const target = nodeById.get(next)!;
    const broken = target.warnings.some(
      (w) => w.kind === 'arity' && w.detail.includes(node.shroom.title)
    );
    edges.push({ from: node.id, to: next, broken });
  }

  return {
    nodes,
    edges,
    columns: Math.max(1, ...nodes.map((n) => n.depth + 1)),
    rows: Math.max(1, ...[...rowCursor.values()]),
  };
}

/** A one-line account of what a node may do, for the node's ports row. */
export function capabilityBadges(shroom: InstructionCard): string[] {
  const caps = resolveCapabilities(shroom);
  const on: string[] = [];
  if (caps.tasks) on.push('tasks');
  if (caps.tags) on.push('tags');
  if (caps.properties) on.push('props');
  if (caps.assignment) on.push('assign');
  return on;
}
