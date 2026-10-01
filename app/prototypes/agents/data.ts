/**
 * Data for the Takes prototype — a studio of agents that finds, tests, builds,
 * ships and sells small apps, and asks you for direction rather than labour.
 *
 * Every take here is an example of what scouts would plausibly bring back from
 * public demand. Sources are described, never named. Each take carries a hidden
 * `truth` the simulation plays out, so your calls can be right or wrong — that
 * is what lets the studio score your gut the way Supertake scores a thesis.
 */

export type Audience = 'families' | 'teachers' | 'solo' | 'creators' | 'hobby';
export type Call = 'pass' | 'leanNo' | 'leanYes' | 'strong';
export type Stage = 'asking' | 'watch' | 'passed' | 'skipped' | 'practice' | 'building' | 'checking' | 'live' | 'killed';
export type OutwardKind = 'testpost' | 'launchmail' | 'launchpost';
export type CrewStage = 'identify' | 'vet' | 'build' | 'check' | 'sell' | 'account';

export const AUDIENCES: { id: Audience; label: string; note: string }[] = [
  { id: 'families', label: 'Parents & families', note: 'Kids, home, sports, events' },
  { id: 'teachers', label: 'Teachers', note: 'Classroom printables and tools' },
  { id: 'solo', label: 'One-person businesses', note: 'Landlords, sitters, food trucks, resellers' },
  { id: 'creators', label: 'Creators & freelancers', note: 'Video, design, invoicing' },
  { id: 'hobby', label: 'Hobbyists', note: 'Crafts, collecting, making' },
];

export const CALLS: { id: Call; label: string; short: string }[] = [
  { id: 'pass', label: 'Pass', short: 'Pass' },
  { id: 'leanNo', label: 'Lean no', short: 'Lean no' },
  { id: 'leanYes', label: 'Lean yes', short: 'Lean yes' },
  { id: 'strong', label: 'Strong yes', short: 'Strong' },
];

export const isYes = (c?: Call) => c === 'leanYes' || c === 'strong';

/** A no needs a reason. Some reasons become rules the scouts follow. */
export const PASS_REASONS: { id: string; label: string; rule?: string }[] = [
  { id: 'crowded', label: 'Too crowded', rule: 'Scouts skip takes where free or big-name tools already own the job.' },
  { id: 'customer', label: 'Not my customer', rule: 'Scouts stop bringing takes for this kind of customer.' },
  { id: 'hard', label: 'Too hard to build', rule: 'Scouts skip takes that need accounts, sync or a server.' },
  { id: 'pay', label: 'Nobody pays for this' },
  { id: 'bored', label: 'Doesn’t interest me' },
];

export const KILL_REASONS = ['Nobody pays for this', 'Too small', 'Not good enough', 'Not my customer', 'Not now'];
export const DECLINE_REASONS = ['Too pushy', 'Wrong place', 'Wrong tone', 'Not yet'];

export interface Mandate {
  audiences: Audience[];
  budget: 25 | 50 | 100;
  minutes: 2 | 5 | 10;
  traffic: 'ads' | 'posts' | 'both';
  bar: 2 | 3 | 5;
  offLimits: string[];
  shadow: boolean;
  shelf: boolean;
}

export const DEFAULT_MANDATE: Mandate = {
  audiences: ['families', 'teachers', 'solo'],
  budget: 50,
  minutes: 2,
  traffic: 'both',
  bar: 3,
  offLimits: ['advice', 'clones', 'kids-data'],
  shadow: true,
  shelf: true,
};

export const OFF_LIMITS: { id: string; label: string }[] = [
  { id: 'advice', label: 'Health, legal or money advice' },
  { id: 'clones', label: 'Copies of a named product' },
  { id: 'kids-data', label: 'Kids’ apps that collect data' },
  { id: 'server', label: 'Anything that needs a server or accounts' },
];

