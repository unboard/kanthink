/**
 * Data for the reimagined Kanthink, drawn from the owner's real account
 * (September 2026) — real app names, real app messages, real shares, real
 * voice requests. Third parties are described, never named or emailed.
 */

// ── What comes back ──────────────────────────────────────────────────────────

export interface AppPerson {
  id: string;
  who: string;
  text: string;
  when: string;
  replied?: string;
}

export interface App {
  id: string;
  name: string;
  card: string;
  place: string;
  status: 'published' | 'draft';
  builds: number;
  opens?: number;
  people?: number;
  updated: string;
  tint: string;
  emoji: string;
  people_msgs?: AppPerson[];
}

export const APPS: App[] = [
  {
    id: 'cat-math', name: "Lennon's Cat Math", card: "Lennon's Cat Math Adventure app", place: 'Playground apps',
    status: 'published', builds: 4, opens: 15, people: 5, updated: 'Sep 14', tint: 'from-pink-500/35', emoji: '🐈',
    people_msgs: [
      { id: 'm1', who: 'A parent', when: 'Sep 11', text: 'Can you add age to the beginning so it’s age appropriate math questions?', replied: 'Done! Thanks 👍' },
      { id: 'm2', who: 'A parent', when: 'Sep 11', text: 'The math is still not challenging enough for the age group. Can you make it age appropriate?' },
      { id: 'm3', who: 'A player', when: 'Sep 14', text: 'Make it all purple', replied: 'I love purple too! I just updated the app' },
    ],
  },
  {
    id: 'logo', name: 'Logo Maker', card: 'Political logo generator', place: 'Playground apps',
    status: 'published', builds: 10, opens: 15, people: 1, updated: 'Sep 19', tint: 'from-amber-500/35', emoji: '✎',
    people_msgs: [{ id: 'l1', who: 'A visitor', when: 'Sep 21', text: 'How much would a logo cost? I’d pay for the one I made.' }],
  },
  { id: 'verbo', name: 'Verbo', card: 'Spanish verb drill', place: 'Playground apps', status: 'published', builds: 3, opens: 11, people: 1, updated: 'Sep 15', tint: 'from-emerald-500/35', emoji: '¿' },
  { id: 'scrapbook', name: 'Scrapbook Cards', card: 'Image cards', place: 'Playground apps', status: 'draft', builds: 6, updated: 'today', tint: 'from-sky-500/35', emoji: '▦' },
  { id: 'geo', name: 'Abstract Geo Poster', card: 'Image cards', place: 'Playground apps', status: 'draft', builds: 2, updated: 'today', tint: 'from-violet-500/35', emoji: '◆' },
  { id: 'color', name: 'Color Math', card: 'Color math', place: 'Playground apps', status: 'draft', builds: 7, updated: 'Sep 19', tint: 'from-lime-500/35', emoji: '◐' },
  { id: 'launch', name: 'Launch Simulator', card: 'Product launch simulator', place: 'Playground apps', status: 'draft', builds: 13, updated: 'Sep 16', tint: 'from-orange-500/35', emoji: '🚀' },
  { id: 'stickers', name: 'Cat Sticker Studio', card: 'Sticker generator', place: 'Playground apps', status: 'draft', builds: 8, updated: 'Sep 18', tint: 'from-fuchsia-500/35', emoji: '✿' },
];

/** First builds nobody went back to — 23 of them in September. */
export const TRIED_ONCE = [
  'Math Star ×3', 'Reading Log ×4', 'Times Tables Game ×2', 'Math Quest', 'Math Explorer', 'Mascot Animator',
  'SnailBlast Political LP', 'The Answer is 18', 'Six Pegs Teaser', 'AeroCup Challenge', 'VolleyCat Phonics',
  'Phonics Fun', 'Roll & Spell', 'Silent Letter Sorter', 'USPS Tray Prep Explainer', 'Avian Aesthetics',
];

export interface Dispatch {
  id: string;
  title: string;
  from: string;
  state: 'waiting' | 'done';
  when: string;
}

