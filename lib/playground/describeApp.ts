import { formatAppPrice } from './appAccess'
import { appStatus, hasUnpublishedChanges, type AppRow, type AppVersion } from './appRelease'

/**
 * An app, described for someone listening rather than looking.
 *
 * Voice mode could already say how a published app was SELLING — app_audience has
 * been there a while — but it could not say what the app WAS. show_card read the
 * card's own thread and stopped, so an app hanging off that card, with a thread and
 * a draft of its own, was invisible: asking what state the launch simulator was in
 * got a shrug, which is not the same as there being nothing to say.
 *
 * Deliberately takes the release rather than fetching it, so this stays a pure
 * function of what it is given. The sentence read aloud to somebody is worth
 * testing, and a describer that opens a database connection is not testable.
 *
 * `full` controls how much thread comes back: a card listing several apps wants a
 * line each, and a question about one app wants the conversation that built it.
 */
export function describeApp(
  app: AppRow,
  published: Pick<AppVersion, 'version' | 'code'> | null,
  { full }: { full: boolean },
): string {
  const status = appStatus(app)

  const state =
    status === 'published'
      ? `published, serving version ${published?.version ?? 1}`
      : status === 'unpublished'
        ? `unpublished — version ${published?.version ?? 1} is still the chosen release, the link is just closed`
        : app.code
          ? 'a draft, never published'
          : 'not built yet'

  const bits = [state]
  if (published && hasUnpublishedChanges(app, published as AppVersion)) {
    bits.push("the draft has changes the public link doesn't serve yet (publish_app puts them live)")
  }
  if (app.paywallEnabled && app.priceAmount) {
    bits.push(`costs ${formatAppPrice(app.priceAmount, app.priceCurrency, app.priceInterval)}`)
  }
  if (status === 'published' && app.shareToken) {
    bits.push(`public link kanthink.com/play/${app.shareToken}`)
  }
  if (app.code) {
    // The owner can always open the newest build, published or not: the step line
    // for this lookup links to it, so point them there rather than describing menus.
    bits.push(`newest build opens at kanthink.com/play/preview/${app.id} (signed in; the "Looked at" line under the reply links to it)`)
  }

  const lines = [`App "${app.title}": ${bits.join('; ')}.`]

  if (app.lastNotes?.trim()) {
    lines.push(`Last build: ${app.lastNotes.trim()}`)
  }

  // The app's own thread — the thing that was entirely unreachable. This gets read
  // aloud, so a tail rather than the lot: the recent turns are what a conversation
  // about iterating on the app actually needs.
  const msgs = (app.messages || []) as Array<{ type?: string; content?: string }>
  if (msgs.length > 0) {
    const take = full ? 12 : 3
    const labelFor = (t?: string) =>
      t === 'question' ? 'User asked' : t === 'ai_response' ? 'Kan' : 'Note'
    const body = msgs
      .slice(-take)
      .map((m) => `[${labelFor(m.type)}] ${(m.content || '').trim()}`)
      .filter((line) => line.length > 12)
      .join('\n\n')
    if (body) {
      const shown = Math.min(take, msgs.length)
      const prefix =
        shown < msgs.length
          ? `App thread (last ${shown} of ${msgs.length} messages)`
          : `App thread (${msgs.length} message${msgs.length === 1 ? '' : 's'})`
      lines.push(`${prefix}:\n${body}`)
    }
  } else if (full) {
    lines.push('App thread: (empty)')
  }

  return lines.join('\n\n')
}