export interface Take {
  id: string;
  /** The thesis, as a claim someone could be wrong about. */
  title: string;
  audience: Audience;
  thesis: string;
  app: string;
  does: string;
  price: number;
  priceLabel: string;
  evidence: { source: string; quote: string }[];
  scout: 'demand' | 'reviews' | 'trends';
  /** A seasonal clock, when the trend scout found one. */
  clock?: string;
  /** What you already own that's closest — a tiebreaker, never the reason. */
  shelf?: string;
  competition: 'open' | 'some' | 'crowded';
  tags: string[];
  /** Jev's read before any test: agents can be wrong too. */
  jev: number;
  testPost: string;
  launchPost: string;
  where: string;
  preview: { header: string; rows: string[]; cta: string };
  qa: { fixed: string[]; open: string };
  promise: number;
  /** Hidden. What the world would actually do. */
  truth: { pull: number; intent: number; buildDays: number };
}

export const TAKES: Take[] = [
  {
    id: 'coach', audience: 'families', scout: 'demand', competition: 'some', tags: [], jev: 0.72,
    title: 'Volunteer coaches will pay to stop doing playing time by hand',
    thesis: 'Rec-league coaches are parents with a clipboard. Equal playing time is the rule, the maths is tedious, and getting it wrong means an angry parent on Saturday. Team apps handle schedules and chat; none of them do the rotation.',
    app: 'Fair Rotations', does: 'Enter the roster and positions, get a game-day rotation where every kid plays equal time, and share it to parents.',
    price: 9, priceLabel: '$9 a season',
    evidence: [
      { source: 'A rec-league coaching forum · 60 upvotes', quote: '“I spend an hour every Friday night doing rotations on paper so no parent yells at me.”' },
      { source: '1-star reviews of a big team app', quote: '“Does everything except the one thing I need — fair minutes.”' },
      { source: 'Search interest', quote: '“Equal playing time lineup” climbs every March and August.' },
    ],
    clock: 'Spring sign-ups start in 3 weeks',
    testPost: 'I kept seeing coaches here doing rotations by hand, so I’m making a tool that does equal playing time for you. Early version reserves at $9 a season — no charge until it exists.',
    launchPost: 'Fair Rotations is live: enter your roster, get a game-day rotation where every kid plays equal time, share it with parents. $9 a season.',
    where: 'the coaching forum thread it was found in',
    preview: { header: 'Saturday · U10 Hawks', rows: ['Inning 1  Maya P · Leo C · Ava 1B', 'Inning 2  Leo P · Ava C · Sam 1B', 'Everyone: 4 of 6 innings ✓'], cta: 'Share with parents' },
    qa: { fixed: ['Rotation broke with 13 players and 9 positions — fixed', 'Absent kid didn’t rebalance the rest — fixed'], open: 'Print view cuts the last inning on narrow phones.' },
    promise: 0.88,
    truth: { pull: 1.2, intent: 0.065, buildDays: 3 },
  },
  {
    id: 'seating', audience: 'families', scout: 'trends', competition: 'crowded', tags: ['print', 'crowded'], jev: 0.74,
    title: 'Couples will pay once for a seating chart that handles family drama',
    thesis: 'Seating is the most-complained-about wedding chore. A tool that knows who must not sit together and solves the rest, then prints place cards, sounds like an easy one-time sale.',
    app: 'Seat Plan', does: 'Drag guests to tables, mark pairs to keep apart, let it solve the rest, print place cards.',
    price: 15, priceLabel: '$15 once',
    evidence: [
      { source: 'A wedding-planning community · 200 comments', quote: '“Seating my divorced parents’ families is giving me hives.”' },
      { source: 'Search interest', quote: '“Wedding seating chart” peaks January to April.' },
    ],
    clock: 'Peak season starts in January',
    shelf: 'MyCreativeShop prints place cards',
    testPost: 'Making a seating-chart tool that handles the “these two can’t sit together” problem and prints place cards. Reserve at $15 once — no charge until it’s ready.',
    launchPost: 'Seat Plan: mark who can’t sit together, it solves the rest, then prints your place cards. $15 once.',
    where: 'the wedding-planning thread',
    preview: { header: 'Reception · 112 guests', rows: ['Table 4  Aunt Jo · Uncle Ray · …', 'Kept apart: 3 pairs ✓', 'Place cards: ready to print'], cta: 'Print place cards' },
    qa: { fixed: ['Solver hung at 140+ guests — fixed'], open: 'Drag and drop is fiddly on small phones.' },
    promise: 0.8,
    truth: { pull: 1.4, intent: 0.014, buildDays: 2 },
  },
  {
    id: 'inspect', audience: 'solo', scout: 'demand', competition: 'some', tags: ['solo'], jev: 0.6,
    title: 'Small landlords lose deposit fights because they have no proof',
    thesis: 'Landlords with one to five units don’t buy property software. When a tenant moves out, it’s their memory against a tenant’s. A dated, photo-by-room report both sides sign at move-in ends the argument.',
    app: 'Move-in Report', does: 'Walk room by room, snap photos, get a timestamped PDF both sides sign.',
    price: 12, priceLabel: '$12 a property',
    evidence: [
      { source: 'A small-landlord forum · 45 replies', quote: '“Lost $900 in small claims because my move-in photos were on an old phone.”' },
      { source: 'A tenants’ community', quote: '“Always ask for a signed move-in checklist. Most small landlords don’t have one.”' },
    ],
    testPost: 'A few people here lost deposit disputes for lack of move-in photos, so I’m building a room-by-room report both sides sign. Reserve at $12 a property — no charge until it’s ready.',
    launchPost: 'Move-in Report: walk the unit room by room, snap photos, both sides sign a dated PDF. $12 a property.',
    where: 'the small-landlord forum thread',
    preview: { header: '14 Elm St · Unit B', rows: ['Kitchen  6 photos · scuff on cabinet', 'Bath  4 photos · no issues', 'Signed by both · Oct 12, 2:14pm'], cta: 'Download signed PDF' },
    qa: { fixed: ['Photos over 8 MB crashed the upload — now compressed'], open: 'Signature box is small on tablets.' },
    promise: 0.84,
    truth: { pull: 0.8, intent: 0.05, buildDays: 3 },
  },
  {
    id: 'worksheet', audience: 'teachers', scout: 'reviews', competition: 'crowded', tags: ['print', 'crowded'], jev: 0.55,
    title: 'Teachers buy printables by the pack, not apps',
    thesis: 'Teachers already pay for worksheets on big marketplaces — but every class has three levels in it. A generator that makes the same sheet at three difficulties, with answer keys, sells by the pack.',
    app: 'Sheet Maker', does: 'Pick grade and topic, get ten worksheets at three levels with answer keys, print-ready.',
    price: 6, priceLabel: '$6 a pack',
    evidence: [
      { source: 'Reviews of paid worksheet packs', quote: '“Great sheets, but I have to make my own easier version for half the class.”' },
      { source: 'A teachers’ community · 80 upvotes', quote: '“Differentiating every worksheet is my whole Sunday.”' },
    ],
    shelf: 'Cat Math already levels maths by age',
    testPost: 'Teachers here keep saying differentiating worksheets eats their Sunday. I’m making a generator that gives you the same sheet at three levels with answer keys. Reserve a pack at $6.',
    launchPost: 'Sheet Maker: the same worksheet at three levels, answer keys included, print-ready. $6 a pack.',
    where: 'the teachers’ community thread',
    preview: { header: 'Grade 3 · Fractions', rows: ['Level A  10 problems · pictures', 'Level B  10 problems', 'Level C  10 problems · word problems'], cta: 'Print all three' },
    qa: { fixed: ['Answer key didn’t match Level C — fixed'], open: 'Page breaks split a problem in two on A4.' },
    promise: 0.82,
    truth: { pull: 1.3, intent: 0.034, buildDays: 2 },
  },
  {
    id: 'petsit', audience: 'solo', scout: 'demand', competition: 'some', tags: ['solo'], jev: 0.5,
    title: 'Pet sitters want to look professional to nervous owners',
    thesis: 'Independent pet sitters compete with apps that send owners a tidy report after every visit. A sitter on their own sends a blurry text. Give them the report, and they keep the client.',
    app: 'Visit Card', does: 'After each visit, tap what happened, add two photos, and send the owner a tidy report link.',
    price: 5, priceLabel: '$5 a month',
    evidence: [
      { source: 'An independent pet-sitter group', quote: '“Clients keep asking if I have ‘the app with the report card’.”' },
      { source: 'Reviews of a sitter marketplace', quote: '“The only thing I miss since going independent is the visit report.”' },
    ],
    testPost: 'Sitters here keep losing clients to apps with visit reports. I’m making one you own: tap what happened, add photos, send a tidy link. Reserve at $5 a month.',
    launchPost: 'Visit Card: a tidy report link for your clients after every visit — walks, meals, photos. $5 a month.',
    where: 'the independent sitter group',
    preview: { header: 'Biscuit · Tue 4:10pm', rows: ['Walk 30 min ✓  Dinner ✓  Water ✓', '2 photos', 'Note: Very happy, a little muddy'], cta: 'Send to owner' },
    qa: { fixed: ['Report link opened blank on one phone browser — fixed'], open: 'No way to edit a sent report.' },
    promise: 0.8,
    truth: { pull: 0.7, intent: 0.055, buildDays: 3 },
  },
  {
    id: 'invoice', audience: 'creators', scout: 'demand', competition: 'crowded', tags: ['crowded', 'server'], jev: 0.3,
    title: 'Freelancers need invoices that chase late payers for them',
    thesis: 'Freelancers hate asking for money twice. An invoice that sends its own polite reminders and adds a late fee would save the awkward email.',
    app: 'Nudge Invoice', does: 'Send an invoice that reminds the client on day 7, 14 and 30, and adds the late fee you set.',
    price: 8, priceLabel: '$8 a month',
    evidence: [
      { source: 'A freelancers’ community', quote: '“Chasing invoices is the worst part of the job.”' },
    ],
    testPost: 'Making an invoice that chases late payers for you. Reserve at $8 a month.',
    launchPost: 'Nudge Invoice: reminders on day 7, 14 and 30, late fee added for you. $8 a month.',
    where: 'the freelancers’ community',
    preview: { header: 'Invoice #104', rows: ['$1,200 · due Oct 30', 'Reminders: 7 · 14 · 30 days', 'Late fee: 2%'], cta: 'Send invoice' },
    qa: { fixed: ['Reminder dates ignored time zone — fixed'], open: 'Needs a real email sender.' },
    promise: 0.7,
    truth: { pull: 1.0, intent: 0.008, buildDays: 4 },
  },
  {
    id: 'chore', audience: 'families', scout: 'reviews', competition: 'some', tags: ['print'], jev: 0.58,
    title: 'Parents will pay for a chore chart kids actually want to fill in',
    thesis: 'Chore apps die in a week because kids don’t have phones. A printable chart with a character that levels up on the fridge works — and can be reprinted every week.',
    app: 'Chore Quest', does: 'A printable weekly chart with a character that levels up as stickers fill in. New sheet every week.',
    price: 4, priceLabel: '$4 once',
    evidence: [
      { source: 'Reviews of chore apps', quote: '“My kids don’t have phones. I need it on the fridge.”' },
      { source: 'A parenting community', quote: '“The only thing that worked was a paper chart with a dragon that grew.”' },
    ],
    shelf: 'MyCreativeShop could print and mail it monthly',
    testPost: 'Parents here keep saying paper charts beat apps. I’m making a printable chore chart where a character levels up. Reserve at $4.',
    launchPost: 'Chore Quest: a printable chore chart with a character that levels up on the fridge. $4 once.',
    where: 'the parenting thread',
    preview: { header: 'Week of Oct 12 · Sam', rows: ['Bed ✓✓✓✓  Dishes ✓✓  Feed cat ✓✓✓', 'Dragon: level 3 → 4 at 20 stickers', 'Next sheet prints Sunday'], cta: 'Print this week' },
    qa: { fixed: ['Character art cropped on Letter paper — fixed'], open: 'Only one character so far.' },
    promise: 0.83,
    truth: { pull: 1.1, intent: 0.038, buildDays: 2 },
  },
  {
    id: 'quilt', audience: 'hobby', scout: 'demand', competition: 'open', tags: [], jev: 0.45,
    title: 'Quilters will pay to never do yardage maths again',
    thesis: 'Every quilt starts with fiddly maths: how much of each fabric, how to cut it. Quilters do it on paper and get it wrong. It’s a small, devoted crowd that buys tools.',
    app: 'Quilt Math', does: 'Pick a block and a size, get yardage per fabric and a cutting plan.',
    price: 7, priceLabel: '$7 once',
    evidence: [
      { source: 'A quilting forum · 30 replies', quote: '“Bought a whole extra yard because I did the maths wrong. Again.”' },
      { source: 'Reviews of a quilting design app', quote: '“Too complicated. I just want the yardage.”' },
    ],
    testPost: 'Making a tiny tool that does quilt yardage and cutting plans so nobody buys an extra yard again. Reserve at $7.',
    launchPost: 'Quilt Math: pick a block and size, get yardage per fabric and a cutting plan. $7 once.',
    where: 'the quilting forum',
    preview: { header: 'Log Cabin · Queen', rows: ['Light: 3¼ yd  Dark: 2¾ yd  Centre: ½ yd', 'Cut 84 strips at 2½″', 'Binding: ¾ yd'], cta: 'Print cutting plan' },
    qa: { fixed: ['Rounded yardage down instead of up — fixed'], open: 'Only six block patterns.' },
    promise: 0.86,
    truth: { pull: 0.9, intent: 0.06, buildDays: 2 },
  },
  {
    id: 'menu', audience: 'solo', scout: 'trends', competition: 'some', tags: ['print', 'solo'], jev: 0.52,
    title: 'Food trucks change the menu weekly and hate designing it',
    thesis: 'A food truck’s menu changes with what they bought that morning. They hand-write it or wrestle a design tool. Type the items, get a board-ready menu and a phone link for the line.',
    app: 'Menu Board', does: 'Type today’s items and prices, get a print-ready menu board and a phone link for the queue.',
    price: 8, priceLabel: '$8 a month',
    evidence: [
      { source: 'A food-truck owners’ group', quote: '“I redo the menu in a design app every Monday. Takes an hour.”' },
    ],
    shelf: 'MyCreativeShop prints signs and boards',
    testPost: 'Owners here redo the menu every week in a design app. I’m making one where you type the items and it lays out the board. Reserve at $8 a month.',
    launchPost: 'Menu Board: type today’s items, get a print-ready board and a link for the line. $8 a month.',
    where: 'the food-truck owners’ group',
    preview: { header: 'Taco Tuesday', rows: ['Al pastor  $4', 'Birria  $5 · consommé +$2', 'Sold out: elote'], cta: 'Print board' },
    qa: { fixed: ['Long item names overflowed — now shrink to fit'], open: 'Two layouts only.' },
    promise: 0.8,
    truth: { pull: 0.8, intent: 0.035, buildDays: 2 },
  },
  {
    id: 'estate', audience: 'solo', scout: 'demand', competition: 'open', tags: ['solo'], jev: 0.4,
    title: 'Estate-sale runners price hundreds of items every weekend',
    thesis: 'Estate-sale companies are one or two people pricing a whole house by Friday. Photo an item, get a fair price range, print tag sheets — the job they do all night.',
    app: 'Tag & Price', does: 'Photo an item, get a fair price range, print tag sheets by room.',
    price: 10, priceLabel: '$10 a month',
    evidence: [
      { source: 'An estate-sale operators’ group', quote: '“Priced 400 items until 2am. There has to be a better way.”' },
    ],
    testPost: 'Operators here price hundreds of items by hand. I’m making a tool: photo the item, get a range, print tags by room. Reserve at $10 a month.',
    launchPost: 'Tag & Price: photo an item, get a fair range, print tag sheets by room. $10 a month.',
    where: 'the estate-sale operators’ group',
    preview: { header: 'Maple Ave sale · Dining', rows: ['Oak sideboard  $180–240', 'Pyrex set (8)  $35–50', '42 items tagged'], cta: 'Print tags' },
    qa: { fixed: ['Price ranges came back in the wrong currency once — fixed'], open: 'Ranges are wide on rare items.' },
    promise: 0.78,
    truth: { pull: 0.5, intent: 0.08, buildDays: 3 },
  },
  {
    id: 'resume', audience: 'creators', scout: 'trends', competition: 'crowded', tags: ['crowded'], jev: 0.35,
    title: 'Job seekers will pay to tailor a resume to every posting',
    thesis: 'Applicants are told to tailor each resume. Paste the posting, get a tailored version.',
    app: 'Tailor', does: 'Paste a job posting and your resume, get a tailored version.',
    price: 12, priceLabel: '$12 once',
    evidence: [
      { source: 'A careers community', quote: '“Tailoring every resume is exhausting.”' },
    ],
    testPost: 'Making a resume tailor. Reserve at $12.',
    launchPost: 'Tailor: paste a posting, get a resume shaped for it. $12 once.',
    where: 'the careers community',
    preview: { header: 'Tailored for: Ops Lead', rows: ['Summary rewritten', '6 bullets reordered', 'Keywords matched: 9 of 11'], cta: 'Download' },
    qa: { fixed: ['Lost bold formatting — fixed'], open: 'Looks like every other tool.' },
    promise: 0.7,
    truth: { pull: 1.5, intent: 0.01, buildDays: 2 },
  },
  {
    id: 'thumbs', audience: 'creators', scout: 'reviews', competition: 'crowded', tags: ['crowded'], jev: 0.4,
    title: 'Small video creators will pay to test two thumbnails',
    thesis: 'Thumbnails decide clicks. Small channels guess. Show two to a panel and pick the winner.',
    app: 'Thumb Test', does: 'Upload two thumbnails, a panel picks one, you see why.',
    price: 9, priceLabel: '$9 a month',
    evidence: [
      { source: 'A small-creators community', quote: '“I never know which thumbnail is better.”' },
    ],
    testPost: 'Making a quick two-thumbnail test. Reserve at $9 a month.',
    launchPost: 'Thumb Test: two thumbnails in, a winner and a reason out. $9 a month.',
    where: 'the small-creators community',
    preview: { header: 'Test #3', rows: ['A: 38%  B: 62%', '“B’s face reads at small size”', '120 votes'], cta: 'Run another' },
    qa: { fixed: ['Uploads over 5 MB failed — fixed'], open: 'Panel is slow at night.' },
    promise: 0.72,
    truth: { pull: 1.3, intent: 0.012, buildDays: 3 },
  },
];

