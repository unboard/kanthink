import { describe, it, expect } from 'vitest'
import { mergeAppUpdate, SERVER_COMPUTED_APP_FIELDS } from '../lib/playground/mergeAppUpdate'
import type { PlaygroundApp } from '../lib/types'

/**
 * The bug this prevents cost several rounds of looking in the wrong place.
 *
 * An app with AI in it stopped producing AI content after every update, and looked
 * for all the world like it had reverted to an older version that never had any. It
 * had not. GET /apps/[appId] computes a draft token and hands it to the preview;
 * every other endpoint returns the database row, which has no such field. Replacing
 * the drawer's app with a row deleted the token, the preview was rebuilt without
 * one, and window.kanthinkAI rejected every call before it reached the network — so
 * the app fell into its own catch and rendered the fallback content it ships with.
 *
 * Nothing was lost from the app. It had lost permission to make the call.
 */

const view = {
  id: 'app-1',
  title: 'Launch Simulator',
  code: 'const A = 1;',
  generationCount: 8,
  // Computed by the view, absent from the row.
  draftToken: 'app-1.draft.abc123',
  draftDataToken: 'app-1.member.0.draft.999.mac',
  draftCustomer: { email: 'owner@example.com', name: 'Owner' },
  draftCustomerData: { stats: { streak: 4 } },
  publishedVersion: { id: 'v1', version: 1 },
  hasUnpublishedChanges: true,
  versions: [{ id: 'v1', version: 1 }],
} as unknown as PlaygroundApp

/** What a build returns: the row, and nothing computed. */
const rowAfterBuild = {
  id: 'app-1',
  title: 'Launch Simulator',
  code: 'const A = 2;',
  generationCount: 9,
} as unknown as PlaygroundApp

describe('an update keeps what the server did not send', () => {
  it('keeps the draft token through a build', () => {
    const merged = mergeAppUpdate(view, rowAfterBuild)
    expect(merged.draftToken).toBe('app-1.draft.abc123')
  })

  it('keeps every server-computed field', () => {
    const merged = mergeAppUpdate(view, rowAfterBuild) as unknown as Record<string, unknown>
    for (const field of SERVER_COMPUTED_APP_FIELDS) {
      expect(merged[field], field).toBeDefined()
    }
  })

  it('still takes the new code and version', () => {
    const merged = mergeAppUpdate(view, rowAfterBuild)
    expect(merged.code).toBe('const A = 2;')
    expect(merged.generationCount).toBe(9)
  })
})

describe('the server can still change things', () => {
  it('lets an explicit null through', () => {
    // Unpublishing really does clear this, and the merge must not resurrect it.
    const merged = mergeAppUpdate(view, { ...rowAfterBuild, publishedVersion: null } as unknown as PlaygroundApp)
    expect(merged.publishedVersion).toBeNull()
  })

  it('lets an explicit false through', () => {
    const merged = mergeAppUpdate(view, { ...rowAfterBuild, hasUnpublishedChanges: false } as unknown as PlaygroundApp)
    expect(merged.hasUnpublishedChanges).toBe(false)
  })

  it('takes the payload whole when there is nothing held yet', () => {
    expect(mergeAppUpdate(null, rowAfterBuild)).toBe(rowAfterBuild)
  })
})

describe('the consequence the guard is really about', () => {
  it('a token-less app would silence every AI call', () => {
    // buildPlaygroundDoc bakes app.draftToken in, and the runtime helper rejects
    // immediately when it is empty — before any request is made, which is why the
    // failure never showed up in the spend ledger.
    const broken = mergeAppUpdate(null, rowAfterBuild)
    expect((broken as unknown as Record<string, unknown>).draftToken).toBeUndefined()

    const fixed = mergeAppUpdate(view, rowAfterBuild)
    expect(fixed.draftToken).toBeTruthy()
  })
})
