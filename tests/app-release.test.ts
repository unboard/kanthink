/**
 * Draft, publish, roll back.
 *
 * A build used to write straight to the link customers were using, so improving
 * something you had sold meant rewriting it underneath them, and a failed build
 * broke it for everyone at once. The draft and the release are separate things now,
 * and these pin the properties that make that true.
 *
 * The serving decision itself is one line — the public page reads the release and
 * never app.code — so what is worth testing is the state machine around it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { appStatus, hasUnpublishedChanges } from '../lib/playground/appRelease'
import { signAppToken, signDraftAppToken, verifyAppToken } from '../lib/playground/appToken'

type App = Parameters<typeof hasUnpublishedChanges>[0]
type Version = Parameters<typeof hasUnpublishedChanges>[1]

const app = (code: string | null): App => ({ code } as App)
const release = (code: string): Version => ({ code } as Version)

describe('whether the draft has moved on from what is live', () => {
  it('is false when they match, so the badge can actually be cleared', () => {
    expect(hasUnpublishedChanges(app('const App = 1'), release('const App = 1'))).toBe(false)
  })

  it('is true when the draft has been edited', () => {
    expect(hasUnpublishedChanges(app('const App = 2'), release('const App = 1'))).toBe(true)
  })

  it('is false again once an edit is undone', () => {
    // Compared on the code rather than a timestamp: an edit and its reversal leave
    // the draft identical to the release, and calling that unpublished would be a
    // badge nobody can clear.
    expect(hasUnpublishedChanges(app('const App = 1'), release('const App = 1'))).toBe(false)
  })

  it('is true for a built app that has never been published', () => {
    expect(hasUnpublishedChanges(app('const App = 1'), null)).toBe(true)
  })

  it('is false for an app with nothing built at all', () => {
    expect(hasUnpublishedChanges(app(null), null)).toBe(false)
    expect(hasUnpublishedChanges(app(''), null)).toBe(false)
  })
})

describe('a draft preview cannot be mistaken for the live app', () => {
  const APP = 'app-1'

  it('tells the two tokens apart', () => {
    expect(verifyAppToken(signAppToken(APP))).toEqual({ appId: APP, isDraft: false })
    expect(verifyAppToken(signDraftAppToken(APP))).toEqual({ appId: APP, isDraft: true })
  })

  it('signs them over different strings, so one cannot be filed as the other', () => {
    const live = signAppToken(APP)
    const draft = signDraftAppToken(APP)
    // Stripping the marker off a draft token must not yield a valid live token.
    expect(verifyAppToken(draft.replace('.draft.', '.'))).toBeNull()
    // And adding one to a live token must not yield a valid draft token.
    const [id, hmac] = live.split('.')
    expect(verifyAppToken(`${id}.draft.${hmac}`)).toBeNull()
  })

  it('rejects a token for a different app', () => {
    const token = signDraftAppToken(APP)
    expect(verifyAppToken(token.replace(APP, 'app-2'))).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyAppToken(null)).toBeNull()
    expect(verifyAppToken('')).toBeNull()
    expect(verifyAppToken('nodots')).toBeNull()
    expect(verifyAppToken('a.b.c.d')).toBeNull()
    expect(verifyAppToken(`${APP}.notdraft.abc`)).toBeNull()
  })
})

describe('where an app stands, as a customer would see it', () => {
  const status = (publishedVersionId: string | null, isPublic: boolean) =>
    appStatus({ publishedVersionId, isPublic } as Parameters<typeof appStatus>[0])

  it('is a draft until something is published', () => {
    expect(status(null, false)).toBe('draft')
    // Even with the link flag on: there is no release for it to point at, so
    // "published" would name a page that 404s.
    expect(status(null, true)).toBe('draft')
  })

  it('is published when a release is chosen and the link is open', () => {
    expect(status('v1', true)).toBe('published')
  })

  it('is unpublished — not draft — when the link is closed on a live release', () => {
    // The distinction the old single control could not make. Taking an app down
    // used to be the same act as forgetting which version it had been serving.
    expect(status('v1', false)).toBe('unpublished')
  })

  it('remembers the release through a trip to unpublished and back', () => {
    const down = { publishedVersionId: 'v3', isPublic: false }
    expect(appStatus(down as Parameters<typeof appStatus>[0])).toBe('unpublished')
    expect(appStatus({ ...down, isPublic: true } as Parameters<typeof appStatus>[0])).toBe('published')
    // The pointer never moved, so republishing serves the same code.
    expect(down.publishedVersionId).toBe('v3')
  })
})

/**
 * The guard for the bug that actually got reported.
 *
 * mergeAppUpdate keeps any key a response omits, which is deliberate — most
 * endpoints return the bare row and must not wipe the view's computed fields. The
 * cost is that a route which CHANGES the draft and returns a bare row leaves the
 * drawer holding a stale answer to "does this differ from what customers have".
 *
 * That is what happened: the build-completion poll returned the row, so publishing
 * version 1 and then building a change left the panel saying the draft and the
 * release matched, with Publish greyed out. Reopening the drawer fixed it, which is
 * why it read as flaky rather than broken.
 *
 * Scanning the source rather than calling the routes because the thing worth
 * pinning is that a future route cannot forget.
 */
describe('every route that moves the draft re-sends the release state', () => {
  const ROUTES = [
    'app/api/playground/apps/[appId]/route.ts',        // load and patch
    'app/api/playground/apps/[appId]/release/route.ts', // publish, roll back, take down
    'app/api/playground/apps/[appId]/undo/route.ts',    // one step back
    'app/api/playground/status/[appId]/route.ts',       // a finished build
  ]

  for (const route of ROUTES) {
    it(`${route} calls releaseView`, () => {
      const src = fs.readFileSync(path.join(process.cwd(), route), 'utf8')
      expect(src).toContain('releaseView')
    })
  }
})
