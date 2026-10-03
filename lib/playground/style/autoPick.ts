import { runStructured } from '../generateClient'
import { getPlaygroundModel, type PlaygroundProvider } from '../models'
import { DEFAULT_LOOK, DENSITIES, FONT_PAIRINGS, LOOKS, PALETTES, RADII } from './catalog'
import { normalizeStyle, styleForLook, type AppStyle } from './tokens'

/**
 * Kan picks an app's style on its first build, so the owner never has to.
 *
 * A small, cheap call: the brief in, five catalogue ids and a reason out. If it
 * fails for any reason, the keyword match below picks instead. A first build must
 * never wait on, or fail because of, its paint colour.
 */

const PICK_MODEL: Record<PlaygroundProvider, { id: string; maxTokens: number }> = {
  google: { id: 'gemini-3.1-flash-lite', maxTokens: 800 },
  openai: { id: 'gpt-5.6-luna', maxTokens: 4000 },
  anthropic: { id: 'claude-haiku-4-5', maxTokens: 800 },
}

/** Extra words people use for each look's kind of app, beyond its `fits` line. */
const KEYWORDS: Record<string, string[]> = {
  ledger: ['bill', 'bills', 'budget', 'expense', 'invoice', 'payment', 'payroll', 'tax', 'ledger', 'accounting', 'money', 'finance', 'inventory', 'receipt', 'mileage', 'quote', 'estimate', 'tithe', 'donation tracker'],
  newsprint: ['sudoku', 'crossword', 'puzzle', 'word', 'wordle', 'quiz', 'trivia', 'newsletter', 'reading', 'article', 'bulletin', 'riddle'],
  neighborly: ['restaurant', 'menu', 'cafe', 'bakery', 'contractor', 'plumber', 'landscap', 'shop', 'store', 'booking', 'local', 'real estate', 'listing', 'insurance'],
  chapel: ['church', 'sermon', 'ministry', 'worship', 'prayer', 'volunteer', 'nonprofit', 'charity', 'congregation', 'bible', 'pastor'],
  schoolyard: ['school', 'pto', 'pta', 'class', 'classroom', 'teacher', 'student', 'kid', 'kids', 'family', 'chore', 'homework', 'league', 'team', 'coach', 'daycare', 'preschool'],
  campaign: ['campaign', 'candidate', 'election', 'voter', 'canvass', 'rally', 'petition', 'fundrais', 'cause', 'political'],
  boutique: ['salon', 'spa', 'beauty', 'boutique', 'wedding', 'bridal', 'nail', 'stylist', 'barber', 'florist', 'gift'],
  clinic: ['appointment', 'intake', 'patient', 'dental', 'clinic', 'medical', 'checklist', 'compliance', 'form', 'onboarding', 'health'],
  playful: ['generator', 'party', 'birthday', 'hobby', 'craft', 'meme', 'random', 'fun'],
  'studio-dark': ['editor', 'dashboard', 'studio', 'design tool', 'code', 'developer', 'focus', 'timer'],
  calm: ['journal', 'habit', 'mood', 'meditat', 'gratitude', 'sleep', 'wellbeing', 'reflection', 'breath'],
  arcade: ['game', 'arcade', 'score', 'level', 'player', 'leaderboard', 'snake', 'tetris', 'match', 'battle', 'tic tac'],
  mono: ['minimal', 'portfolio', 'writing', 'notes', 'markdown'],
}

/** The look whose words appear most in the brief. Whole-word-ish, case-insensitive. */
export function heuristicLook(text: string): string {
  const t = ` ${text.toLowerCase()} `
  let best = DEFAULT_LOOK
  let bestScore = 0
  for (const look of LOOKS) {
    const words = [...(KEYWORDS[look.id] ?? []), ...look.fits.split(/,\s*/)]
    let score = 0
    for (const w of words) {
      if (w.length < 3) continue
      if (t.includes(` ${w}`)) score += w.includes(' ') ? 2 : 1
    }
    if (score > bestScore) { best = look.id; bestScore = score }
  }
  return best
}

function catalogue(): string {
  return [
    'LOOKS (id: who it fits, and its default palette / fonts / corners / density):',
    ...LOOKS.map((l) => `- ${l.id}: ${l.fits} (${l.palette} / ${l.fonts} / ${l.radius} / ${l.density})`),
    '',
    'PALETTES:',
    ...PALETTES.map((p) => `- ${p.id}: ${p.name}, ${p.mode}, primary ${p.colors.primary}, highlight ${p.colors.highlight}`),
    '',
    'FONTS:',
    ...FONT_PAIRINGS.map((f) => `- ${f.id}: ${f.note}`),
  ].join('\n')
}

const SYSTEM = `You art-direct small single-screen web apps. Choose a style for the app described, from the catalogue only.

Start from the look whose audience fits best, and keep its defaults unless the brief gives a reason to change one: a stated colour or brand, a dark or light preference, an audience the default would suit poorly (for example older readers need airy density and a larger type). Games want the play area to dominate. Money and data apps want compact density and exact type. Don't pick dark for a business form unless the brief asks for it.

"why" is one short sentence in plain words for the app's owner: what you picked and the reason.`

const SCHEMA = {
  type: 'object',
  properties: {
    look: { type: 'string', enum: LOOKS.map((l) => l.id) },
    palette: { type: 'string', enum: PALETTES.map((p) => p.id) },
    fonts: { type: 'string', enum: FONT_PAIRINGS.map((f) => f.id) },
    radius: { type: 'string', enum: RADII.map((r) => r.id) },
    density: { type: 'string', enum: DENSITIES.map((d) => d.id) },
    why: { type: 'string' },
  },
  required: ['look', 'palette', 'fonts', 'radius', 'density', 'why'],
}

export async function pickStyle(opts: {
  brief: string
  provider?: PlaygroundProvider
  apiKey?: string
}): Promise<AppStyle> {
  const fallback = () => {
    const look = heuristicLook(opts.brief)
    const name = LOOKS.find((l) => l.id === look)!.name
    return styleForLook(look, 'kan', `${name} suits what this app is for.`)
  }
  if (!opts.provider || !opts.apiKey) return fallback()
  try {
    const pick = PICK_MODEL[opts.provider]
    const response = await runStructured({
      model: getPlaygroundModel(pick.id),
      apiKey: opts.apiKey,
      systemInstruction: `${SYSTEM}\n\n${catalogue()}`,
      userText: `THE APP:\n${opts.brief.slice(0, 6000)}`,
      images: [],
      schema: SCHEMA,
      schemaName: 'app_style',
      maxOutputTokens: pick.maxTokens,
      signal: AbortSignal.timeout(25_000),
    })
    const parsed = JSON.parse(response.text || '{}')
    return normalizeStyle({ ...parsed, kit: true, chosenBy: 'kan' }) ?? fallback()
  } catch (error) {
    console.warn('[playground/style] auto-pick fell back to keywords:', error instanceof Error ? error.message : error)
    return fallback()
  }
}
