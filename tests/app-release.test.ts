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
import { hasUnpublishedChanges } from '../lib/playground/appRelease'
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
