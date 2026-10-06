/**
 * A design check that reads the code: no model, no cost, the same answer every time.
 *
 * Each detector looks for a pattern that makes a generated app look generated:
 * gradient text, purple-to-blue washes, glows, emoji standing in for icons, colors
 * hard-coded where the style's tokens belong. Findings name the fix in plain words,
 * because the Style tab hands them straight to a build as the brief for "Fix these".
 *
 * Deliberately conservative. A false alarm on something the owner chose costs more
 * trust than a missed nit, so each rule needs a clear signal and counts that are
 * high enough to mean a habit rather than a choice.
 */

export type Severity = 'high' | 'medium' | 'low'

export type Finding = {
  id: string
  severity: Severity
  title: string
  /** What to do instead, phrased as an instruction a builder can follow. */
  fix: string
  count: number
}

export type CheckResult = { score: number; findings: Finding[] }

type Context = { hasStyle: boolean; game: boolean }

type Rule = {
  id: string
  severity: Severity | ((count: number, ctx: Context) => Severity | null)
  title: string
  fix: string
  count: (code: string, ctx: Context) => number
}

const count = (code: string, re: RegExp) => (code.match(re) || []).length

/** Every className string in the code, so rules can look at classes that appear together. */
function classStrings(code: string): string[] {
  const out: string[] = []
  const re = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\})/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  // cn("...", ...) and template-free helpers often hold the rest.
  const call = /\b(?:cn|clsx|classNames)\(([^)]*)\)/g
  while ((m = call.exec(code))) out.push(m[1])
  return out
}

const COLOR = '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
const COOL = '(?:purple|violet|indigo|fuchsia)'

