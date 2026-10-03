import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import { FONT_PAIRINGS, LOOKS, PALETTES, fontsById, paletteById, type PaletteColors } from '@/lib/playground/style/catalog'
import { contrast, dominantColors, hexToOklch, oklchToHex } from '@/lib/playground/style/color'
import {
  brandPalette,
  googleFontsHref,
  normalizeStyle,
  resolveStyle,
  styleCss,
  styleForLook,
  stylePrompt,
  tailwindConfig,
  usesTokens,
} from '@/lib/playground/style/tokens'
import { checkDesign, findingsBrief } from '@/lib/playground/style/slopCheck'
import { passPrompt, STYLE_PASSES } from '@/lib/playground/style/passes'
import { heuristicLook } from '@/lib/playground/style/autoPick'
import { buildImportMap, resolveDeps } from '@/lib/playground/runtime'
import { buildPlaygroundDoc } from '@/components/playground/buildPlaygroundDoc'

function readable(c: PaletteColors) {
  return {
    'foreground on background': contrast(c.foreground, c.background),
    'foreground on card': contrast(c.foreground, c.card),
    'muted text on background': contrast(c.mutedForeground, c.background),
    'muted text on card': contrast(c.mutedForeground, c.card),
    'text on primary': contrast(c.primaryForeground, c.primary),
    'text on highlight': contrast(c.highlightForeground, c.highlight),
  }
}