export const takeById = (id: string) => TAKES.find((t) => t.id === id)!;

/** Day the scouts surface something. Two on day one so the first check-in has weight. */
export const SCOUT_DAYS = [1, 1, 1, 2, 3, 5, 6, 8, 10, 12, 15, 18];

export interface Direction {
  day: number;
  id: string;
  question: string;
  why: string;
  options: { id: string; label: string; note: string }[];
}

/**
 * Steering questions. These are how you set direction day to day without
 * writing a brief — one tap, and the scouts dig somewhere different.
 */
export const DIRECTIONS: Direction[] = [
  {
    day: 3, id: 'dig',
    question: 'Demand is clustering in three places. Where should scouts dig this week?',
    why: 'The scouts found more than they can test. Your answer reorders what they bring you next.',
    options: [
      { id: 'print', label: 'Things people print and hold', note: 'Worksheets, chore charts, menus — and MCS can print them' },
      { id: 'solo', label: 'Tools for one-person businesses', note: 'Sitters, landlords, food trucks, resellers' },
      { id: 'open', label: 'Wherever nobody else is', note: 'Small crowds with no good tool yet' },
    ],
  },
  {
    day: 10, id: 'monthly',
    question: 'Everything live so far is a one-time price. Should the pricer try monthly on tools people use every week?',
    why: 'One-time is easier to sell; monthly compounds. The pricer won’t change a live price without asking either way.',
    options: [
      { id: 'once', label: 'Keep it one-time', note: 'Simpler to sell, simpler to refund' },
      { id: 'monthly', label: 'Monthly where it’s used weekly', note: 'Menus, sitter reports, pricing tools' },
    ],
  },
  {
    day: 17, id: 'spare',
    question: 'When a new take starts practice, where should its chips come from?',
    why: 'You allocate on Mondays. Between Mondays, the ledger needs a rule.',
    options: [
      { id: 'weakest', label: 'The weakest live bet', note: 'Keeps testing new things' },
      { id: 'spare', label: 'Only unspent chips', note: 'Protects what’s earning' },
    ],
  },
];