/** The Work channel, seen as what it really is: a queue Claude Code works through. */
export const DISPATCHES: Dispatch[] = [
  { id: 'd1', title: 'Voice: wait longer when I pause mid-sentence', from: 'said while driving', state: 'waiting', when: 'Sep 16' },
  { id: 'd2', title: 'Let Kan see who is using an app', from: 'said Sep 11', state: 'waiting', when: 'Sep 11' },
  { id: 'd3', title: 'Voice: file cards where I said, not Things to do', from: 'said Sep 11', state: 'waiting', when: 'Sep 11' },
  { id: 'd4', title: 'Let Kan see an app, not just how it is selling', from: 'said Sep 22', state: 'done', when: 'today' },
  { id: 'd5', title: 'Let an app hand somebody the file it made', from: 'typed Sep 21', state: 'done', when: 'yesterday' },
];

export interface Share {
  id: string;
  title: string;
  site: string;
  when: string;
  topic: string;
}

export const SHARES: Share[] = [
  { id: 's1', title: 'Including link — zodchiii on Substack', site: 'substack.com', when: 'today', topic: 'agents' },
  { id: 's2', title: 'Adam Wathan: “What are some interesting problems you’ve been…”', site: 'x.com', when: 'Sep 19', topic: 'ideas' },
  { id: 's3', title: 'Glyph v0.1.0 — the typography engine', site: 'x.com', when: 'Sep 19', topic: 'design tools' },
  { id: 's4', title: 'Introducing System One Models', site: 'typesafe.ai', when: 'Sep 16', topic: 'agents' },
  { id: 's5', title: 'Introducing the Agents API', site: 'openai.com', when: 'Sep 11', topic: 'agents' },
  { id: 's6', title: 'Who’s next — Bending Spoons acquisitions', site: 'nextspoons.com', when: 'Sep 11', topic: 'business' },
];

// ── Conversations ────────────────────────────────────────────────────────────

export interface Landed {
  kind: 'card' | 'app' | 'dispatch' | 'question' | 'email' | 'kept';
  text: string;
  where: string;
}

export interface Conversation {
  id: string;
  when: string;
  context: string;
  minutes: number;
  gist: string;
  landed: Landed[];
}

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'c1', when: 'Yesterday, 5:40pm', context: 'Driving home', minutes: 9,
    gist: 'Logo Maker is working — someone kept asking what a logo would cost. Wanted more people around who get excited about this stuff.',
    landed: [{ kind: 'app', text: 'Try charging per logo', where: 'Logo Maker' }],
  },
  {
    id: 'c2', when: 'Sep 17', context: 'At the desk', minutes: 14,
    gist: 'Boards are bad at revisiting things. Talking is easier. Conversations could just be the input — no cards needed.',
    landed: [{ kind: 'kept', text: 'Kept as a conversation — Claude Code can read it', where: 'Library' }],
  },
  {
    id: 'c3', when: 'Sep 11', context: 'Morning', minutes: 12,
    gist: 'Print orders for the day — the seventh time you’ve asked — then who ordered and their master account.',
    landed: [],
  },
  {
    id: 'c4', when: 'Sep 8', context: 'Homework', minutes: 11,
    gist: 'Quizzed on Scarlett’s word study — blends and digraphs.',
    landed: [],
  },
  {
    id: 'c5', when: 'Sep 3', context: 'Evening', minutes: 6,
    gist: 'A cat-themed maths app for Lennon — flash-card stories, subtraction, a cat joke every so often.',
    landed: [{ kind: 'app', text: 'Lennon’s Cat Math', where: 'Playground apps' }],
  },
  {
    id: 'c6', when: 'Aug 28', context: 'Out', minutes: 8,
    gist: 'The fridge is freezing food. Drafted a note for the service department, then worked through the vents.',
    landed: [{ kind: 'email', text: 'Email to yourself: fridge service', where: 'Gmail' }],
  },
];

export interface Place {
  name: string;
  lastLanding: string;
  count: number;
  quiet?: boolean;
}

