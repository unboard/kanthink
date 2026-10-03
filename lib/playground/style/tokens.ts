import {
  DENSITIES,
  DEFAULT_LOOK,
  FONT_PAIRINGS,
  LOOKS,
  PALETTES,
  RADII,
  fontsById,
  lookById,
  paletteById,
  type Density,
  type FontFace,
  type FontPairing,
  type Look,
  type Palette,
  type PaletteColors,
  type Radius,
} from './catalog'
import { bestText, contrast, fitForText, hexToOklch, isHex, oklchToHex, rgbChannels } from './color'

/**
 * An app's style: the choices, stored on the app, and everything derived from them.
 *
 * The choices are a handful of ids. Resolving them gives concrete colours, fonts and
 * a radius. Those are injected into the app's page at runtime as CSS variables and a
 * Tailwind config, and handed to the builder as a brief. Because the colours live in
 * variables rather than in the code, recolouring an app that was built with the
 * tokens is instant and costs nothing. No rebuild needed.
 */

export type AppStyle = {
  look: string
  /** A palette id, or 'brand' to build one from `brand`. */
  palette: string
  brand?: { primary: string; highlight?: string | null; mode?: 'light' | 'dark' } | null
  fonts: string
  radius: Radius
  density: Density
  /** Build with the component kit rather than hand-rolling every control. */
  kit: boolean
  logoUrl?: string | null
  /** The owner's own words about how it should feel. */
  direction?: string | null
  /** Who made the current choice. Kan picks on the first build; anything you change is yours. */
  chosenBy: 'kan' | 'owner'
  /** Kan's reason, when Kan chose. */
  why?: string | null
}

export type ResolvedStyle = {
  style: AppStyle
  look: Look
  palette: Palette
  fonts: FontPairing
  radiusPx: number
  density: Density
}

const LIGHT_STATUS = { destructive: '#B42318', success: '#15803D', warning: '#B45309' }
const DARK_STATUS = { destructive: '#F87171', success: '#4ADE80', warning: '#FBBF24' }

/** A logo URL we are willing to interpolate into a page. https, and nothing that can break out of an attribute. */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (url.length > 600 || !/^https:\/\/[^\s"'<>()\\`]+$/.test(url)) return null
  return url
}

/** The default for an app that has never had one, given a look. */
export function styleForLook(lookId: string, chosenBy: AppStyle['chosenBy'] = 'kan', why?: string | null): AppStyle {
  const look = lookById(lookId) ?? lookById(DEFAULT_LOOK)!
  return {
    look: look.id,
    palette: look.palette,
    fonts: look.fonts,
    radius: look.radius,
    density: look.density,
    kit: true,
    logoUrl: null,
    direction: null,
    chosenBy,
    why: why ?? null,
  }
}

/**
 * Anything claiming to be a style, made safe. Unknown ids fall back to the look's
 * defaults rather than failing, so a catalogue change never breaks a stored app.
 * Returns null when there is nothing usable at all.
 */
export function normalizeStyle(input: unknown): AppStyle | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const look = lookById(typeof raw.look === 'string' ? raw.look : null)
  if (!look) return null
  const base = styleForLook(look.id)

  const brandRaw = raw.brand && typeof raw.brand === 'object' ? (raw.brand as Record<string, unknown>) : null
  const brand = brandRaw && isHex(brandRaw.primary)
    ? {
        primary: String(brandRaw.primary).toUpperCase(),
        highlight: isHex(brandRaw.highlight) ? String(brandRaw.highlight).toUpperCase() : null,
        mode: brandRaw.mode === 'dark' ? ('dark' as const) : ('light' as const),
      }
    : null

  const palette = raw.palette === 'brand' && brand
    ? 'brand'
    : paletteById(typeof raw.palette === 'string' ? raw.palette : null)?.id ?? base.palette

  const direction = typeof raw.direction === 'string' ? raw.direction.trim().slice(0, 400) : ''
  const why = typeof raw.why === 'string' ? raw.why.trim().slice(0, 300) : ''

  return {
    look: look.id,
    palette,
    brand,
    fonts: fontsById(typeof raw.fonts === 'string' ? raw.fonts : null)?.id ?? base.fonts,
    radius: RADII.some((r) => r.id === raw.radius) ? (raw.radius as Radius) : base.radius,
    density: DENSITIES.some((d) => d.id === raw.density) ? (raw.density as Density) : base.density,
    kit: raw.kit !== false,
    logoUrl: safeImageUrl(raw.logoUrl),
    direction: direction || null,
    chosenBy: raw.chosenBy === 'owner' ? 'owner' : 'kan',
    why: why || null,
  }
}

