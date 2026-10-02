import { db } from '@/lib/db'
import { appEmails, cards, channels, columns } from '@/lib/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import { getStudio } from './setup'
import { cardApp } from './pipeline'

/**
 * What Kan knows about the Studio in Home chat, and the actions it can take there.
 *
 * Appended to the operator chat's system prompt only for someone who has a Studio,
 * so nobody else's chat carries any of it.
 */
export async function buildStudioContext(userId: string): Promise<string> {
  const studio = await getStudio(userId)
  if (!studio) {
    return `\n\n## STUDIO\nThe user has no Studio yet. A Studio is a channel where a crew of shrooms finds small app ideas on the web each morning, tests them with a Reserve page, and helps build, ship and sell them. If they ask to start one — or ask for agents that find and sell app ideas — use **setup_studio** (no fields).`
  }

  const [channel, cols, studioCards, drafts] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, studio.channelId), columns: { name: true, aiInstructions: true } }),
    db.query.columns.findMany({ where: eq(columns.channelId, studio.channelId), orderBy: [asc(columns.position)], columns: { id: true, name: true } }),
    db.query.cards.findMany({ where: and(eq(cards.channelId, studio.channelId), eq(cards.isArchived, false)), columns: { id: true, title: true, columnId: true } }),
    db.query.appEmails.findMany({ where: and(eq(appEmails.ownerId, userId), eq(appEmails.status, 'draft')), columns: { id: true } }),
  ])
  const colName = new Map(cols.map((c) => [c.id, c.name]))
  const lines: string[] = []
  for (const card of studioCards.slice(0, 40)) {
    const app = await cardApp(card.id)
    const appState = !app ? '' : app.reserveMode ? `, test page live` : app.publishedVersionId ? ', app live' : app.code ? ', app built (not shipped)' : ''
    lines.push(`- [${card.id}] ${card.title} — ${colName.get(card.columnId) ?? '?'}${appState}`)
  }

  return `

## STUDIO
The user's Studio is the channel "${channel?.name ?? 'Studio'}" (id ${studio.channelId}). Each card is one spark: an app idea the scouts found. Columns, in order: ${cols.map((c) => c.name).join(' → ')}.
${drafts.length ? `${drafts.length} email ${drafts.length === 1 ? 'draft is' : 'drafts are'} waiting for the user in People (/people).\n` : ''}
Cards:
${lines.join('\n') || '(none yet — the scout runs every morning)'}

The brief (the channel's standing instructions):
"""
${(channel?.aiInstructions || '').slice(0, 2500)}
"""

New sparks wait for review in the Sparks column and show on Home as cards; approving one in its card drawer puts up its test page, and rejecting it with a reason teaches the scout. If the user talks about a spark here instead, act on it:
- **start_test_page**: put up a test page with a Reserve button. Requires: cardId. Optional: headline (the promise, one line), pitch (2–3 sentences, who it's for and what it does), priceLabel (e.g. "$5 a plan", "first plan free, then $5"), bullets (up to 3 short lines). Apply anything they asked for ("make the first one free") to these fields. Your reply is written before the page exists, so its link appears under your reply on its own — never write a placeholder like "[link]". Offer a short post they could share where the demand was found, written so the link can go at the end.
- **drop_spark**: pass on it. Requires: cardId. Optional: reason (their words). Use for "pass", "no", "not this one".
- **build_app** on a Studio card builds into the card's own app, so people who reserved carry over. Use it when they say "build it". It moves the card through Building to Ready for you.
- **ship_app**: publish a built app, turn the test page off, switch on checkout and move it to Live; the follow-up crew then drafts launch emails for everyone who reserved, waiting in People. Requires: cardId. Optional: priceLabel (overrides the test page's price). Only when they say "ship it" or similar.
- **update_channel** with channelId ${studio.channelId} and appendInstructions: when they state a lasting preference ("more small business stuff", "nothing for kids"), add one line under "Learned from conversations" in their words. Say you added it to the brief.
Never claim any of these happened unless the action result says so.`
}
