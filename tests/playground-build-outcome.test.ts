/**
 * A change to an app reaches the person who asked, however their phone behaves.
 *
 * Reported from a phone: "Change this app" on Kitchen Pickleball ("make the court
 * vertical, controls at the bottom") said "Failed to fetch", twice. Two things were
 * wrong at once. The panel held one request open for the whole build, which a phone
 * drops; and the build itself failed on the server (a whole-file rewrite of a 72 KB
 * game ran into a 32k output ceiling and a non-streamed call Node abandons at 300s),
 * a reason reported only on the connection that had already died.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { isBuilding } from '../lib/playground/buildProgress'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

describe('a build says how it ended', () => {
  it('counts only an unfinished, recent build as building', () => {
    const now = 1_000_000_000
    expect(isBuilding(null, now)).toBe(false)
    expect(isBuilding({ startedAt: now - 60_000, steps: [] }, now)).toBe(true)
    expect(isBuilding({ startedAt: now - 60_000, steps: [], finishedAt: now, error: 'cut off' }, now)).toBe(false)
    // Older than any function can run: it died with its function.
    expect(isBuilding({ startedAt: now - 20 * 60_000, steps: [] }, now)).toBe(false)
  })

  it('the generator writes the ending instead of erasing it', () => {
    const src = read('lib/playground/generateApp.ts')
    expect(src).toMatch(/progress\.finish\(\{ error:/)
    expect(src).not.toMatch(/finally \{\s*await progress\?\.clear\(\);/)
  })
})

describe('the change panel does not hang on one long request', () => {
  it('starts the build in the background and polls the app', () => {
    const panel = read('app/play/preview/[appId]/ChangeAppPanel.tsx')
    expect(panel).toMatch(/background: true/)
    expect(panel).toMatch(/\/api\/playground\/status\//)
    const route = read('app/api/playground/generate/route.ts')
    expect(route).toMatch(/after\(async/)
    expect(route).toMatch(/status: 202/)
  })
})

describe('a big rewrite fits and keeps talking', () => {
  it('Gemini streams and gets its full output ceiling', () => {
    expect(read('lib/playground/generateClient.ts')).toMatch(/generateContentStream/)
    expect(read('lib/playground/generateApp.ts')).toMatch(/model\.provider === 'google' \? 65536/)
  })
})