export interface Crew {
  id: string;
  stage: CrewStage;
  name: string;
  job: string;
  alone: string;
  needsYes: string;
  builtFrom: string;
  /** Weekly model spend cap, dollars. */
  budget: number;
}

export const STAGES: { id: CrewStage; name: string; dot: string; text: string; ring: string; bar: string }[] = [
  { id: 'identify', name: 'Identify', dot: 'bg-sky-400', text: 'text-sky-300', ring: 'ring-sky-500/30', bar: 'bg-sky-400/70' },
  { id: 'vet', name: 'Vet', dot: 'bg-amber-400', text: 'text-amber-300', ring: 'ring-amber-500/30', bar: 'bg-amber-400/70' },
  { id: 'build', name: 'Build', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-500/30', bar: 'bg-emerald-400/70' },
  { id: 'check', name: 'Check', dot: 'bg-cyan-400', text: 'text-cyan-300', ring: 'ring-cyan-500/30', bar: 'bg-cyan-400/70' },
  { id: 'sell', name: 'Publish & sell', dot: 'bg-fuchsia-400', text: 'text-fuchsia-300', ring: 'ring-fuchsia-500/30', bar: 'bg-fuchsia-400/70' },
  { id: 'account', name: 'Account', dot: 'bg-neutral-400', text: 'text-neutral-300', ring: 'ring-neutral-500/30', bar: 'bg-neutral-400/70' },
];

export const CREW: Crew[] = [
  { id: 'demand', stage: 'identify', name: 'Demand scout', job: 'Reads public posts where people describe a chore they’d pay to lose, or say “I’d pay for”.', alone: 'Read, collect quotes', needsYes: 'Nothing', builtFrom: 'Scheduled shroom + web search; Jev for “is this a buyer?”', budget: 4 },
  { id: 'reviews', stage: 'identify', name: 'Review miner', job: 'Reads 1–3 star reviews of paid tools: what people paid for and didn’t get.', alone: 'Read, collect quotes', needsYes: 'Nothing', builtFrom: 'Scheduled shroom + web search', budget: 2 },
  { id: 'trends', stage: 'identify', name: 'Trend scout', job: 'Finds the seasonal clock on a take — when people search, when it’s too late.', alone: 'Read', needsYes: 'Nothing', builtFrom: 'Scheduled shroom + search-interest data', budget: 1 },
  { id: 'shelf', stage: 'identify', name: 'Your shelf', job: 'Checks what you already own against a take. A tiebreaker only — it never brings a take in.', alone: 'Read your apps and MCS', needsYes: 'Nothing', builtFrom: 'playground_apps, MCS catalogue. Kanwatch is not an input.', budget: 0 },
  { id: 'analyst', stage: 'vet', name: 'Analyst', job: 'Turns scout finds into a take: a claim, who pays, the bet, the price, and Jev’s read before any test.', alone: 'Write takes', needsYes: 'Nothing — you make the call', builtFrom: 'Jev Noul, instruction cards', budget: 3 },
  { id: 'testpage', stage: 'vet', name: 'Test page', job: 'Builds a one-page offer for the take with the price and a Reserve button. Nobody is charged — reserving saves their email and the launch price.', alone: 'Build and publish the test page', needsYes: 'Nothing new — runs inside your mandate', builtFrom: 'Playground generator, /play pages, appPricing in a new reserve mode', budget: 3 },
  { id: 'reach', stage: 'vet', name: 'Reach', job: 'Brings people to test pages: capped ads, and a post in the thread where the demand was found.', alone: 'Spend the take’s chips on ads', needsYes: 'Every post, until you trust it', builtFrom: 'Ad spend inside your weekly budget; drafts follow your rules', budget: 1 },
  { id: 'spec', stage: 'build', name: 'Spec writer', job: 'Writes the brief: the take, the evidence, and what people asked when they reserved.', alone: 'Write the card thread', needsYes: 'Nothing', builtFrom: 'Card threads — the build shroom reads them as the brief', budget: 1 },
  { id: 'builder', stage: 'build', name: 'Builder', job: 'Builds the app from the brief. Single-file apps through the playground; anything needing a server goes to Claude Code.', alone: 'Build, rebuild', needsYes: 'Nothing — you see it before anyone else does', builtFrom: 'The build shroom, playground generator, /kan for Claude Code', budget: 12 },
  { id: 'tester', stage: 'check', name: 'Play tester', job: 'Plays the app as the take’s customer would, on a phone and a laptop. Files what breaks, sends it back, plays again.', alone: 'Test, send back, retest', needsYes: 'Nothing', builtFrom: 'Playwright against the /play page', budget: 3 },
  { id: 'judge', stage: 'check', name: 'Judge', job: 'Reads the build against the take’s promise: would the person in the evidence get what they asked for?', alone: 'Score', needsYes: 'Nothing — you ship or kill', builtFrom: 'Jev', budget: 1 },
  { id: 'pricer', stage: 'sell', name: 'Pricer', job: 'Sets the price from what people reserved at, and wires checkout.', alone: 'Set the launch price from the test', needsYes: 'Changing a live price', builtFrom: 'appPricing, Stripe checkout, app_purchases', budget: 1 },
  { id: 'lister', stage: 'sell', name: 'Lister', job: 'Thumbnail, tagline and directory page for every launch.', alone: 'Publish the listing', needsYes: 'Nothing', builtFrom: 'AppDirectory, thumbnails, /play', budget: 1 },
  { id: 'mailer', stage: 'sell', name: 'Launch mailer', job: 'Tells everyone who reserved that it’s ready, at the price they reserved.', alone: 'Draft', needsYes: 'Sending, until you trust it', builtFrom: 'Customer.IO, the reservation list', budget: 1 },
  { id: 'poster', stage: 'sell', name: 'Poster', job: 'Posts the launch where the take’s customers are — starting with the thread that started it.', alone: 'Draft', needsYes: 'Posting, until you trust it', builtFrom: 'Drafts held for you; the trust ladder', budget: 1 },
  { id: 'ledger', stage: 'account', name: 'Ledger', job: 'Spent against earned, per take. Proposes moving chips, and benching what costs money and makes none.', alone: 'Keep the books', needsYes: 'Moving chips (Mondays)', builtFrom: 'usage_records, app_purchases, a new takes table', budget: 0 },
  { id: 'calibrator', stage: 'account', name: 'Calibrator', job: 'Scores your calls against what happened. Shadow-tests a few of your passes for $3 so the score is honest both ways.', alone: 'Score, shadow-test passes', needsYes: 'Nothing', builtFrom: 'The takes table, a tiny test page per pass', budget: 1 },
];

export const crewById = (id: string) => CREW.find((c) => c.id === id)!;
export const stageOf = (crewId: string) => STAGES.find((s) => s.id === crewById(crewId).stage)!;

export const START_DATE = new Date(2026, 9, 5); // Monday Oct 5 2026 is day 1

export function dayLabel(day: number, long = false) {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString('en-US', long ? { weekday: 'long', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
}

export const isMonday = (day: number) => day % 7 === 1;