/**
 * A full palette from one or two brand colours.
 *
 * The neutrals are tinted slightly toward the brand hue so the page feels like it
 * belongs to the colour rather than sitting next to it. The brand colour itself is
 * kept unless text on it would fail contrast, and then only its lightness moves.
 */
export function brandPalette(primary: string, highlight?: string | null, mode: 'light' | 'dark' = 'light'): Palette {
  const { h } = hexToOklch(primary)
  const n = (l: number, c: number) => oklchToHex({ l, c, h })
  const neutrals = mode === 'light'
    ? { background: n(0.975, 0.006), card: '#FFFFFF', muted: n(0.945, 0.012), border: n(0.895, 0.014), foreground: n(0.22, 0.02), mutedForeground: n(0.48, 0.02) }
    : { background: n(0.17, 0.012), card: n(0.21, 0.014), muted: n(0.25, 0.016), border: n(0.31, 0.018), foreground: n(0.95, 0.008), mutedForeground: n(0.74, 0.02) }

  const mutedForeground = fitForText(neutrals.mutedForeground, neutrals.background)
  const primaryForeground = bestText(primary)
  const safePrimary = fitForText(primary, primaryForeground)

  const hiBase = highlight && isHex(highlight)
    ? highlight
    : oklchToHex({ l: mode === 'light' ? 0.7 : 0.78, c: 0.14, h: (h + 150) % 360 })
  const highlightForeground = bestText(hiBase)
  const safeHighlight = fitForText(hiBase, highlightForeground)

  return {
    id: 'brand',
    name: 'Your colours',
    mode,
    colors: {
      ...neutrals,
      mutedForeground,
      primary: safePrimary,
      primaryForeground,
      highlight: safeHighlight,
      highlightForeground,
    },
  }
}

export function resolveStyle(style: AppStyle): ResolvedStyle {
  const look = lookById(style.look) ?? lookById(DEFAULT_LOOK)!
  const palette = style.palette === 'brand' && style.brand
    ? brandPalette(style.brand.primary, style.brand.highlight, style.brand.mode)
    : paletteById(style.palette) ?? paletteById(look.palette) ?? PALETTES[0]
  const fonts = fontsById(style.fonts) ?? fontsById(look.fonts) ?? FONT_PAIRINGS[0]
  const radiusPx = RADII.find((r) => r.id === style.radius)?.px ?? 8
  return { style, look, palette, fonts, radiusPx, density: style.density }
}

// --- What goes into the page -------------------------------------------------

export type TokenColors = PaletteColors & { destructive: string; destructiveForeground: string; success: string; warning: string }

export function tokenColors(palette: Palette): TokenColors {
  const status = palette.mode === 'dark' ? DARK_STATUS : LIGHT_STATUS
  return {
    ...palette.colors,
    destructive: status.destructive,
    destructiveForeground: bestText(status.destructive),
    success: status.success,
    warning: status.warning,
  }
}

const CSS_VARS: Array<[string, keyof TokenColors]> = [
  ['background', 'background'],
  ['foreground', 'foreground'],
  ['card', 'card'],
  ['card-foreground', 'foreground'],
  ['popover', 'card'],
  ['popover-foreground', 'foreground'],
  ['muted', 'muted'],
  ['muted-foreground', 'mutedForeground'],
  ['secondary', 'muted'],
  ['secondary-foreground', 'foreground'],
  ['accent', 'muted'],
  ['accent-foreground', 'foreground'],
  ['primary', 'primary'],
  ['primary-foreground', 'primaryForeground'],
  ['highlight', 'highlight'],
  ['highlight-foreground', 'highlightForeground'],
  ['border', 'border'],
  ['input', 'border'],
  ['ring', 'primary'],
  ['destructive', 'destructive'],
  ['destructive-foreground', 'destructiveForeground'],
  ['success', 'success'],
  ['warning', 'warning'],
]

