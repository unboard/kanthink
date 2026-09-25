/**
 * Libraries are recorded at the version a build previewed with.
 *
 * Unpinned, an app loads whatever is newest on the day it's opened, so a published
 * app can break months later with nobody touching it.
 */
import { describe, it, expect } from 'vitest'
import { pinDeps } from '@/lib/playground/pinDeps'
import { resolveDeps } from '@/lib/playground/runtime'

const registry = (versions: Record<string, string>) =>
  (async (url: string) => {
    const pkg = decodeURIComponent(String(url).split('registry.npmjs.org/')[1].replace(/\/latest$/, ''))
    return versions[pkg]
      ? { ok: true, json: async () => ({ version: versions[pkg] }) }
      : { ok: false, json: async () => ({}) }
  }) as unknown as typeof fetch

describe('pinDeps', () => {
  it('pins a bare npm package, scoped or not, to the current release', async () => {
    const out = await pinDeps(['canvas-confetti', '@dnd-kit/core'], [], registry({ 'canvas-confetti': '1.9.3', '@dnd-kit/core': '6.3.1' }))
    expect(out).toEqual(['canvas-confetti@1.9.3', '@dnd-kit/core@6.3.1'])
  })

  it('keeps an alias', async () => {
    expect(await pinDeps(['conf=canvas-confetti'], [], registry({ 'canvas-confetti': '1.9.3' }))).toEqual(['conf=canvas-confetti@1.9.3'])
  })

  it('leaves versioned packages and GitHub repos alone', async () => {
    const out = await pinDeps(['three@0.185.0', 'gh:mrdoob/three.js'], [], registry({}))
    expect(out).toEqual(['three@0.185.0', 'gh:mrdoob/three.js'])
  })

  it('keeps the pin the app already had rather than upgrading on a rebuild', async () => {
    const out = await pinDeps(['konva'], ['konva@9.3.0'], registry({ konva: '10.0.0' }))
    expect(out).toEqual(['konva@9.3.0'])
  })

  it('never costs the build when the registry is unreachable', async () => {
    const down = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await pinDeps(['konva'], [], down)).toEqual(['konva'])
  })

  it('produces declarations the runtime accepts', async () => {
    const out = await pinDeps(['canvas-confetti', '@dnd-kit/core'], [], registry({ 'canvas-confetti': '1.9.3', '@dnd-kit/core': '6.3.1' }))
    expect(resolveDeps(out).rejected).toEqual([])
  })
})
