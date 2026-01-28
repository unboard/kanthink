import type { InstructionCard, AutomaticSafeguards, TriggerType, CardEvent } from './types';

export interface SafeguardCheck {
  canExecute: boolean;
  reason?: 'cooldown_active' | 'daily_cap_reached' | 'loop_prevention' | 'not_enabled';
  details?: string;
}

const DEFAULT_SAFEGUARDS: AutomaticSafeguards = {
  cooldownMinutes: 5,
  dailyCap: 50,
  preventLoops: true,
};

/**
 * Check if an instruction can be executed based on safeguards
 */
export function checkSafeguards(
  instruction: InstructionCard,
  triggerType: TriggerType,
  eventContext?: CardEvent,
  getCard?: (id: string) => { createdByInstructionId?: string } | undefined
): SafeguardCheck {
  // Check if automatic mode is enabled
  if (!instruction.isEnabled) {
    return { canExecute: false, reason: 'not_enabled', details: 'Automatic execution is disabled' };
  }

  const safeguards = { ...DEFAULT_SAFEGUARDS, ...instruction.safeguards };

  // 1. Check cooldown
  if (instruction.lastExecutedAt) {
    const elapsed = Date.now() - new Date(instruction.lastExecutedAt).getTime();
    const cooldownMs = safeguards.cooldownMinutes * 60 * 1000;
    if (elapsed < cooldownMs) {
      const remainingMinutes = Math.ceil((cooldownMs - elapsed) / 60000);
      return {
        canExecute: false,
        reason: 'cooldown_active',
        details: `Cooldown active. ${remainingMinutes} minute(s) remaining.`,
      };
    }
  }

  // 2. Check daily cap
  const today = new Date().toDateString();
  const resetDate = instruction.dailyCountResetAt
    ? new Date(instruction.dailyCountResetAt).toDateString()
    : null;

  const currentCount = resetDate === today ? (instruction.dailyExecutionCount ?? 0) : 0;

  if (currentCount >= safeguards.dailyCap) {
    return {
      canExecute: false,
      reason: 'daily_cap_reached',
      details: `Daily cap of ${safeguards.dailyCap} executions reached.`,
    };
  }

  // 3. Check loop prevention
  if (safeguards.preventLoops && eventContext && getCard) {
    // Check if the triggering card was created by this instruction
    const triggeringCard = getCard(eventContext.cardId);
    if (triggeringCard?.createdByInstructionId === instruction.id) {
      return {
        canExecute: false,
        reason: 'loop_prevention',
        details: 'Card was created by this instruction. Loop prevention active.',
      };
    }

    // Also check event context directly (for newly created cards)
    if (eventContext.createdByInstructionId === instruction.id) {
      return {
        canExecute: false,
        reason: 'loop_prevention',
        details: 'Card was created by this instruction. Loop prevention active.',
      };
    }
  }

  return { canExecute: true };
}

/**
 * Get updated execution tracking fields after a run
 */
export function getExecutionUpdate(instruction: InstructionCard, success: boolean, cardsAffected: number, triggerType: TriggerType) {
  const now = new Date().toISOString();
  const today = new Date().toDateString();
  const resetDate = instruction.dailyCountResetAt
    ? new Date(instruction.dailyCountResetAt).toDateString()
    : null;

  // Reset count if it's a new day
  const currentCount = resetDate === today ? (instruction.dailyExecutionCount ?? 0) : 0;

  // Add to execution history (keep last 10)
  const history = instruction.executionHistory || [];
  const newHistory = [
    {
      timestamp: now,
      triggeredBy: triggerType,
      success,
      cardsAffected,
    },
    ...history,
  ].slice(0, 10);

  return {
    lastExecutedAt: now,
    dailyExecutionCount: currentCount + 1,
    dailyCountResetAt: today,
    executionHistory: newHistory,
  };
}

/**
 * Calculate the next scheduled run time for a scheduled trigger
 */
export function calculateNextScheduledRun(
  interval: 'hourly' | 'every4hours' | 'daily' | 'weekly',
  specificTime?: string,
  dayOfWeek?: number
): Date {
  const now = new Date();

  switch (interval) {
    case 'hourly': {
      const next = new Date(now);
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;
    }

    case 'every4hours': {
      const next = new Date(now);
      const currentHour = next.getHours();
      const nextHour = Math.ceil((currentHour + 1) / 4) * 4;
      if (nextHour >= 24) {
        next.setDate(next.getDate() + 1);
        next.setHours(0);
      } else {
        next.setHours(nextHour);
      }
      next.setMinutes(0);
      next.setSeconds(0);
      next.setMilliseconds(0);
      return next;
    }

    case 'daily': {
      const next = new Date(now);
      const [hours, minutes] = (specificTime || '06:00').split(':').map(Number);
      next.setHours(hours, minutes, 0, 0);
      // If the time has passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }

    case 'weekly': {
      const next = new Date(now);
      const targetDay = dayOfWeek ?? 1; // Default to Monday
      const [hours, minutes] = (specificTime || '06:00').split(':').map(Number);
      next.setHours(hours, minutes, 0, 0);

      const currentDay = next.getDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget < 0 || (daysUntilTarget === 0 && next <= now)) {
        daysUntilTarget += 7;
      }
      next.setDate(next.getDate() + daysUntilTarget);
      return next;
    }
  }
}

/**
 * Check if a scheduled trigger is due to run
 */
export function isScheduledTriggerDue(nextScheduledRun: string | undefined): boolean {
  if (!nextScheduledRun) return false;
  const scheduledTime = new Date(nextScheduledRun);
  return scheduledTime <= new Date();
}
