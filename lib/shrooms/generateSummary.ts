import { db } from '@/lib/db'
import { channels, instructionCards } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getLLMClientForUser } from '@/lib/ai/llm'

/**
 * Write the one-line description shown on a shroom's card.
 *
 * `instructions` is written *to* the model — "Review the bookmark card. Add a note or
 * update the description with a deep analysis structured as follows: 1. A brief TL;DR…".
 * Printing that on a card is why they read like configuration rather than like a
 * description of a thing that does work for you.
 *
 * Never throws. A missing summary just falls back to the instructions on the card, which
 * is exactly where we were before.
 */
export async function generateShroomSummary(instructionId: string): Promise<void> {
  try {
    const shroom = await db.query.instructionCards.findFirst({
      where: eq(instructionCards.id, instructionId),
    })
    if (!shroom) return

    const channel = await db.query.channels.findFirst({
      where: eq(channels.id, shroom.channelId),
      columns: { ownerId: true, name: true },
    })
    if (!channel) return

    const { client } = await getLLMClientForUser(channel.ownerId)
    if (!client) return

    const response = await client.complete(
      [
        {
          role: 'system',
          content: `You write the one-line description shown on an automation's card in a Kanban app.

Rules:
- One sentence, at most two. Under 30 words.
- Third person, present tense, starting with a verb: "Reads every bookmark…", "Sorts anything in Raw Ideas…".
- Say what it does to the board and what comes out of it. Skip the how.
- Plain language. No jargon, no marketing, no "This shroom…", no restating the title.
- Reply with the sentence only. No quotes, no preamble.`,
        },
        {
          role: 'user',
          content: `Board: "${channel.name}"
Automation name: "${shroom.title}"
Action: ${shroom.action}

Its instructions (written for the model, not for a person):
"""
${shroom.instructions.slice(0, 2000)}
"""

Write the card description.`,
        },
      ],
      { maxTokens: 200 }
    )

    const summary = response.content.trim().replace(/^["']|["']$/g, '')
    if (!summary || summary.length > 400) return

    await db
      .update(instructionCards)
      .set({ summary, updatedAt: new Date() })
      .where(eq(instructionCards.id, instructionId))
  } catch (error) {
    console.error('[shrooms] Summary generation failed:', error)
  }
}
