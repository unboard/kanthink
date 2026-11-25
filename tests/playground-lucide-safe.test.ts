import { describe, expect, it } from 'vitest'
import { buildPlaygroundDoc, safeLucideImports } from '../components/playground/buildPlaygroundDoc'

describe('icon imports that cannot break an app', () => {
  it('reads named icons from the namespace, falling back to a circle', () => {
    const out = safeLucideImports(`import { CloudCheck, Heart as Love, StarIcon } from 'lucide-react';\nfunction App() {}`)
    expect(out).not.toMatch(/import\s*\{/)
    expect(out).toContain(`import * as __kpgLucide0 from 'lucide-react';`)
    expect(out).toContain('const CloudCheck = __kpgLucide0["CloudCheck"]')
    expect(out).toContain('const Love = __kpgLucide0["Heart"]')
    expect(out).toContain('__kpgLucide0["Star"]')
    expect(out).toMatch(/\|\| __kpgLucide0\.Circle;/)
    // one line per import, so error line numbers stay put
    expect(out.split('\n').length).toBe(2)
  })

  it('handles several imports and leaves other modules alone', () => {
    const src = `import { useState } from 'react'\nimport { A } from "lucide-react"\nimport {\n  B,\n  C,\n} from 'lucide-react'`
    const out = safeLucideImports(src)
    expect(out).toContain(`import { useState } from 'react'`)
    expect(out).toContain('__kpgLucide0')
    expect(out).toContain('__kpgLucide1')
    expect(out).toContain('const C = ')
  })

  it('is what the frame runs', () => {
    const doc = buildPlaygroundDoc(`import { CloudCheck } from 'lucide-react'\nexport default function App() { return <CloudCheck /> }`)
    expect(doc).toContain('const CloudCheck = __kpgLucide0["CloudCheck"]')
    expect(doc).not.toContain(`import { CloudCheck } from 'lucide-react'`)
  })
})