function fontStack(face: FontFace): string {
  return `'${face.family}', ${face.fallback === 'serif' ? 'ui-serif, Georgia, serif' : face.fallback === 'monospace' ? 'ui-monospace, monospace' : 'ui-sans-serif, system-ui, sans-serif'}`
}

/** One Google Fonts stylesheet for every face the style uses. */
export function googleFontsHref(fonts: FontPairing): string {
  const families = new Map<string, Set<number>>()
  for (const face of [fonts.heading, fonts.body, fonts.mono]) {
    const set = families.get(face.family) ?? new Set<number>()
    face.weights.forEach((w) => set.add(w))
    families.set(face.family, set)
  }
  const params = [...families.entries()]
    .map(([family, weights]) => `family=${family.replace(/ /g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

export function radiusScale(px: number): Record<string, string> {
  const r = (m: number) => `${Math.round(px * m)}px`
  return { none: '0px', sm: r(0.5), DEFAULT: r(0.75), md: r(1), lg: r(1.25), xl: r(1.5), '2xl': r(2), '3xl': r(2.5), full: '9999px' }
}

/** The :root variables and the handful of base rules every styled app gets. */
export function styleCss(resolved: ResolvedStyle): string {
  const colors = tokenColors(resolved.palette)
  const vars = CSS_VARS.map(([name, key]) => `--${name}: ${rgbChannels(colors[key])};`).join(' ')
  const numeric = resolved.look.id === 'ledger' ? 'font-variant-numeric: tabular-nums;' : ''
  return [
    `:root { ${vars} --radius: ${resolved.radiusPx}px; --font-heading: ${fontStack(resolved.fonts.heading)}; --font-body: ${fontStack(resolved.fonts.body)}; --font-mono: ${fontStack(resolved.fonts.mono)}; color-scheme: ${resolved.palette.mode}; }`,
    `html, body { background: rgb(var(--background)); color: rgb(var(--foreground)); }`,
    `body { font-family: var(--font-body); -webkit-font-smoothing: antialiased; ${numeric} }`,
    `h1, h2, h3 { font-family: var(--font-heading); text-wrap: balance; }`,
    `p { text-wrap: pretty; }`,
    `::selection { background: rgb(var(--primary) / 0.22); }`,
    `:focus-visible { outline: 2px solid rgb(var(--ring)); outline-offset: 2px; }`,
  ].join('\n')
}

/** Assigned to `tailwind.config` straight after the Play CDN loads. */
export function tailwindConfig(resolved: ResolvedStyle): Record<string, unknown> {
  const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`
  return {
    theme: {
      extend: {
        colors: {
          background: c('background'),
          foreground: c('foreground'),
          card: { DEFAULT: c('card'), foreground: c('card-foreground') },
          popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
          muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
          secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
          accent: { DEFAULT: c('accent'), foreground: c('accent-foreground') },
          primary: { DEFAULT: c('primary'), foreground: c('primary-foreground') },
          highlight: { DEFAULT: c('highlight'), foreground: c('highlight-foreground') },
          destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground') },
          success: c('success'),
          warning: c('warning'),
          border: c('border'),
          input: c('input'),
          ring: c('ring'),
        },
        fontFamily: {
          heading: ['var(--font-heading)'],
          sans: ['var(--font-body)'],
          mono: ['var(--font-mono)'],
        },
        borderRadius: radiusScale(resolved.radiusPx),
      },
    },
  }
}

/** What the app itself can read: window.kanthinkStyle. */
export function runtimeStyleInfo(resolved: ResolvedStyle, appName: string) {
  const colors = tokenColors(resolved.palette)
  return {
    look: resolved.look.id,
    mode: resolved.palette.mode,
    density: resolved.density,
    logoUrl: resolved.style.logoUrl ?? null,
    appName,
    colors: { primary: colors.primary, highlight: colors.highlight, background: colors.background, foreground: colors.foreground },
  }
}

// --- What goes to the builder -------------------------------------------------

/**
 * The rules every styled app is built under. Written as instructions to a
 * designer rather than as a list of bans, and each one names what to do instead.
 */
export const DESIGN_GUARDRAILS = `DESIGN QUALITY. These patterns make an app look machine-made. Avoid them, and do the alternative instead:
- Gradient text (bg-clip-text text-transparent) and purple-to-blue gradients. Use solid token colours. Use at most one gradient in the whole app, and only if the direction asks for it.
- Decoration standing in for hierarchy: glows, coloured shadows, glassmorphism (backdrop-blur over translucent white), shadows on every card. Use size, weight and space for hierarchy. Elevation (shadow-lg) is only for things that float: dialogs, menus, toasts.
- Cards inside cards, a coloured left border stripe on every card, a grid of identical stat cards. Use one level of containers. Lists and tables are often better than cards.
- A marketing hero on a tool. The first screen IS the tool, ready to use. Don't add a big centred headline, a subhead and two buttons.
- Emoji as icons or decoration in the interface (✨🚀💡). Use lucide-react icons, or nothing. Emoji are fine as content the person chose.
- Motion nobody asked for: animate-bounce, animate-ping, pulsing content, staggered fade-ins. Motion only answers an action (opening, confirming, a game move), at 150–250ms ease-out, and respects prefers-reduced-motion (motion-safe:).
- ALL-CAPS tracked labels above every heading, "01 / 02 / 03" numbering on things that aren't steps, and meta strings joined with " · " everywhere.
- Grey text on a coloured background. Text on primary uses text-primary-foreground, and on highlight uses text-highlight-foreground.
- Hype copy: "Unlock", "Supercharge", "Seamless", "Elevate", "Effortless", exclamation marks. Labels say exactly what happens ("Add bill", "Check answers"). Use sentence case.
- Pure #000 / #FFF and Tailwind's raw palette (blue-500, gray-100, slate-*) for interface chrome. The tokens are the palette.
Also: one primary button per screen; secondary actions are outline or ghost. Body text is at least text-sm, and at least text-base for long reading. Numbers in tables and totals use tabular-nums. Empty states are one plain sentence plus the action that fills them.`

/** How to use the kit, for the builder. Kept in step with public/kit/v1.js. */
export const KIT_PROMPT = `COMPONENT KIT: import from 'kit'. It's already in the import map and styled with this app's tokens.
Prefer it over hand-rolling controls. It's accessible and consistent, and it follows the style automatically.
  import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Textarea, Label, Field, Select, Checkbox, Switch, RadioGroup, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Dialog, Sheet, Toaster, toast, Progress, Separator, Skeleton, Avatar, Alert, EmptyState, Stat, Table, THead, TBody, TR, TH, TD, Segmented, Slider, Spinner, Tooltip, Kbd, AppHeader, Logo, Page, cn } from 'kit';
  <Button variant="default|secondary|outline|ghost|destructive|link" size="sm|md|lg|icon" loading={bool}>  (any <button> props)
  <Card> <CardHeader><CardTitle/><CardDescription/></CardHeader> <CardContent/> <CardFooter/> </Card>
  <Field label="Amount" hint="optional help" error={msg}><Input type="number" .../></Field>  (Input/Textarea/Select take normal input props; Select takes <option> children)
  <Checkbox checked onChange={(checked)=>{}} label="..."/>   <Switch checked onChange={(on)=>{}} label="..."/>
  <RadioGroup value onChange={(v)=>{}} options={[{value,label,hint?}]}/>   <Segmented value onChange options={[{value,label}]}/>
  <Slider value min max step onChange={(n)=>{}}/>   <Progress value={0-100}/>   <Badge variant="default|secondary|outline|highlight|success|warning|destructive">
  <Tabs value onChange={(v)=>{}}><TabsList><TabsTrigger value="a">A</TabsTrigger></TabsList><TabsContent value="a">…</TabsContent></Tabs>
  <Dialog open onClose title description footer={…}>…</Dialog>   <Sheet open onClose side="right|bottom" title>…</Sheet>
  Render <Toaster/> once at the root, then call toast("Saved") or toast({ title, description, variant: "success|destructive" }).
  <Alert variant="default|destructive|success" title>…</Alert>   <EmptyState icon={<LucideIcon/>} title action={<Button/>}>one line</EmptyState>
  <Stat label value hint trend="up|down"/>   <Table><THead><TR><TH>…</TH></TR></THead><TBody><TR><TD align="right">…</TD></TR></TBody></Table>
  <Page> centres content to a readable width with the right padding for the style's density.
  <AppHeader title actions={…}/> shows the app's logo (or a monogram) and name. <Logo size={32}/> shows the logo alone.
  cn(...classes) joins class names. Every component takes className to extend it.`

export function stylePrompt(resolved: ResolvedStyle): string {
  const colors = tokenColors(resolved.palette)
  const density = DENSITIES.find((d) => d.id === resolved.density)!
  const radius = RADII.find((r) => r.px === resolved.radiusPx)?.name ?? 'Soft'
  const { style, look, fonts } = resolved
  const lines = [
    `STYLE SYSTEM: this app has a chosen style. It overrides any palette, font or corner notes in ESTABLISHED DESIGN DECISIONS.`,
    `Look: ${look.name}. ${look.direction}`,
    style.direction ? `The owner's own direction (follow it): "${style.direction}"` : '',
    ``,
    `Colour: the host page defines these Tailwind colours (shadcn token names). Use them for every surface, text and control, and opacity modifiers work (bg-primary/10):`,
    `  bg-background text-foreground: the page (${colors.background} / ${colors.foreground}), ${resolved.palette.mode} mode`,
    `  bg-card text-card-foreground: raised surfaces`,
    `  bg-muted text-muted-foreground: quiet fills and secondary text`,
    `  bg-primary text-primary-foreground: the main action, selection and focus (${colors.primary})`,
    `  bg-highlight text-highlight-foreground: rare emphasis only (${colors.highlight})`,
    `  bg-accent: hover fill for ghost and list items. border-border, border-input, ring-ring.`,
    `  text-destructive / bg-destructive, text-success, text-warning: state only.`,
    `Use the tokens, not raw Tailwind colours. The owner can recolour the app without a rebuild only through the tokens. Raw colours are acceptable only for content that is inherently coloured (chart series, game pieces).`,
    `Type: font-heading for headings and display numbers (${fonts.heading.family}), font-sans for everything else (${fonts.body.family}, already the default), font-mono for code and IDs (${fonts.mono.family}). Don't set font-family any other way or load other fonts.`,
    `Corners: ${radius}. The rounded-* scale is already mapped to this style, so use rounded-sm/md/lg/xl/full normally and never arbitrary radius values.`,
    `Spacing: ${density.prompt}`,
    style.logoUrl
      ? `Logo: the owner uploaded one. window.kanthinkStyle.logoUrl, or <Logo/> / <AppHeader/> from the kit. Show it once, in the header. Don't recolour or crop it.`
      : `Logo: none uploaded. <AppHeader/> and <Logo/> draw a monogram from the app's name in the primary colour.`,
    ``,
    style.kit ? KIT_PROMPT : `COMPONENTS: the owner turned the kit off, so build controls by hand with the tokens above.`,
    ``,
    DESIGN_GUARDRAILS,
  ]
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n')
}

/** A compact description for the Style tab and for Kan's own notes. */
export function describeStyle(resolved: ResolvedStyle): string {
  return `${resolved.look.name} · ${resolved.palette.name} · ${resolved.fonts.name}`
}

/** True when the code was written against the tokens, so recolouring reaches it. */
export function usesTokens(code: string | null | undefined): boolean {
  if (!code) return false
  return /from\s+['"]kit['"]/.test(code) || /\b(bg|text|border)-(primary|background|foreground|muted|card)\b/.test(code)
}

export { LOOKS, PALETTES, FONT_PAIRINGS, RADII, DENSITIES, contrast }

/** Every face in the catalogue, for the Style tab's pickers to render each choice in its own type. */
export function catalogueFontsHref(): string {
  const families = new Map<string, Set<number>>()
  for (const pairing of FONT_PAIRINGS) {
    for (const face of [pairing.heading, pairing.body]) {
      const set = families.get(face.family) ?? new Set<number>()
      face.weights.forEach((w) => set.add(w))
      families.set(face.family, set)
    }
  }
  const params = [...families.entries()]
    .map(([family, weights]) => `family=${family.replace(/ /g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

export function fontCss(face: FontFace): string {
  return fontStack(face)
}