describe('palettes', () => {
  it.each(PALETTES.map((p) => [p.id, p] as const))('%s keeps every text pairing readable (WCAG AA)', (_id, palette) => {
    for (const [pair, ratio] of Object.entries(readable(palette.colors))) {
      expect(ratio, `${palette.id}: ${pair}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('palettes made from any brand colour stay readable, light and dark', () => {
    for (let h = 0; h < 360; h += 15) {
      for (const l of [0.35, 0.6, 0.85]) {
        for (const mode of ['light', 'dark'] as const) {
          const brand = oklchToHex({ l, c: 0.16, h })
          const p = brandPalette(brand, null, mode)
          for (const [pair, ratio] of Object.entries(readable(p.colors))) {
            expect(ratio, `${brand} ${mode}: ${pair}`).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
    }
  })

  it('keeps a brand colour as given when text on it already reads', () => {
    expect(brandPalette('#1D4E89').colors.primary).toBe('#1D4E89')
  })

  it('round-trips colours through OKLCH', () => {
    for (const hex of ['#1D4E89', '#C2411F', '#0F766E', '#F2B705']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })

  it('reads the brand colours out of a logo, ignoring white and grey', () => {
    const px: number[] = []
    const push = (r: number, g: number, b: number, n: number) => { for (let i = 0; i < n; i++) px.push(r, g, b, 255) }
    push(255, 255, 255, 400) // background
    push(120, 120, 120, 100) // grey text
    push(200, 30, 40, 300) // red mark
    push(20, 60, 160, 150) // blue mark
    const found = dominantColors(px, 2)
    expect(found).toHaveLength(2)
    expect(hexToOklch(found[0]).h).toBeLessThan(40) // red first
  })
})

describe('catalogue', () => {
  it('every look points at a real palette and font pairing', () => {
    for (const look of LOOKS) {
      expect(paletteById(look.palette), look.id).toBeTruthy()
      expect(fontsById(look.fonts), look.id).toBeTruthy()
    }
  })

  it('builds one Google Fonts request per pairing', () => {
    for (const f of FONT_PAIRINGS) {
      const href = googleFontsHref(f)
      expect(href.startsWith('https://fonts.googleapis.com/css2?family=')).toBe(true)
      expect(href).not.toMatch(/\s/)
    }
  })
})

describe('normalizeStyle', () => {
  it('rejects anything without a known look', () => {
    expect(normalizeStyle(null)).toBeNull()
    expect(normalizeStyle({ look: 'nope' })).toBeNull()
  })

  it('falls back to the look for unknown pieces', () => {
    const s = normalizeStyle({ look: 'ledger', palette: 'mystery', fonts: 'comic-sans', radius: 'huge', density: 'x' })!
    expect(s.palette).toBe('ledger')
    expect(s.fonts).toBe('plex')
    expect(s.radius).toBe('sm')
    expect(s.density).toBe('compact')
  })

  it('only keeps a logo URL that cannot break out of the page', () => {
    expect(normalizeStyle({ look: 'utility', logoUrl: 'https://res.cloudinary.com/x/logo.png' })!.logoUrl).toBe('https://res.cloudinary.com/x/logo.png')
    expect(normalizeStyle({ look: 'utility', logoUrl: 'javascript:alert(1)' })!.logoUrl).toBeNull()
    expect(normalizeStyle({ look: 'utility', logoUrl: 'https://x.com/a.png"><script>' })!.logoUrl).toBeNull()
    expect(normalizeStyle({ look: 'utility', logoUrl: 'http://x.com/a.png' })!.logoUrl).toBeNull()
  })

  it('needs a valid brand colour before it will use one', () => {
    expect(normalizeStyle({ look: 'utility', palette: 'brand', brand: { primary: 'red' } })!.palette).toBe('harbor')
    expect(normalizeStyle({ look: 'utility', palette: 'brand', brand: { primary: '#ff0000' } })!.palette).toBe('brand')
  })
})

describe('what a style puts in the page', () => {
  const resolved = resolveStyle(styleForLook('ledger'))

  it('defines shadcn-named tokens as channels, so opacity modifiers work', () => {
    const css = styleCss(resolved)
    expect(css).toMatch(/--primary: \d+ \d+ \d+;/)
    expect(css).toMatch(/--muted-foreground: \d+ \d+ \d+;/)
    expect(css).toContain('tabular-nums')
    const config = JSON.stringify(tailwindConfig(resolved))
    expect(config).toContain('rgb(var(--primary) / <alpha-value>)')
    expect(config).toContain('var(--font-heading)')
  })

  it('briefs the builder with the tokens, the kit and the guardrails', () => {
    const prompt = stylePrompt(resolved)
    expect(prompt).toContain('bg-primary text-primary-foreground')
    expect(prompt).toContain("from 'kit'")
    expect(prompt).toContain('Gradient text')
    expect(prompt).toContain('IBM Plex Sans')
    const noKit = stylePrompt(resolveStyle({ ...styleForLook('ledger'), kit: false }))
    expect(noKit).not.toContain("from 'kit'")
  })

  it('leaves an unstyled app exactly as it was', () => {
    const doc = buildPlaygroundDoc('export default function App(){return null}', { uploadUrl: 'https://www.kanthink.com/api/playground/upload' })
    expect(doc).not.toContain('tailwind.config')
    expect(doc).not.toContain('fonts.googleapis.com')
    expect(doc).not.toContain('kanthinkStyle')
  })

  it('injects the style into a styled app', () => {
    const doc = buildPlaygroundDoc('export default function App(){return null}', {
      title: 'Bills',
      uploadUrl: 'https://www.kanthink.com/api/playground/upload',
      style: { ...styleForLook('ledger'), logoUrl: 'https://res.cloudinary.com/demo/logo.png' },
    })
    expect(doc).toContain('tailwind.config = ')
    expect(doc).toContain('window.kanthinkStyle = ')
    expect(doc).toContain('family=IBM+Plex+Sans')
    expect(doc).toContain('<link rel="icon" href="https://res.cloudinary.com/demo/logo.png" />')
    // The config runs after the CDN is loaded, so it is applied.
    expect(doc.indexOf('cdn.tailwindcss.com')).toBeLessThan(doc.indexOf('tailwind.config = '))
  })

  it('maps the kit from this deployment, and nothing a model declares can take its name', () => {
    const map = JSON.parse(buildImportMap([], { kitOrigin: 'https://www.kanthink.com/anything?x=1' }))
    expect(map.imports.kit).toBe('https://www.kanthink.com/kit/v1.js')
    expect(JSON.parse(buildImportMap([], { kitOrigin: 'javascript:alert(1)' })).imports.kit).toBeUndefined()
    expect(resolveDeps(['kit']).deps).toHaveLength(0)
  })

  it('knows whether code was written against the tokens', () => {
    expect(usesTokens("import { Button } from 'kit'")).toBe(true)
    expect(usesTokens('<div className="bg-background text-foreground">')).toBe(true)
    expect(usesTokens('<div className="bg-white text-gray-900">')).toBe(false)
  })
})

describe('design check', () => {
  const sloppy = `
    export default function App() {
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-500">
          <h1 className="bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-pink-500">✨ Supercharge your bills 🚀</h1>
          <p className="text-xs uppercase tracking-widest">Step one</p>
          <div className="backdrop-blur-md bg-white/10 shadow-purple-500/50 shadow-lg animate-bounce">💡 Unlock insights</div>
          <button className="bg-blue-600 text-gray-300">Go</button>
        </div>
      )
    }`

  it('finds the patterns that make an app look generated', () => {
    const { findings, score } = checkDesign(sloppy, { hasStyle: true })
    const ids = findings.map((f) => f.id)
    expect(ids).toEqual(expect.arrayContaining(['gradient-text', 'ai-gradient', 'grey-on-colour', 'glow', 'bounce', 'emoji-icons', 'hype-copy']))
    expect(findings[0].severity).toBe('high')
    expect(score).toBeLessThan(40)
    expect(findingsBrief(findings)).toContain('Gradient text')
  })

  it('passes clean token-based code', () => {
    const clean = `
      import { Button, Card, CardContent } from 'kit';
      export default function App() {
        return <main className="mx-auto max-w-2xl p-4"><Card><CardContent className="text-foreground">Total <span className="tabular-nums">$42.00</span></CardContent></Card><Button>Add bill</Button></main>
      }`
    expect(checkDesign(clean, { hasStyle: true })).toEqual({ score: 100, findings: [] })
  })

  it('is lenient with games, where emoji are content and motion is the point', () => {
    const game = '<div>🐱🐶🐭</div><div className="animate-bounce"/>'
    expect(checkDesign(game, { look: 'arcade' }).findings).toHaveLength(0)
    expect(checkDesign(game, { look: 'ledger' }).findings.length).toBeGreaterThan(0)
  })

  it('ignores emoji in comments', () => {
    expect(checkDesign('// 🚀 launch\nconst a = 1', {}).findings).toHaveLength(0)
  })
})

describe('passes', () => {
  it('every pass is a visual-only brief', () => {
    for (const pass of STYLE_PASSES) {
      expect(passPrompt(pass, 'const a = 1', 'utility')).toContain('VISUAL pass')
    }
  })

  it('the fix pass carries what the check found', () => {
    expect(passPrompt('fix', '<h1 className="bg-clip-text text-transparent">x</h1>')).toContain('Gradient text')
  })
})

describe('auto-pick fallback', () => {
  it.each([
    ['A daily Sudoku puzzle with notes and hints', 'newsprint'],
    ['Track monthly bills and what is due, with a budget total', 'ledger'],
    ['Volunteer schedule for our church greeters', 'chapel'],
    ['Classroom reading log for students and parents', 'schoolyard'],
    ['A snake game with a leaderboard', 'arcade'],
    ['Something to help me think', 'utility'],
  ])('%s → %s', (brief, look) => {
    expect(heuristicLook(brief)).toBe(look)
  })
})

describe('component kit', async () => {
  // The kit is the file apps import at runtime, loaded here exactly as shipped.
  // Untyped on purpose: it is plain JS, and its inferred prop types are all required.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const kit: any = await import('../public/kit/v1.js')
  const h = React.createElement

  it('renders every component without throwing', () => {
    const tree = h('div', null,
      h(kit.Page, null,
        h(kit.AppHeader, { title: 'Bills', actions: h(kit.Button, { size: 'sm' }, 'Add') }),
        h(kit.Card, null, h(kit.CardHeader, null, h(kit.CardTitle, null, 'Due'), h(kit.CardDescription, null, 'This month')), h(kit.CardContent, null, h(kit.Stat, { label: 'Total', value: '$42', hint: '+3%', trend: 'up' })), h(kit.CardFooter, null, h(kit.Button, { variant: 'outline' }, 'More'))),
        h(kit.Field, { label: 'Amount', hint: 'In dollars' }, h(kit.Input, { type: 'number' })),
        h(kit.Field, { label: 'Notes', error: 'Required' }, h(kit.Textarea)),
        h(kit.Select, { defaultValue: 'a' }, h('option', { value: 'a' }, 'A')),
        h(kit.Checkbox, { label: 'Paid', defaultChecked: true }),
        h(kit.Switch, { label: 'Remind me', checked: false }),
        h(kit.RadioGroup, { defaultValue: 'm', options: [{ value: 'm', label: 'Monthly' }, { value: 'y', label: 'Yearly', hint: 'Save 10%' }] }),
        h(kit.Segmented, { options: [{ value: 'a', label: 'All' }, { value: 'b', label: 'Due' }] }),
        h(kit.Slider, { defaultValue: 4, min: 0, max: 10 }),
        h(kit.Progress, { value: 40 }),
        h(kit.Badge, { variant: 'highlight' }, 'New'),
        h(kit.Tabs, { defaultValue: 'a' }, h(kit.TabsList, null, h(kit.TabsTrigger, { value: 'a' }, 'A'), h(kit.TabsTrigger, { value: 'b' }, 'B')), h(kit.TabsContent, { value: 'a' }, 'Panel A'), h(kit.TabsContent, { value: 'b' }, 'Panel B')),
        h(kit.Alert, { variant: 'destructive', title: 'Overdue' }, 'Pay today'),
        h(kit.EmptyState, { title: 'No bills yet', action: h(kit.Button, null, 'Add bill') }, 'Add the first one.'),
        h(kit.Table, null, h(kit.THead, null, h(kit.TR, null, h(kit.TH, null, 'Bill'), h(kit.TH, { align: 'right' }, 'Amount'))), h(kit.TBody, null, h(kit.TR, null, h(kit.TD, null, 'Rent'), h(kit.TD, { align: 'right' }, '$1,200')))),
        h(kit.Separator), h(kit.Skeleton, { className: 'h-4' }), h(kit.Avatar, { name: 'Ada Lovelace' }), h(kit.Kbd, null, '⌘K'), h(kit.Spinner), h(kit.Tooltip, { content: 'Help' }, h('span', null, '?')),
        h(kit.Logo), h(kit.Dialog, { open: false }), h(kit.Sheet, { open: false }), h(kit.Toaster),
      ))
    const html = renderToString(tree)
    expect(html).toContain('Panel A')
    expect(html).not.toContain('Panel B')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('bg-primary')
    expect(html).toContain('>AL<')
  })

  it('accepts shadcn prop names, which is what models write', () => {
    const html = renderToString(h('div', null,
      h(kit.Separator, { orientation: 'vertical' }),
      h(kit.Button, { size: 'default' }, 'Go'),
      h(kit.Slider, { value: [3], onValueChange: () => {} }),
    ))
    expect(html).toContain('w-px')
    expect(html).toContain('h-11 px-4')
    expect(html).toContain('value="3"')
  })

  it('cn lets a later class win over an earlier one in the same group', () => {
    expect(kit.cn('px-4 py-2 bg-primary', 'px-2')).toBe('py-2 bg-primary px-2')
    expect(kit.cn('text-sm text-foreground', 'text-lg')).toBe('text-foreground text-lg')
    expect(kit.cn('h-11', false, ['rounded-md', { 'rounded-full': true }])).toBe('h-11 rounded-full')
    expect(kit.cn('hover:bg-accent bg-card', 'bg-muted')).toBe('hover:bg-accent bg-muted')
  })
})

describe('the page around a published app', async () => {
  const { hostTheme } = await import('@/lib/playground/hostChrome')

  it('takes the app style colours, so a dark app gets a dark bar', () => {
    const t = hostTheme(styleForLook('arcade'))
    expect(t.mode).toBe('dark')
    expect(t.vars['--kp-primary']).toMatch(/^\d+ \d+ \d+$/)
    expect(t.vars['--kp-bar']).toBeTruthy()
  })

  it('falls back to a quiet neutral for an app without a style', () => {
    const t = hostTheme(null)
    expect(t.mode).toBe('light')
    expect(t.vars['--kp-bg']).toBe('255 255 255')
  })
})