/** Channels, sorted by where things last landed. The list you never have to process. */
export const PLACES: Place[] = [
  { name: 'Kan Bookmarks', lastLanding: 'today', count: 139 },
  { name: 'Playground apps', lastLanding: 'today', count: 20 },
  { name: 'Work', lastLanding: 'Sep 16', count: 51 },
  { name: 'Editor Feature Ideas', lastLanding: 'Sep 18', count: 4 },
  { name: 'UI Inspiration', lastLanding: 'Sep 18', count: 7 },
  { name: 'Things to do', lastLanding: 'Sep 14', count: 9 },
  { name: 'Espresso Bean Log', lastLanding: 'Sep 12', count: 1 },
  { name: "Scarlett's Learning Apps", lastLanding: 'Sep 8', count: 2 },
  { name: 'Backyard Birds', lastLanding: 'Sep 3', count: 51 },
  { name: 'Flyer Design UX Labs', lastLanding: 'Aug 31', count: 8, quiet: true },
  { name: 'Direct Mail Q&A', lastLanding: 'Aug 26', count: 7, quiet: true },
  { name: 'Snow Removal Tech Tools', lastLanding: 'Aug 25', count: 5, quiet: true },
  { name: 'MCS White Label Pipeline', lastLanding: 'Aug 18', count: 10, quiet: true },
  { name: 'MCS Affiliate Strategy', lastLanding: 'Aug 18', count: 12, quiet: true },
  { name: 'Prompt-to-Design Architecture', lastLanding: 'Aug 18', count: 15, quiet: true },
  { name: 'Shroom Idea Lab', lastLanding: 'Aug 3', count: 4, quiet: true },
  { name: 'Health & Wellness Hub', lastLanding: 'Aug 4', count: 1, quiet: true },
];

export interface Standing {
  id: string;
  sentence: string;
  answer?: string;
  when: string;
}

/** Shrooms, as the things Kan does without being asked. */
export const STANDING: Standing[] = [
  { id: 'st2', sentence: 'When I share something, give me the short version.', when: 'On share' },
  { id: 'st3', sentence: 'When someone writes in one of my apps, put it at the top.', when: 'On message' },
];

// ── The scripted conversation ───────────────────────────────────────────────

export interface Catch {
  id: string;
  kind: Landed['kind'];
  text: string;
  where: string;
  /** Other places Kan would offer if you tap to move it. */
  alternatives: string[];
  /** Index into SCRIPT.said after which this catch appears. */
  after: number;
}

export const SCRIPT = {
  said: [
    'Morning. I just want to talk through my day.',
    'For MyCreativeShop I’ve got to test the new Simple Editor, and log any bugs on desktop or mobile.',
    'Oh — voice cut in on me again yesterday while I was thinking. That needs fixing.',
    'And the Logo Maker person keeps asking what a logo costs. Maybe I just charge per logo.',
    'Also, every morning, just tell me how print orders did. I keep asking.',
  ],
  reply:
    'Sounds like a testing day. I caught four things — nothing’s been made yet. The day plan stays here in our conversation; tell me if you want any of it somewhere else.',
};

export const CATCHES: Catch[] = [
  { id: 'k1', kind: 'kept', text: 'Today: test Simple Editor, log bugs on desktop and mobile', where: 'Stays in this conversation', alternatives: ['Things to do', 'Work · Do these'], after: 1 },
  { id: 'k2', kind: 'dispatch', text: 'Voice cuts in when I pause to think — already queued Sep 16, adding this as a second report', where: 'Work · Do these', alternatives: ['Stays in this conversation', 'Things to do'], after: 2 },
  { id: 'k3', kind: 'app', text: 'Try charging per logo', where: 'Logo Maker', alternatives: ['Work · Do these', 'Stays in this conversation'], after: 3 },
  { id: 'k4', kind: 'question', text: 'Print orders, every morning', where: 'Numbers', alternatives: ['Stays in this conversation'], after: 4 },
];
