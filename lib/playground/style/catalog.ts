/**
 * What an app's style is chosen from.
 *
 * Small on purpose. A long list of options is its own kind of slop: every pick
 * looks a bit like every other. Each entry here is a deliberate choice, made for
 * the kinds of app people actually build here, from a Sudoku board to a bill
 * tracker to a church volunteer rota.
 *
 * Sources and credit. The token names are shadcn/ui's (MIT): models already know
 * `bg-primary text-primary-foreground`, so a build uses them correctly the first
 * time. The idea of matching a product kind to a style, a palette and a type
 * pairing comes from ui-ux-pro-max (MIT). The guardrails and the design passes
 * draw on Impeccable (Apache-2.0) and the anti-slop design lists. Every palette is
 * tested for contrast in tests/app-style.test.ts.
 */

export type PaletteColors = {
  /** The page. */
  background: string
  foreground: string
  /** Raised surfaces: cards, sheets, popovers. */
  card: string
  /** Quiet fills, and the secondary text that sits on the page. */
  muted: string
  mutedForeground: string
  border: string
  /** The main action and the current selection. */
  primary: string
  primaryForeground: string
  /** Rare emphasis: a badge, a streak, the one number that matters. */
  highlight: string
  highlightForeground: string
}

export type Palette = {
  id: string
  name: string
  mode: 'light' | 'dark'
  colors: PaletteColors
}

export const PALETTES: Palette[] = [
  {
    id: 'harbor', name: 'Harbor', mode: 'light',
    colors: { background: '#F3F6F9', foreground: '#0F1B2A', card: '#FFFFFF', muted: '#E6EDF3', mutedForeground: '#4A5A6C', border: '#D3DDE7', primary: '#1D4E89', primaryForeground: '#FFFFFF', highlight: '#D9822B', highlightForeground: '#1F1305' },
  },
  {
    id: 'ledger', name: 'Ledger', mode: 'light',
    colors: { background: '#F4F6F5', foreground: '#13201B', card: '#FFFFFF', muted: '#E8EEEB', mutedForeground: '#4F5E57', border: '#D5DED9', primary: '#0F5132', primaryForeground: '#FFFFFF', highlight: '#B7791F', highlightForeground: '#1C1405' },
  },
  {
    id: 'newsprint', name: 'Newsprint', mode: 'light',
    colors: { background: '#F2F0EB', foreground: '#1A1A1A', card: '#FBFAF8', muted: '#E6E2D9', mutedForeground: '#57534C', border: '#D6D1C6', primary: '#1A1A1A', primaryForeground: '#F2F0EB', highlight: '#C8102E', highlightForeground: '#FFFFFF' },
  },
  {
    id: 'orchard', name: 'Orchard', mode: 'light',
    colors: { background: '#F8F5EF', foreground: '#2A2118', card: '#FFFFFF', muted: '#EFE9DF', mutedForeground: '#6B5D4F', border: '#E2D9CC', primary: '#3F6B2A', primaryForeground: '#FFFFFF', highlight: '#D4A017', highlightForeground: '#2A2118' },
  },
  {
    id: 'chapel', name: 'Chapel', mode: 'light',
    colors: { background: '#F6F4F8', foreground: '#1F1A2B', card: '#FFFFFF', muted: '#ECE8F1', mutedForeground: '#5B5468', border: '#DCD6E4', primary: '#4B2E83', primaryForeground: '#FFFFFF', highlight: '#C9A227', highlightForeground: '#1F1A2B' },
  },
  {
    id: 'schoolyard', name: 'Schoolyard', mode: 'light',
    colors: { background: '#F5F8FF', foreground: '#14213D', card: '#FFFFFF', muted: '#E7EEFC', mutedForeground: '#4C5874', border: '#D3DCF0', primary: '#2148C0', primaryForeground: '#FFFFFF', highlight: '#F2B705', highlightForeground: '#14213D' },
  },
  {
    id: 'campaign', name: 'Campaign', mode: 'light',
    colors: { background: '#F7F7F9', foreground: '#101828', card: '#FFFFFF', muted: '#EBEBF0', mutedForeground: '#4B5565', border: '#D9DBE3', primary: '#B42318', primaryForeground: '#FFFFFF', highlight: '#1E3A8A', highlightForeground: '#FFFFFF' },
  },
  {
    id: 'salon', name: 'Salon', mode: 'light',
    colors: { background: '#FAF6F6', foreground: '#2B1E22', card: '#FFFFFF', muted: '#F1E7E8', mutedForeground: '#6E5A60', border: '#E7D9DC', primary: '#8C3B5A', primaryForeground: '#FFFFFF', highlight: '#9A6A3E', highlightForeground: '#FFFFFF' },
  },
  {
    id: 'clinic', name: 'Clinic', mode: 'light',
    colors: { background: '#F3F8F8', foreground: '#0E2526', card: '#FFFFFF', muted: '#E2EFEF', mutedForeground: '#48615F', border: '#CFE0DF', primary: '#0F766E', primaryForeground: '#FFFFFF', highlight: '#B45309', highlightForeground: '#FFFFFF' },
  },
  {
    id: 'citrus', name: 'Citrus', mode: 'light',
    colors: { background: '#FDFBF3', foreground: '#1E1B10', card: '#FFFFFF', muted: '#F4EFD9', mutedForeground: '#5E5840', border: '#E8E1C5', primary: '#C2411F', primaryForeground: '#FFFFFF', highlight: '#17BEBB', highlightForeground: '#06302F' },
  },
  {
    id: 'mono', name: 'Mono', mode: 'light',
    colors: { background: '#FFFFFF', foreground: '#161616', card: '#FAFAFA', muted: '#F0F0F0', mutedForeground: '#5C5C5C', border: '#E2E2E2', primary: '#161616', primaryForeground: '#FFFFFF', highlight: '#2F5BEA', highlightForeground: '#FFFFFF' },
  },
  {
    id: 'night-shift', name: 'Night shift', mode: 'dark',
    colors: { background: '#121417', foreground: '#ECEEF0', card: '#1A1D21', muted: '#23272C', mutedForeground: '#9BA3AD', border: '#2E333A', primary: '#7DD3FC', primaryForeground: '#0B1A24', highlight: '#FBBF24', highlightForeground: '#1F1600' },
  },
  {
    id: 'graphite', name: 'Graphite', mode: 'dark',
    colors: { background: '#161616', foreground: '#EDEDED', card: '#1E1E1E', muted: '#272727', mutedForeground: '#A0A0A0', border: '#333333', primary: '#F5F5F5', primaryForeground: '#161616', highlight: '#FF7A45', highlightForeground: '#1F0D04' },
  },
  {
    id: 'forest-night', name: 'Forest night', mode: 'dark',
    colors: { background: '#0F1612', foreground: '#E7EFE9', card: '#16201A', muted: '#1E2A23', mutedForeground: '#94A89B', border: '#2A3830', primary: '#9BD18B', primaryForeground: '#0E1A10', highlight: '#E8C468', highlightForeground: '#1C1505' },
  },
  {
    id: 'arcade', name: 'Arcade', mode: 'dark',
    colors: { background: '#14102A', foreground: '#F3F0FF', card: '#1D1838', muted: '#282247', mutedForeground: '#A9A1CC', border: '#352E5C', primary: '#FF5D8F', primaryForeground: '#1A0A12', highlight: '#3DDC97', highlightForeground: '#08261A' },
  },
]

