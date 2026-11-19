/**
 * Fonts are self-hosted (app/fonts.ts). next/font/google downloads from Google during the
 * Vercel build and that download kept failing deploys, so it must not come back.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : sources(p)
    return /\.(tsx?|jsx?|mjs)$/.test(name) ? [p] : []
  })
}

describe('fonts', () => {
  it('never load from next/font/google', () => {
    const offenders = ['app', 'components', 'lib']
      .flatMap(sources)
      .filter((p) => /from\s+['"]next\/font\/google['"]/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
