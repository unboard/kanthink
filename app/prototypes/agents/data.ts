/**
 * Data for the agent desk prototype.
 *
 * Items marked `real` come from the account as it stood on Oct 1 2026: app
 * views, prices, messages, the Work queue, the asks in voice. Items marked
 * `example` are what an agent would plausibly find or cause, and say so on
 * screen. Third parties are described, never named.
 */

export type Lane = 'listen' | 'learn' | 'do' | 'promote';
export type Trust = 'ask' | 'new' | 'auto';
export type Evidence = 'real' | 'example';

export const LANES: { id: Lane; name: string; verb: string; dot: string; text: string; ring: string }[] = [
  { id: 'listen', name: 'Listeners', verb: 'hear', dot: 'bg-sky-400', text: 'text-sky-300', ring: 'ring-sky-500/30' },
  { id: 'learn', name: 'Learners', verb: 'learn', dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-500/30' },
  { id: 'do', name: 'Doers', verb: 'do', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-500/30' },
  { id: 'promote', name: 'Promoters', verb: 'reach', dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/30' },
];

export const TRUST_LABEL: Record<Trust, string> = {
  ask: 'Asks every time',
  new: 'Asks for new kinds',
  auto: 'Acts, then tells you',
};

export interface Agent {
  id: string;
  lane: Lane;
  name: string;
  /** What it's doing when nothing is happening. */
  idle: string;
  watches: string;
  makes: string;
  alone: string;
  needsYes: string;
  builtFrom: string;
  /** Dollars a week of model spend before it stops itself. */
  budget: number;
  trust: Trust;
}

export const AGENTS: Agent[] = [
  // ── Listeners: produce signals, never act ──
  {
    id: 'pay', lane: 'listen', name: 'Pay signals',
    idle: 'Listening in 8 public apps',
    watches: 'Messages in your apps, paywall views, checkouts started and abandoned',
    makes: 'A buyer signal, scored by Jev: is this person ready to pay?',
    alone: 'Everything. It only listens.',
    needsYes: 'Nothing',
    builtFrom: 'app_messages, view_count, Stripe checkout events, Jev Noul',
    budget: 1, trust: 'auto',
  },
  {
    id: 'print', lane: 'listen', name: 'Print orders',
    idle: 'Next report at 7:30',
    watches: 'MyCreativeShop print orders in Mixpanel, against the norm for that weekday',
    makes: 'The morning number, and a nudge when a day drifts more than 25%',
    alone: 'Everything. It only reads.',
    needsYes: 'Nothing',
    builtFrom: 'The Mixpanel data source channels already have, plus a scheduled shroom',
    budget: 1, trust: 'auto',
  },
  {
    id: 'reading', lane: 'listen', name: 'What you read',
    idle: 'Reading along in Kanwatch',
    watches: 'Public reading Kanwatch already allows, and what you share in',
    makes: 'An opportunity: is there money in this, and which of your things is closest?',
    alone: 'Score and summarise',
    needsYes: 'Anything that lands on a board',
    builtFrom: 'kanwatch_reads, lib/kanwatch/build.ts, Kan Bookmarks — privacy.js unchanged',
    budget: 2, trust: 'auto',
  },
  // ── Learners: produce beliefs with evidence, never act ──
  {
    id: 'sells', lane: 'learn', name: 'What sells',
    idle: 'Watching 98 app views, 0 sales',
    watches: 'Views → paywall → checkout → paid, per app and per price',
    makes: 'Beliefs with a count behind them, which the doers read before drafting',
    alone: 'Everything. It only writes notes.',
    needsYes: 'Nothing',
    builtFrom: 'app_purchases, view_count, a new paywall-seen event',
    budget: 1, trust: 'auto',
  },
  {
    id: 'taste', lane: 'learn', name: 'Your taste',
    idle: 'Knows 4 rules',
    watches: 'Every decline and every edit you make to a draft',
    makes: 'Rules every other agent is held to',
    alone: 'Add a rule from a decline that had a reason',
    needsYes: 'Removing a rule',
    builtFrom: 'Shroom rejection learning (reasons only), tasteGate.ts',
    budget: 1, trust: 'auto',
  },
  {
    id: 'mcs', lane: 'learn', name: 'MCS customers',
    idle: 'Learning reorder rhythms',
    watches: 'Who orders what from MyCreativeShop, and how long until they order again',
    makes: 'Who is due, and what they ordered last',
    alone: 'Everything. It only reads.',
    needsYes: 'Nothing',
    builtFrom: 'Mixpanel, read-only',
    budget: 2, trust: 'auto',
  },
  // ── Doers: act freely inside Kanthink, need a yes to touch the outside ──
  {
    id: 'closer', lane: 'do', name: 'Closer',
    idle: 'Two people waiting',
    watches: 'Buyer signals',
    makes: 'A reply in your voice with the payment link',
    alone: 'Draft',
    needsYes: 'Sending anything to a person',
    builtFrom: 'App message replies, appPricing, payToken',
    budget: 2, trust: 'ask',
  },
  {
    id: 'claude', lane: 'do', name: 'Claude Code',
    idle: '3 cards in Do these',
    watches: 'Work → Do these',
    makes: 'Shipped code, notes on the card',
    alone: 'Build, test, commit, push',
    needsYes: 'Deploying (the Deploy card)',
    builtFrom: 'The /kan loop you already run',
    budget: 0, trust: 'new',
  },
  {
    id: 'tuner', lane: 'do', name: 'App tuner',
    idle: 'Looking at prices',
    watches: 'What sells',
    makes: 'Pricing passes and paywall changes, built into the existing app as a draft',
    alone: 'Build a draft version',
    needsYes: 'Publishing or changing a live price',
    builtFrom: 'The build shroom, appRelease, appPricing',
    budget: 4, trust: 'ask',
  },
  // ── Promoters: always outward, so they start at ask ──
  {
    id: 'clips', lane: 'promote', name: 'Clips',
    idle: '4 motion videos to work with',
    watches: 'Your MCS motion videos and new app releases',
    makes: 'Vertical cuts and captions for Reels, Shorts and X',
    alone: 'Cut and caption drafts',
    needsYes: 'Posting',
    builtFrom: 'scripts/motion, Cloudinary, the MCS marketing rules',
    budget: 3, trust: 'ask',
  },
  {
    id: 'follow', lane: 'promote', name: 'Follow-up',
    idle: '13 people across your apps',
    watches: 'People who used an app, and what they asked it for',
    makes: 'A note when the thing they asked for exists',
    alone: 'Draft',
    needsYes: 'Sending',
    builtFrom: 'app_users, app_messages, Customer.IO',
    budget: 1, trust: 'ask',
  },
  {
    id: 'shelf', lane: 'promote', name: 'Directory',
    idle: '8 apps listed',
    watches: 'Published apps without a picture, tagline or price',
    makes: 'Thumbnails, taglines, the public page',
    alone: 'Draft the listing',
    needsYes: 'Changing what the public sees',
    builtFrom: 'AppDirectory, thumbnails, /play pages',
    budget: 2, trust: 'new',
  },
];

export interface Proposal {
  id: string;
  /** The doer or promoter that would act. Listeners and learners never own one. */
  agent: string;
  /** The listener or learner that noticed it, when that isn't the agent itself. */
  from?: string;
  /** Minutes after midnight when it reaches the desk. */
  at: number;
  outward: boolean;
  title: string;
  why: string;
  evidence: Evidence;
  draftLabel: string;
  draft: string;
  /** Expected dollars, honestly small. */
  value: number;
  confidence: number;
  approveLabel: string;
}

export const PROPOSALS: Proposal[] = [
  {
    id: 'p-cat', agent: 'closer', at: 490, outward: true, evidence: 'real',
    title: 'Answer the person who asked to pay for Cat Math',
    why: 'On Sep 11 someone wrote “It’s free and I want to pay.” The reply was “we’ll work on that.” Cat Math is now $5 and nobody went back to them.',
    draftLabel: 'Reply in Lennon’s Cat Math',
    draft: 'You asked a few weeks ago, so you get first go: the full version with age-based levels is $5, one time. Here’s the link — and thank you for asking.',
    value: 5, confidence: 0.62, approveLabel: 'Send reply',
  },
  {
    id: 'p-logo', agent: 'closer', at: 492, outward: true, evidence: 'real',
    title: 'Answer the Logo Maker visitor who asked the price',
    why: 'They asked what a logo would cost and said they’d pay for the one they made. Logo Maker is now $10 one-time. 16 views, no sale, no reply.',
    draftLabel: 'Reply in Logo Maker',
    draft: 'Your logo is still saved. It’s $10 to download it in full resolution, yours to keep — here’s the link.',
    value: 10, confidence: 0.4, approveLabel: 'Send reply',
  },
  {
    id: 'p-selfie', agent: 'tuner', from: 'sells', at: 545, outward: true, evidence: 'real',
    title: 'Put a price on Super Selfie',
    why: 'Your most-viewed public app — 25 views, more than Logo Maker and Cat Math — and the only one of the three that’s free. Apps can hand people the file they made as of yesterday.',
    draftLabel: 'Change, built as a draft',
    draft: 'Keep the preview free. $3 to download the full-resolution selfie. Price shown after the first result, not before.',
    value: 6, confidence: 0.3, approveLabel: 'Publish the price',
  },
  {
    id: 'p-clip', agent: 'clips', at: 675, outward: true, evidence: 'example',
    title: 'Post a 20-second cut of “In their hands”',
    why: 'Four MCS motion videos are published; the best one has 13 views, all from links you sent. None has been posted anywhere people scroll.',
    draftLabel: 'Caption for Reels and Shorts',
    draft: 'From idea to in their hands. Design it on brand, personalize it for every customer, and we print and mail it for you. 📬',
    value: 0, confidence: 0.5, approveLabel: 'Post it',
  },
  {
    id: 'p-sheet', agent: 'claude', from: 'reading', at: 740, outward: false, evidence: 'example',
    title: 'Give Cat Math a printable weekly sheet',
    why: 'You read a thread where parents kept asking for practice they can put on the fridge. Cat Math is most of the way there — and printing is what MyCreativeShop does.',
    draftLabel: 'Card for Work → Do these',
    draft: 'Cat Math: “Print this week’s sheet” — 10 problems at the child’s level, cat on top, one page. Later: mailed weekly through MCS.',
    value: 0, confidence: 0.45, approveLabel: 'Queue for Claude Code',
  },
  {
    id: 'p-reorder', agent: 'follow', from: 'mcs', at: 790, outward: true, evidence: 'example',
    title: 'Nudge MCS customers who are due to reorder',
    why: 'Business-card customers reorder after about 70 days. 18 are past day 70 this week and haven’t been back.',
    draftLabel: 'Draft for the MCS email tool',
    draft: 'Running low? Your cards are saved exactly as you left them — reorder in two clicks and we’ll have them in your hands this week.',
    value: 180, confidence: 0.35, approveLabel: 'Hand to MCS email',
  },
  {
    id: 'p-follow', agent: 'follow', at: 945, outward: true, evidence: 'real',
    title: 'Tell Cat Math’s 5 players what changed',
    why: 'Five people use Cat Math. Two asked for harder, age-right maths and got it on Sep 11. Nobody has heard from the app since.',
    draftLabel: 'Note to 5 people',
    draft: 'Cat Math now asks for age first and picks the right level — and it’s purple, by popular request. Come play.',
    value: 5, confidence: 0.3, approveLabel: 'Send to 5',
  },
];

export interface Event {
  at: number;
  agent: string;
  text: string;
  evidence: Evidence;
  /** Model spend in dollars. */
  cost: number;
}

/** What happens on its own through the day, whatever you decide. */
export const DAY: Event[] = [
  { at: 450, agent: 'print', evidence: 'example', cost: 0.01, text: 'Print orders are in: 12% above a normal Wednesday, two first-time postcard customers. You won’t need to ask — you asked seven times in September.' },
  { at: 488, agent: 'pay', evidence: 'real', cost: 0.01, text: 'Found a buyer who’s been waiting since Sep 11 in Cat Math: “It’s free and I want to pay.”' },
  { at: 491, agent: 'pay', evidence: 'real', cost: 0.01, text: 'Found another in Logo Maker: asked the price, said they’d pay for the logo they made.' },
  { at: 540, agent: 'sells', evidence: 'real', cost: 0.02, text: 'Across 8 public apps: 98 views, 2 prices set, 0 sales ever. Nobody has seen a paywall and been asked twice.' },
  { at: 580, agent: 'claude', evidence: 'real', cost: 0, text: 'Finished “Let an app hand somebody the file it made.” Super Selfie can now deliver a full-resolution download.' },
  { at: 630, agent: 'taste', evidence: 'real', cost: 0.01, text: 'Rule: MCS copy never says “AI”, never leads with a pain point, and doesn’t coin product names.' },
  { at: 670, agent: 'clips', evidence: 'example', cost: 0.12, text: 'Cut “In their hands” into a 20-second vertical with a caption, held for you.' },
  { at: 735, agent: 'reading', evidence: 'example', cost: 0.04, text: 'You spent 14 minutes in a thread on kids’ maths practice. Closest thing you own: Cat Math.' },
  { at: 785, agent: 'mcs', evidence: 'example', cost: 0.03, text: '18 business-card customers are past their usual reorder day.' },
  { at: 860, agent: 'shelf', evidence: 'real', cost: 0.08, text: 'Three published apps have no picture in the directory. Drew thumbnails; they wait for you on the Apps tab.' },
  { at: 940, agent: 'follow', evidence: 'real', cost: 0.01, text: 'Cat Math has 5 players and hasn’t written to any of them.' },
];

/** What happens after you approve something — all of it illustrative. */
export const OUTCOMES: Record<string, { after: number; agent: string; text: string; earn?: number }[]> = {
  'p-cat': [
    { after: 35, agent: 'pay', text: 'The Cat Math buyer opened the payment link.' },
    { after: 70, agent: 'pay', text: 'Paid $5 for Cat Math. Your first app sale.', earn: 5 },
    { after: 90, agent: 'sells', text: 'Learned: a same-day reply with a link sold; three weeks of “we’ll work on that” didn’t.' },
  ],
  'p-logo': [
    { after: 50, agent: 'pay', text: 'The Logo Maker visitor opened the link and left. Closer will follow up once on Monday, then stop.' },
  ],
  'p-selfie': [
    { after: 30, agent: 'tuner', text: 'Super Selfie is live at $3 after the first result.' },
    { after: 140, agent: 'pay', text: 'One Super Selfie download, $3.', earn: 3 },
  ],
  'p-clip': [
    { after: 120, agent: 'clips', text: 'The cut has 400 plays and 6 profile visits. Next week’s cut will try the print-and-mail moment first.' },
  ],
  'p-sheet': [
    { after: 15, agent: 'claude', text: 'Picked up “Cat Math: print this week’s sheet” from Do these.' },
  ],
  'p-reorder': [
    { after: 20, agent: 'follow', text: 'Handed to the MCS email tool; it goes to 18 customers at 9am tomorrow.' },
  ],
  'p-follow': [
    { after: 60, agent: 'follow', text: '2 of 5 opened. One replied: “she loves the purple.”' },
  ],
};

export const STARTING_RULES = [
  'MCS: never say “AI”.',
  'MCS: lead with the outcome, never a pain point.',
  'Don’t coin product names unless asked.',
  'Nothing lands on a board unless you press Save.',
];

export const DECLINE_REASONS = ['Too pushy', 'Wrong tone', 'Not worth it', 'Not this person', 'Not yet'];
