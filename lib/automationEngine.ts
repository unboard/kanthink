import type {
  InstructionCard,
  Channel,
  Card,
  Task,
  CardEvent,
  TriggerType,
  ScheduledTrigger,
  EventTrigger,
  ThresholdTrigger,
  AIOperationContext,
} from './types';
import { checkSafeguards, getExecutionUpdate, calculateNextScheduledRun, isScheduledTriggerDue } from './automationSafeguards';
import { runInstruction } from './ai/runInstruction';

// Types for the automation engine
export interface AutomationContext {
  channels: Record<string, Channel>;
  cards: Record<string, Card>;
  tasks: Record<string, Task>;
  instructionCards: Record<string, InstructionCard>;
  // Store actions
  createCard: (channelId: string, columnId: string, input: { title: string; initialMessage?: string }, source: 'ai', createdByInstructionId?: string) => void;
  updateCard: (id: string, updates: Partial<Card>) => void;
  moveCard: (cardId: string, toColumnId: string, toIndex: number) => void;
  setCardProperty: (cardId: string, key: string, value: string, displayType: 'chip' | 'field', color?: string) => void;
  addMessage: (cardId: string, type: 'note' | 'question' | 'ai_response', content: string) => void;
  createTask: (channelId: string, cardId: string | null, input: { title: string; description?: string }) => void;
  updateInstructionCard: (id: string, updates: Partial<InstructionCard>) => void;
  startAIOperation: (status: string, context?: AIOperationContext) => void;
  completeAIOperation: () => void;
  setCardProcessing: (cardId: string, isProcessing: boolean, status?: string) => void;
  setInstructionRunning: (instructionId: string, isRunning: boolean) => void;
  getAIAbortSignal: () => AbortSignal | undefined;
  recordInstructionRun: (cardId: string, instructionId: string) => void;
  onCardsSkipped?: (count: number, instructionTitle: string) => void;
  // Tag methods
  addTagDefinition: (channelId: string, name: string, color: string) => { id: string; name: string; color: string };
  addTagToCard: (cardId: string, tagName: string) => void;
}

// Track pending executions to prevent concurrent runs
const pendingExecutions = new Set<string>();

/**
 * Check and execute all due scheduled triggers
 */
export async function checkScheduledTriggers(ctx: AutomationContext): Promise<void> {
  for (const instructionId of Object.keys(ctx.instructionCards)) {
    const instruction = ctx.instructionCards[instructionId];

    // Skip if not automatic mode or not enabled
    if (instruction.runMode !== 'automatic' || !instruction.isEnabled) continue;

    // Skip if no triggers configured
    if (!instruction.triggers || instruction.triggers.length === 0) continue;

    // Check each scheduled trigger
    for (const trigger of instruction.triggers) {
      if (trigger.type !== 'scheduled') continue;

      // Check if due
      if (!isScheduledTriggerDue(instruction.nextScheduledRun)) continue;

      // Execute the instruction
      await executeAutomaticInstruction(ctx, instruction, 'scheduled');

      // Update next scheduled run time
      const nextRun = calculateNextScheduledRun(
        trigger.interval,
        trigger.specificTime,
        trigger.dayOfWeek
      );
      ctx.updateInstructionCard(instruction.id, {
        nextScheduledRun: nextRun.toISOString(),
      });
    }
  }
}

/**
 * Check event triggers when a card event occurs
 */
export async function checkEventTriggers(ctx: AutomationContext, event: CardEvent): Promise<void> {
  const channel = ctx.channels[event.channelId];
  if (!channel) return;

  // Get all instruction cards for this channel
  const channelInstructions = (channel.instructionCardIds || [])
    .map(id => ctx.instructionCards[id])
    .filter(Boolean);

  for (const instruction of channelInstructions) {
    // Skip if not automatic mode or not enabled
    if (instruction.runMode !== 'automatic' || !instruction.isEnabled) continue;

    // Skip if no triggers configured
    if (!instruction.triggers || instruction.triggers.length === 0) continue;

    // Check each event trigger
    for (const trigger of instruction.triggers) {
      if (trigger.type !== 'event') continue;

      const eventTrigger = trigger as EventTrigger;

      // Check if the event matches the trigger
      let matches = false;

      switch (eventTrigger.eventType) {
        case 'card_moved_to':
          matches = event.type === 'moved' && event.toColumnId === eventTrigger.columnId;
          break;
        case 'card_created_in':
          matches = event.type === 'created' && event.toColumnId === eventTrigger.columnId;
          break;
        case 'card_modified':
          matches = event.type === 'modified';
          // For modified, check if the card is in the target column
          if (matches) {
            const card = ctx.cards[event.cardId];
            if (card) {
              const col = channel.columns.find(c => c.cardIds.includes(event.cardId));
              matches = col?.id === eventTrigger.columnId;
            }
          }
          break;
      }

      if (matches) {
        await executeAutomaticInstruction(ctx, instruction, 'event', event);
      }
    }
  }
}