export type FontFace = { family: string; weights: number[]; fallback: 'sans-serif' | 'serif' | 'monospace' }

export type FontPairing = {
  id: string
  name: string
  heading: FontFace
  body: FontFace
  mono: FontFace
  /** One line on what it's for, shown in the picker. */
  note: string
}

const plexMono: FontFace = { family: 'IBM Plex Mono', weights: [400, 500], fallback: 'monospace' }
const jbMono: FontFace = { family: 'JetBrains Mono', weights: [400, 600], fallback: 'monospace' }

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'figtree', name: 'Figtree', note: 'Plain and modern. Works for nearly anything.',
    heading: { family: 'Figtree', weights: [600, 700], fallback: 'sans-serif' },
    body: { family: 'Figtree', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'plex', name: 'IBM Plex', note: 'Exact and businesslike. Good with numbers and tables.',
    heading: { family: 'IBM Plex Sans', weights: [500, 600], fallback: 'sans-serif' },
    body: { family: 'IBM Plex Sans', weights: [400, 500], fallback: 'sans-serif' },
    mono: plexMono,
  },
  {
    id: 'newsreader', name: 'Newsreader + Public Sans', note: 'Newspaper headlines, a clear sans underneath.',
    heading: { family: 'Newsreader', weights: [500, 600, 700], fallback: 'serif' },
    body: { family: 'Public Sans', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: plexMono,
  },
  {
    id: 'fraunces', name: 'Fraunces + Source Sans', note: 'A warm serif with character.',
    heading: { family: 'Fraunces', weights: [500, 600, 700], fallback: 'serif' },
    body: { family: 'Source Sans 3', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'garamond', name: 'EB Garamond + Mulish', note: 'Traditional and dignified.',
    heading: { family: 'EB Garamond', weights: [500, 600], fallback: 'serif' },
    body: { family: 'Mulish', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: plexMono,
  },
  {
    id: 'manrope', name: 'Manrope', note: 'Friendly and open. Suits local businesses.',
    heading: { family: 'Manrope', weights: [600, 700, 800], fallback: 'sans-serif' },
    body: { family: 'Manrope', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'nunito', name: 'Nunito', note: 'Rounded and approachable. Schools and families.',
    heading: { family: 'Nunito', weights: [700, 800], fallback: 'sans-serif' },
    body: { family: 'Nunito', weights: [400, 600, 700], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'archivo', name: 'Archivo', note: 'Loud, condensed headlines. Campaigns and events.',
    heading: { family: 'Archivo Black', weights: [400], fallback: 'sans-serif' },
    body: { family: 'Archivo', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'bodoni', name: 'Bodoni Moda + Jost', note: 'High-contrast and polished. Boutiques and salons.',
    heading: { family: 'Bodoni Moda', weights: [500, 600], fallback: 'serif' },
    body: { family: 'Jost', weights: [400, 500], fallback: 'sans-serif' },
    mono: plexMono,
  },
  {
    id: 'grotesk', name: 'Space Grotesk + DM Sans', note: 'Technical with a bit of attitude.',
    heading: { family: 'Space Grotesk', weights: [500, 600, 700], fallback: 'sans-serif' },
    body: { family: 'DM Sans', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'chakra', name: 'Chakra Petch', note: 'Squared-off and game-like.',
    heading: { family: 'Chakra Petch', weights: [600, 700], fallback: 'sans-serif' },
    body: { family: 'Chakra Petch', weights: [400, 500], fallback: 'sans-serif' },
    mono: jbMono,
  },
  {
    id: 'public', name: 'Public Sans', note: 'Neutral and civic. Forms people must fill in correctly.',
    heading: { family: 'Public Sans', weights: [600, 700], fallback: 'sans-serif' },
    body: { family: 'Public Sans', weights: [400, 500, 600], fallback: 'sans-serif' },
    mono: plexMono,
  },
]

export type Radius = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export const RADII: { id: Radius; name: string; px: number }[] = [
  { id: 'none', name: 'Square', px: 0 },
  { id: 'sm', name: 'Crisp', px: 4 },
  { id: 'md', name: 'Soft', px: 8 },
  { id: 'lg', name: 'Round', px: 12 },
  { id: 'xl', name: 'Pillowy', px: 18 },
]

export type Density = 'compact' | 'comfortable' | 'airy'
export const DENSITIES: { id: Density; name: string; prompt: string }[] = [
  { id: 'compact', name: 'Compact', prompt: 'Compact: tight rows (py-2), small gaps (gap-2/3), more on screen at once. Built for people who use it daily.' },
  { id: 'comfortable', name: 'Comfortable', prompt: 'Comfortable: standard spacing (p-4, gap-4), 44px tap targets.' },
  { id: 'airy', name: 'Airy', prompt: 'Airy: generous space (p-6, gap-6, section gaps of 10+), fewer things per screen, larger type.' },
]

export type Look = {
  id: string
  name: string
  /** Who it's for, in a few words, for the picker and for auto-pick. */
  fits: string
  palette: string
  fonts: string
  radius: Radius
  density: Density
  /**
   * Art direction, written for the builder. This is the part that makes two apps
   * with the same palette still feel like different products.
   */
  direction: string
}

export const LOOKS: Look[] = [
  {
    id: 'utility', name: 'Utility', fits: 'everyday tools, calculators, planners, trackers',
    palette: 'harbor', fonts: 'figtree', radius: 'md', density: 'comfortable',
    direction: 'A quiet, capable tool. The first screen is the tool itself, not a pitch for it. Hierarchy comes from size, weight and space; color is saved for the primary action and state.',
  },
  {
    id: 'ledger', name: 'Ledger', fits: 'money, bills, budgets, invoices, accounting, inventory',
    palette: 'ledger', fonts: 'plex', radius: 'sm', density: 'compact',
    direction: 'Feels like a well-kept ledger. Numbers are the content: tabular figures (tabular-nums), right-aligned amounts, currency set consistently, negative amounts clearly marked. Tables and dense lists beat cards. Totals sit in a plain summary strip, not in decorated stat cards.',
  },
  {
    id: 'newsprint', name: 'Newsprint', fits: 'puzzles, word and number games, quizzes, reading, newsletters',
    palette: 'newsprint', fonts: 'newsreader', radius: 'none', density: 'comfortable',
    direction: 'Like the puzzle page of a good newspaper. Square corners, hairline rules (border-border) instead of shadows, a strong serif headline, and the board or text as the hero. Red is used only for errors and the one thing that needs attention.',
  },
  {
    id: 'neighborly', name: 'Neighborly', fits: 'local businesses, restaurants, contractors, retail, bookings',
    palette: 'orchard', fonts: 'manrope', radius: 'lg', density: 'comfortable',
    direction: 'Warm and trustworthy, like a good local shop. Plain, specific wording. Photos and real content carry the personality, never decorative gradients. Calls to action name the job ("Book a table", "Get a quote").',
  },
  {
    id: 'chapel', name: 'Chapel', fits: 'churches, ministries, nonprofits, volunteers, events',
    palette: 'chapel', fonts: 'garamond', radius: 'md', density: 'airy',
    direction: 'Dignified and calm. A classic serif for headings, plenty of space, and a single gold highlight used sparingly. Nothing flashy or salesy. Readable for older eyes: body text at least text-base.',
  },
  {
    id: 'schoolyard', name: 'Schoolyard', fits: 'schools, PTOs, kids, families, classrooms, sports leagues',
    palette: 'schoolyard', fonts: 'nunito', radius: 'xl', density: 'comfortable',
    direction: 'Bright and friendly without being childish. Rounded shapes, big tap targets and clear labels. Yellow is the highlight, so use it for celebration and progress, never for body text.',
  },
  {
    id: 'campaign', name: 'Campaign', fits: 'political campaigns, causes, fundraising, rallies, announcements',
    palette: 'campaign', fonts: 'archivo', radius: 'sm', density: 'comfortable',
    direction: 'Bold and direct, like good campaign print. Big condensed headlines, strong red and navy, and one clear action per screen. Short, confident sentences.',
  },
  {
    id: 'boutique', name: 'Boutique', fits: 'salons, spas, boutiques, beauty, weddings, gifts',
    palette: 'salon', fonts: 'bodoni', radius: 'md', density: 'airy',
    direction: 'Polished and considered. A high-contrast serif for headings, generous whitespace, and fine details: thin borders and restrained color. Imagery leads; UI chrome stays out of the way.',
  },
  {
    id: 'clinic', name: 'Clinic', fits: 'appointments, intake forms, health office admin, checklists, compliance',
    palette: 'clinic', fonts: 'public', radius: 'md', density: 'comfortable',
    direction: 'Clear, reassuring and accessible. Forms with visible labels, helpful hints and plain error messages. Steps are numbered only when they really are a sequence.',
  },
  {
    id: 'playful', name: 'Playful', fits: 'creative tools, generators, party planning, hobbies',
    palette: 'citrus', fonts: 'grotesk', radius: 'lg', density: 'comfortable',
    direction: 'Lively and confident: one punchy color, one surprising accent, and type with some attitude. Fun comes from content and interaction, not from bouncing animations or emoji.',
  },
  {
    id: 'studio-dark', name: 'Studio dark', fits: 'creative pro tools, editors, dashboards, focus tools',
    palette: 'graphite', fonts: 'grotesk', radius: 'md', density: 'compact',
    direction: 'A dark workspace for people who sit in it for hours. Low-glare surfaces, crisp light text, one warm accent. No glows, no neon, no glass.',
  },
  {
    id: 'calm', name: 'Calm', fits: 'journaling, habits, wellbeing, meditation, slow games',
    palette: 'forest-night', fonts: 'fraunces', radius: 'lg', density: 'airy',
    direction: 'Slow and restful. Soft dark greens, a warm serif, wide margins, and gentle transitions only in response to what the person does.',
  },
  {
    id: 'arcade', name: 'Arcade', fits: 'games, scoreboards, trivia, competitions',
    palette: 'arcade', fonts: 'chakra', radius: 'lg', density: 'comfortable',
    direction: 'A game, not a form. The play area is the hero and fills the screen. Feedback is immediate and satisfying (a quick scale or color change on a move, 150ms). Score and state are always visible. Pink is the main action, green is success.',
  },
  {
    id: 'mono', name: 'Mono', fits: 'minimal tools, writing, portfolios, anything that should feel invisible',
    palette: 'mono', fonts: 'figtree', radius: 'sm', density: 'comfortable',
    direction: 'Black, white and one blue. Typography and alignment do all the work. No shadows; borders only where they separate.',
  },
]

export const DEFAULT_LOOK = 'utility'

export const paletteById = (id?: string | null) => PALETTES.find((p) => p.id === id)
export const fontsById = (id?: string | null) => FONT_PAIRINGS.find((f) => f.id === id)
export const lookById = (id?: string | null) => LOOKS.find((l) => l.id === id)