const RULES: Rule[] = [
  {
    id: 'gradient-text',
    severity: 'high',
    title: 'Gradient text',
    fix: 'Replace gradient text (bg-clip-text text-transparent) with solid text-foreground or text-primary.',
    count: (code) => classStrings(code).filter((c) => /\bbg-clip-text\b/.test(c) && /\btext-transparent\b/.test(c)).length,
  },
  {
    id: 'ai-gradient',
    severity: 'high',
    title: 'Purple-to-blue gradient',
    fix: 'Remove the purple/indigo/blue gradients. Use a solid token color (bg-primary, bg-muted or bg-background).',
    count: (code) => classStrings(code).filter((c) => new RegExp(`\\bfrom-${COOL}-\\d+`).test(c) && new RegExp(`\\b(?:to|via)-(?:blue|indigo|purple|violet|pink|fuchsia|cyan|sky)-\\d+`).test(c)).length,
  },
  {
    id: 'gradients',
    severity: (n) => (n >= 3 ? 'medium' : null),
    title: 'Gradients as decoration',
    fix: 'Cut decorative gradients down to none, or one at most. Use solid surfaces (bg-card, bg-muted) and let type and spacing carry the hierarchy.',
    count: (code) => count(code, /\bbg-gradient-to-[trbl]{1,2}\b|linear-gradient\(/g),
  },
  {
    id: 'grey-on-colour',
    severity: 'high',
    title: 'Gray text on a colored background',
    fix: 'Text on a colored fill must use its paired foreground (text-primary-foreground on bg-primary, text-highlight-foreground on bg-highlight), never gray.',
    count: (code) => classStrings(code).filter((c) => new RegExp(`\\bbg-(?:primary|highlight|${COLOR}-[5-9]00)\\b`).test(c) && /\btext-(?:gray|slate|zinc|neutral|stone)-[3-6]00\b|\btext-muted-foreground\b/.test(c)).length,
  },
  {
    id: 'glass',
    severity: (n) => (n >= 2 ? 'medium' : 'low'),
    title: 'Glassmorphism',
    fix: 'Replace frosted glass (backdrop-blur on translucent white) with solid bg-card surfaces and a border-border edge.',
    count: (code) => classStrings(code).filter((c) => /\bbackdrop-blur/.test(c) && /\bbg-(?:white|black|card|background)\/\d+/.test(c)).length,
  },
  {
    id: 'glow',
    severity: 'medium',
    title: 'Glows and colored shadows',
    fix: 'Remove colored shadows and glows. Elevation is only for floating things (dialogs, menus) and uses a plain shadow.',
    count: (code) => count(code, new RegExp(`\\bshadow-${COLOR}-\\d{2,3}(?:\\/\\d+)?\\b|shadow-\\[0_0_|drop-shadow-\\[0_0_`, 'g')),
  },
  {
    id: 'shadows',
    severity: (n) => (n >= 6 ? 'low' : null),
    title: 'Shadows on everything',
    fix: 'Take shadows off cards and list items. Separate with border-border or spacing instead. Keep shadow-lg for overlays only.',
    count: (code) => count(code, /\bshadow-(?:md|lg|xl|2xl)\b/g),
  },
  {
    id: 'bounce',
    severity: (n, ctx) => (ctx.game ? (n >= 3 ? 'low' : null) : 'medium'),
    title: 'Attention-seeking animation',
    fix: 'Remove animate-bounce / animate-ping / looping pulses on content. Motion should only answer an action, at 150–250ms ease-out.',
    count: (code) => count(code, /\banimate-(?:bounce|ping)\b/g) + Math.max(0, count(code, /\banimate-pulse\b/g) - 2),
  },
  {
    id: 'emoji-icons',
    severity: (n, ctx) => (ctx.game ? (n >= 8 ? 'low' : null) : n >= 3 ? 'medium' : 'low'),
    title: 'Emoji used as icons',
    fix: 'Replace decorative emoji in headings, buttons and labels with lucide-react icons, or remove them. Keep emoji only where they are content the person chose.',
    count: (code) => {
      // Inside JSX text and string literals, not in comments.
      const stripped = code.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')
      return count(stripped, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu)
    },
  },
  {
    id: 'raw-colours',
    severity: (n, ctx) => (!ctx.hasStyle ? null : n >= 12 ? 'medium' : n >= 6 ? 'low' : null),
    title: 'Hard-coded colors',
    fix: 'Swap Tailwind palette colors (gray-100, blue-600, slate-*) in the interface for the style tokens: bg-background, bg-card, bg-muted, text-foreground, text-muted-foreground, bg-primary, border-border. That lets the owner recolor the app.',
    count: (code) => count(code, new RegExp(`\\b(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline)-${COLOR}-\\d{2,3}\\b`, 'g')),
  },
  {
    id: 'pure-black',
    severity: (n) => (n >= 2 ? 'low' : null),
    title: 'Pure black and white',
    fix: 'Replace bg-black / text-black / #000 and #fff surfaces with text-foreground, bg-background and bg-card.',
    count: (code) => count(code, /\b(?:bg|text)-black\b(?!\/)|['"]#000(?:000)?['"]/g),
  },
  {
    id: 'fonts',
    severity: (n, ctx) => (ctx.hasStyle ? 'medium' : 'low'),
    title: 'Fonts set by hand',
    fix: "Remove hand-set font families (fontFamily styles, font-['…'], Inter/Arial/Roboto). Use font-heading for headings and font-sans for text, which the style supplies.",
    count: (code) => count(code, /fontFamily\s*:|font-\[['"]|['"](?:Inter|Arial|Roboto|Helvetica)['",]/g),
  },
  {
    id: 'eyebrows',
    severity: (n) => (n >= 3 ? 'low' : null),
    title: 'Caps labels everywhere',
    fix: 'Drop the tracked ALL-CAPS eyebrow labels above headings. A clear heading is enough.',
    count: (code) => classStrings(code).filter((c) => /\buppercase\b/.test(c) && /\btracking-(?:wide|wider|widest)\b/.test(c)).length,
  },
  {
    id: 'side-stripes',
    severity: (n) => (n >= 2 ? 'low' : null),
    title: 'Colored side stripes',
    fix: 'Remove the thick colored left borders (border-l-4) on cards and callouts. Use a small badge or icon if state needs showing.',
    count: (code) => count(code, /\bborder-l-(?:4|8)\b/g),
  },
  {
    id: 'hover-scale',
    severity: (n) => (n >= 3 ? 'low' : null),
    title: 'Everything grows on hover',
    fix: 'Remove hover:scale-* from cards and buttons. Hover feedback is a color change (hover:bg-accent). Touch screens never see hover anyway.',
    count: (code) => count(code, /\bhover:scale-1\d\d\b/g),
  },
  {
    id: 'hype-copy',
    severity: (n) => (n >= 2 ? 'low' : null),
    title: 'Hype words',
    fix: 'Rewrite hype copy ("Unlock", "Supercharge", "Seamless", "Elevate", "Effortless", "Revolutionize") as plain, specific words about what happens.',
    count: (code) => count(code, /\b(?:Unlock|Supercharge|Seamless(?:ly)?|Elevate|Effortless(?:ly)?|Revolutioni[sz]e|Game[- ]chang(?:er|ing)|Next[- ]level)\b/g),
  },
  {
    id: 'inline-colours',
    severity: (n) => (n >= 4 ? 'low' : null),
    title: 'Colors in inline styles',
    fix: 'Move inline style colors (style={{ color: "#…" }}) to token classes so they follow the style.',
    count: (code) => count(code, /(?:color|background(?:Color)?|borderColor)\s*:\s*['"`]#[0-9a-fA-F]{3,8}/g),
  },
]

const WEIGHT: Record<Severity, number> = { high: 18, medium: 9, low: 4 }

export function checkDesign(code: string | null | undefined, opts: { hasStyle?: boolean; look?: string | null } = {}): CheckResult {
  if (!code) return { score: 100, findings: [] }
  const ctx: Context = { hasStyle: !!opts.hasStyle, game: opts.look === 'arcade' || opts.look === 'playful' }
  const findings: Finding[] = []
  for (const rule of RULES) {
    const n = rule.count(code, ctx)
    if (n <= 0) continue
    const severity = typeof rule.severity === 'function' ? rule.severity(n, ctx) : rule.severity
    if (!severity) continue
    findings.push({ id: rule.id, severity, title: rule.title, fix: rule.fix, count: n })
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + WEIGHT[f.severity], 0))
  return { score, findings }
}

/** The findings as a build brief, for "Fix these" and for the next build's context. */
export function findingsBrief(findings: Finding[]): string {
  return findings.map((f) => `- ${f.title} (${f.count}×): ${f.fix}`).join('\n')
}