/**
 * Check threshold triggers for a channel
 */
export async function checkThresholdTriggers(ctx: AutomationContext, channelId: string): Promise<void> {
  const channel = ctx.channels[channelId];
  if (!channel) return;

  // Get all instruction cards for this channel
  const channelInstructions = (channel.instructionCardIds || [])
    .map(id => ctx.instructionCards[id])
    .filter(Boolean);

  for (const instruction of channelInstructions) {
    // Skip if not automatic mode or not enabled
    if (instruction.runMode !== 'automatic' || !instruction.isEnabled) continue;

    // Skip if no triggers configured
    if (!instruction.triggers || instruction.triggers.length === 0) continue;

    // Check each threshold trigger
    for (const trigger of instruction.triggers) {
      if (trigger.type !== 'threshold') continue;

      const thresholdTrigger = trigger as ThresholdTrigger;

      // Find the column and get card count
      const column = channel.columns.find(c => c.id === thresholdTrigger.columnId);
      if (!column) continue;

      const cardCount = column.cardIds.length;
      let matches = false;

      switch (thresholdTrigger.operator) {
        case 'below':
          matches = cardCount < thresholdTrigger.threshold;
          break;
        case 'above':
          matches = cardCount > thresholdTrigger.threshold;
          break;
      }

      if (matches) {
        await executeAutomaticInstruction(ctx, instruction, 'threshold');
      }
    }
  }
}

/**
 * Execute an instruction with safeguards and result processing
 */
