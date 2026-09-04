/**
 * Targeted edits
 *
 * The safety property that matters: a patch either applies exactly as intended or
 * it fails loudly. A partially-applied or misplaced patch produces a subtly broken
 * app, which is much worse than the slow full rewrite it was avoiding — so every
 * ambiguous case here must come back { ok: false }.
 */
import { describe, it, expect } from 'vitest'
import { applyCodeEdits, shouldPatch } from '../lib/playground/applyEdits'

const APP = `import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="bg-white p-4">
      <h1 className="text-xl">Counter</h1>
      <button onClick={() => setCount(count + 1)}>Add</button>
    </div>
  );
}

export default App;`

describe('applyCodeEdits', () => {
  it('applies a single unambiguous edit', () => {
    const res = applyCodeEdits(APP, [{ find: 'bg-white p-4', replace: 'bg-slate-900 p-6' }])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.code).toContain('bg-slate-900 p-6')
      expect(res.code).not.toContain('bg-white p-4')
      expect(res.applied).toBe(1)
      // Everything else must survive untouched.
      expect(res.code).toContain('<h1 className="text-xl">Counter</h1>')
    }
  })

  it('applies several edits in order', () => {
    const res = applyCodeEdits(APP, [
      { find: 'text-xl', replace: 'text-3xl' },
      { find: '>Add<', replace: '>Increment<' },
    ])
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.applied).toBe(2)
      expect(res.code).toContain('text-3xl')
      expect(res.code).toContain('>Increment<')
    }
  })

  it('lets a later edit build on what an earlier one produced', () => {
    const res = applyCodeEdits(APP, [
      { find: 'Counter', replace: 'Tally' },
      { find: 'Tally', replace: 'Score' },
    ])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.code).toContain('Score')
  })

  it('refuses an edit that matches more than once', () => {
    // "count" appears several times — patching one at random would corrupt the app.
    const res = applyCodeEdits(APP, [{ find: 'count', replace: 'total' }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/more than once/)
  })

  it('refuses an edit that does not match', () => {
    const res = applyCodeEdits(APP, [{ find: 'bg-purple-500', replace: 'bg-red-500' }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/did not match/)
  })

  it('fails the whole batch when a later edit is bad, changing nothing', () => {
    const res = applyCodeEdits(APP, [
      { find: 'text-xl', replace: 'text-3xl' },
      { find: 'nonexistent', replace: 'x' },
    ])
    expect(res.ok).toBe(false)
  })

  it('refuses an empty edit list', () => {
    expect(applyCodeEdits(APP, []).ok).toBe(false)
  })

  it('refuses a no-op edit', () => {
    const res = applyCodeEdits(APP, [{ find: 'text-xl', replace: 'text-xl' }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/changes nothing/)
  })

  it('refuses to patch code with no default-exported App', () => {
    const res = applyCodeEdits('const x = 1;', [{ find: 'x', replace: 'y' }])
    expect(res.ok).toBe(false)
  })

  it('refuses a patch that deletes the App export', () => {
    const res = applyCodeEdits(APP, [{ find: 'export default App;', replace: '' }])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/removed the default-exported App/)
  })

  it('handles a malformed edit object without throwing', () => {
    const res = applyCodeEdits(APP, [{ find: '', replace: 'x' }])
    expect(res.ok).toBe(false)
  })
})

describe('shouldPatch', () => {
  it('patches the edit types that touch a few lines', () => {
    expect(shouldPatch('cosmetic', true)).toBe(true)
    expect(shouldPatch('behavior', true)).toBe(true)
  })

  it('rewrites for work that rearranges the file', () => {
    expect(shouldPatch('structural', true)).toBe(false)
    expect(shouldPatch('redesign', true)).toBe(false)
    expect(shouldPatch('first', true)).toBe(false)
  })

  it('never patches when there is no code yet', () => {
    expect(shouldPatch('cosmetic', false)).toBe(false)
  })
})
