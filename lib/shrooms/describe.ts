import type { Channel, EventTrigger, InstructionCard, ScheduledTrigger } from '@/lib/types';

export type ShroomRunState = 'watching' | 'scheduled' | 'manual';

export interface ShroomCardFacts {
  state: ShroomRunState;
  /** "Inbox", "Every day at 09:00", or null when it only runs on demand. */
  trigger: string | null;
  /** Relative time of the last run, or null if it has never run. */
  lastRun: string | null;
  totalRuns: number;
  /** Title of the shroom this one hands off to, if it chains. */
  chainsTo: string | null;
  /** The sentence to show. Falls back to the raw instructions until one is generated. */
  summary: string;
  /** This shroom goes online every run — worth showing, since it leaves the board. */
  usesWeb: boolean;
}

const INTERVAL_LABEL: Record<string, string> = {
  hourly: 'Every hour',
  every4hours: 'Every 4 hours',
  daily: 'Every day',
  weekly: 'Every week',
};

const DAY = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function relativeTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Everything the card needs to say about a shroom, in the words a person uses.
 *
 * Kept out of the component so the desktop panel and the mobile sheet can't drift into
 * describing the same shroom two different ways.
 */
export function describeShroom(
  shroom: InstructionCard,
  channel: Channel | undefined,
  allShrooms: Record<string, InstructionCard>
): ShroomCardFacts {
  const triggers = shroom.triggers ?? [];
  const event = triggers.find((t) => t.type === 'event') as EventTrigger | undefined;
  const scheduled = triggers.find((t) => t.type === 'scheduled') as ScheduledTrigger | undefined;

  let state: ShroomRunState = 'manual';
  let trigger: string | null = null;

  if (shroom.isEnabled && event) {
    state = 'watching';
    trigger = channel?.columns.find((c) => c.id === event.columnId)?.name ?? 'a column';
  } else if (shroom.isEnabled && scheduled) {
    state = 'scheduled';
    const base = INTERVAL_LABEL[scheduled.interval] ?? 'On a schedule';
    if (scheduled.interval === 'weekly' && scheduled.dayOfWeek !== undefined) {
      trigger = `${DAY[scheduled.dayOfWeek]}${scheduled.specificTime ? ` at ${scheduled.specificTime}` : ''}`;
    } else if (scheduled.specificTime && (scheduled.interval === 'daily' || scheduled.interval === 'weekly')) {
      trigger = `${base} at ${scheduled.specificTime}`;
    } else {
      trigger = base;
    }
  }

  const next = shroom.nextInstructionId ? allShrooms[shroom.nextInstructionId] : undefined;

  return {
    state,
    trigger,
    lastRun: relativeTime(shroom.lastExecutedAt),
    // executionHistory is capped at 10, so it undercounts a long-lived shroom — but it's
    // the only lifetime signal stored, and "at least this many" beats showing nothing.
    totalRuns: (shroom.executionHistory ?? []).filter((r) => !r.skippedReason).length,
    chainsTo: next?.title ?? null,
    summary: shroom.summary?.trim() || shroom.instructions,
    usesWeb: shroom.webAccess?.mode === 'always',
  };
}