async function executeAutomaticInstruction(
  ctx: AutomationContext,
  instruction: InstructionCard,
  triggerType: TriggerType,
  event?: CardEvent
): Promise<boolean> {
  // Prevent concurrent execution of the same instruction
  if (pendingExecutions.has(instruction.id)) {
    console.log(`[Automation] Skipping ${instruction.title} - already executing`);
    return false;
  }

  // Check safeguards
  const safeguardResult = checkSafeguards(
    instruction,
    triggerType,
    event,
    (cardId) => ctx.cards[cardId]
  );

  if (!safeguardResult.canExecute) {
    console.log(`[Automation] Skipping ${instruction.title}: ${safeguardResult.details}`);
    return false;
  }

  // Get the channel
  const channel = ctx.channels[instruction.channelId];
  if (!channel) {
    console.error(`[Automation] Channel not found for instruction ${instruction.id}`);
    return false;
  }

  // Mark as executing
  pendingExecutions.add(instruction.id);

  // Set instruction card loading state
  console.log(`[Automation] Setting instruction ${instruction.id} as running`);
  ctx.setInstructionRunning(instruction.id, true);

  // Set card processing state for event-triggered cards
  const triggeringCardId = event?.cardId;
  if (triggeringCardId) {
    console.log(`[Automation] Setting card ${triggeringCardId} as processing`);
    ctx.setCardProcessing(triggeringCardId, true, `Running: ${instruction.title}`);
  }

  console.log(`[Automation] Executing ${instruction.title} (triggered by: ${triggerType})`);

  try {
    // Start AI operation status
    ctx.startAIOperation(`Auto: ${instruction.title}`, {
      action: instruction.action,
      instructionTitle: instruction.title,
    });

    // Run the instruction
    // For event triggers, pass the triggering card ID so modify/move only affect that card
    // For automatic runs, skip cards that have already been processed by this instruction
    const triggeringCardId = event?.cardId;
    const result = await runInstruction(
      instruction,
      channel,
      ctx.cards,
      ctx.tasks,
      ctx.getAIAbortSignal(),
      triggeringCardId,
      true  // skipAlreadyProcessed for automatic runs
    );

    let cardsAffected = 0;

    // Process results based on action type
    if (result.action === 'generate' && result.generatedCards) {
      const targetColumnId = result.targetColumnIds[0] || channel.columns[0]?.id;
      if (targetColumnId) {
        for (const cardInput of result.generatedCards) {
          // Pass the instruction ID for loop prevention
          ctx.createCard(channel.id, targetColumnId, cardInput, 'ai', instruction.id);
          cardsAffected++;
        }
      }
    } else if (result.action === 'modify' && result.modifiedCards) {
      for (const modified of result.modifiedCards) {
        ctx.updateCard(modified.id, { title: modified.title });

        // Process tags if present
        if (modified.tags && modified.tags.length > 0) {
          const existingCard = ctx.cards[modified.id];
          for (const tagName of modified.tags) {
            // Check if tag already exists in channel (case-insensitive match)
            const existingTag = channel.tagDefinitions?.find(
              t => t.name.toLowerCase() === tagName.toLowerCase()
            );

            let finalTagName: string;
            if (existingTag) {
              finalTagName = existingTag.name;
            } else {
              // Create a new tag with a default color
              const defaultColors = ['blue', 'green', 'purple', 'orange', 'pink', 'cyan'];
              const colorIndex = (channel.tagDefinitions?.length || 0) % defaultColors.length;
              ctx.addTagDefinition(channel.id, tagName, defaultColors[colorIndex]);
              finalTagName = tagName;
            }

            // Add tag to card if not already present
            if (!existingCard?.tags?.includes(finalTagName)) {
              ctx.addTagToCard(modified.id, finalTagName);
            }
          }
        }

        if (modified.properties) {
          for (const prop of modified.properties) {
            ctx.setCardProperty(modified.id, prop.key, prop.value, prop.displayType, prop.color);
          }
        }
        if (modified.tasks) {
          for (const task of modified.tasks) {
            ctx.createTask(channel.id, modified.id, {
              title: task.title,
              description: task.description,
            });
          }
        }
        if (modified.content) {
          ctx.addMessage(modified.id, 'ai_response', modified.content);
        }
        // Record that this instruction has processed this card
        ctx.recordInstructionRun(modified.id, instruction.id);
        cardsAffected++;
      }
    } else if (result.action === 'move' && result.movedCards) {
      for (const move of result.movedCards) {
        ctx.moveCard(move.cardId, move.destinationColumnId, 0);
        // Record that this instruction has processed this card
        ctx.recordInstructionRun(move.cardId, instruction.id);
        cardsAffected++;
      }
    }

    // Notify about skipped cards (automatic runs only)
    if (result.skippedCardIds && result.skippedCardIds.length > 0 && ctx.onCardsSkipped) {
      ctx.onCardsSkipped(result.skippedCardIds.length, instruction.title);
    }

    // Update execution tracking
    const executionUpdate = getExecutionUpdate(
      instruction,
      !result.error,
      cardsAffected,
      triggerType
    );
    ctx.updateInstructionCard(instruction.id, executionUpdate);

    console.log(`[Automation] Completed ${instruction.title}: ${cardsAffected} cards affected`);
    return !result.error;

  } catch (error) {
    console.error(`[Automation] Error executing ${instruction.title}:`, error);

    // Update execution tracking with failure
    const executionUpdate = getExecutionUpdate(instruction, false, 0, triggerType);
    ctx.updateInstructionCard(instruction.id, executionUpdate);

    return false;
  } finally {
    pendingExecutions.delete(instruction.id);
    ctx.setInstructionRunning(instruction.id, false);
    if (triggeringCardId) {
      ctx.setCardProcessing(triggeringCardId, false);
    }
    ctx.completeAIOperation();
  }
}

/**
 * Initialize scheduled triggers by calculating their next run times
 */
export function initializeScheduledTriggers(ctx: AutomationContext): void {
  for (const instructionId of Object.keys(ctx.instructionCards)) {
    const instruction = ctx.instructionCards[instructionId];

    // Skip if not automatic mode
    if (instruction.runMode !== 'automatic') continue;

    // Skip if no triggers
    if (!instruction.triggers || instruction.triggers.length === 0) continue;

    // Find scheduled triggers and set next run time if not set
    for (const trigger of instruction.triggers) {
      if (trigger.type !== 'scheduled') continue;

      // Only set if not already scheduled
      if (!instruction.nextScheduledRun) {
        const scheduledTrigger = trigger as ScheduledTrigger;
        const nextRun = calculateNextScheduledRun(
          scheduledTrigger.interval,
          scheduledTrigger.specificTime,
          scheduledTrigger.dayOfWeek
        );
        ctx.updateInstructionCard(instruction.id, {
          nextScheduledRun: nextRun.toISOString(),
        });
        console.log(`[Automation] Scheduled ${instruction.title} for ${nextRun.toISOString()}`);
      }
    }
  }
}
