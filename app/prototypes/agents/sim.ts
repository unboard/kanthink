/**
 * The studio simulation. Pure functions over a plain object, so the UI can
 * hold it in one useState and every answer is a step you could replay.
 *
 * A day has two halves. `morning` is what reaches you: scouts surface takes,
 * gates that came due wait in the check-in. `overnight` is what agents do
 * while you're elsewhere: tests collect visits, builds progress, live apps sell.
 * Nothing at a gate moves until you (or Kan, if you hand it the day) decide.
 */

import {
  TAKES, SCOUT_DAYS, DIRECTIONS, PASS_REASONS, AUDIENCES, crewById, takeById, isMonday, isYes,
  type Call, type Mandate, type OutwardKind, type Stage, type Take,
} from './data';

export interface TakeState {
  id: string;
  stage: Stage;
  found: number;
  call?: Call;
  callBy?: 'you' | 'kan';
  reason?: string;
  chips: number;
  daysIn: number;
  weeks: number;
  spent: number;
  earned: number;
  visits: number;
  /** Visits to the test page, which is what the reserve rate is read against. */
  testVisits: number;
  taps: number;
  reserved: number;
  sales: number;
  boost: number;
  pendingSales: number;
  waiting: boolean;
  liveSince?: number;
  closedDay?: number;
  series: { day: number; net: number; rate: number }[];
  result?: { rate: number; visits: number; taps: number; cleared: boolean };
  shadowDue?: number;
  shadow?: { visits: number; taps: number; cleared: boolean };
  reAsked?: boolean;
  closedReason?: string;
  outside?: boolean;
}

export type Item =
  | { id: string; day: number; kind: 'conviction'; takeId: string; second?: boolean }
  | { id: string; day: number; kind: 'build'; takeId: string }
  | { id: string; day: number; kind: 'ship'; takeId: string }
  | { id: string; day: number; kind: 'outward'; takeId: string; out: OutwardKind; draft: string; count?: number }
  | { id: string; day: number; kind: 'trust'; out: OutwardKind }
  | { id: string; day: number; kind: 'allocate' }
  | { id: string; day: number; kind: 'direction'; dirId: string };

export type Answer =
  | { kind: 'conviction'; call: Call; reason?: string }
  | { kind: 'build'; choice: 'build' | 'again' | 'kill'; reason?: string }
  | { kind: 'ship'; choice: 'ship' | 'back' | 'kill'; reason?: string; note?: string }
  | { kind: 'outward'; choice: 'send' | 'decline'; draft?: string; reason?: string }
  | { kind: 'trust'; yes: boolean }
  | { kind: 'allocate'; chips: Record<string, number> }
  | { kind: 'direction'; option: string };

export interface SimEvent {
  day: number;
  agent: string;
  text: string;
  takeId?: string;
  earn?: number;
  tone?: 'good' | 'bad' | 'you';
  /** Logged as the day began, not overnight — kept out of the overnight note. */
  morning?: boolean;
}

export interface CallRecord {
  takeId: string;
  call: Call;
  by: 'you' | 'kan';
  right: boolean;
  how: 'test' | 'shadow';
  day: number;
}

export interface Sim {
  day: number;
  started: boolean;
  mandate: Mandate;
  takes: Record<string, TakeState>;
  items: Item[];
  events: SimEvent[];
  rules: { text: string; day: number }[];
  passTags: string[];
  focus?: string;
  answers: Record<string, string>;
  trust: Record<OutwardKind, boolean>;
  streak: Record<OutwardKind, number>;
  offered: OutwardKind[];
  seconds: number;
  agentMinutes: number;
  calls: CallRecord[];
  seq: number;
}

export const TOTAL_CHIPS = 10;
const CPC = 0.5;
const PRACTICE_DAYS = 5;

export const OUTWARD_AGENT: Record<OutwardKind, string> = { testpost: 'reach', launchmail: 'mailer', launchpost: 'poster' };
export const OUTWARD_LABEL: Record<OutwardKind, string> = {
  testpost: 'Share a test page where the demand was found',
  launchmail: 'Tell people who reserved that it’s ready',
  launchpost: 'Post a launch where its customers are',
};

// ── Deterministic randomness: the same calls replay the same month ──

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function count(n: number, p: number, seed: string) {
  const r = rng(seed);
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k++;
  return k;
}

// ── Helpers the UI uses too ──

export const chipValue = (s: Sim) => s.mandate.budget / TOTAL_CHIPS;
export const holdsChips = (st: TakeState) => ['practice', 'building', 'checking', 'live'].includes(st.stage);
export const spareChips = (s: Sim) => TOTAL_CHIPS - Object.values(s.takes).filter(holdsChips).reduce((n, t) => n + t.chips, 0);
export const net = (t: TakeState) => t.earned - t.spent;
export const rate = (t: TakeState) => (t.testVisits ? t.taps / t.testVisits : 0);

/** Return since inception. Practice is simulated: what it would make at its reserve rate, live. */
export function takeReturn(s: Sim, st: TakeState): { pct: number; simulated: boolean } | null {
  const t = takeById(st.id);
  if (st.stage === 'live' || (st.stage === 'killed' && st.liveSince)) {
    return st.spent > 0 ? { pct: (st.earned - st.spent) / st.spent, simulated: false } : null;
  }
  if (st.stage === 'practice' && st.testVisits >= 20) {
    const days = Math.max(1, st.series.length);
    const perDay = st.testVisits / days;
    const revenue30 = perDay * rate(st) * 0.6 * t.price * 30;
    const spend30 = (st.chips * chipValue(s) * 30) / 7 + 2;
    return { pct: (revenue30 - spend30) / spend30, simulated: true };
  }
  return null;
}

export function yourRecord(s: Sim, by: 'you' | 'kan' = 'you') {
  const mine = s.calls.filter((c) => c.by === by);
  return { right: mine.filter((c) => c.right).length, total: mine.length };
}

/** How much Kan weighs your call against Jev's when ranking. Moves with your record. */
export function gutWeight(s: Sim) {
  const { right, total } = yourRecord(s);
  return Math.max(20, Math.min(80, 50 + (right - (total - right)) * 6));
}

// ── Setup ──

export function createSim(mandate: Mandate): Sim {
  return {
    day: 1, started: false, mandate,
    takes: {}, items: [], events: [], rules: [], passTags: [], answers: {},
    trust: { testpost: false, launchmail: false, launchpost: false },
    streak: { testpost: 0, launchmail: 0, launchpost: 0 },
    offered: [], seconds: 0, agentMinutes: 0, calls: [], seq: 0,
  };
}

export function start(prev: Sim, mandate: Mandate): Sim {
  const s = structuredClone(prev);
  s.mandate = mandate;
  s.started = true;
  s.seconds += 150;
  s.events.push({ day: 1, agent: 'analyst', tone: 'you', text: `Mandate set: ${mandate.audiences.length} kinds of customer, $${mandate.budget} a week, build when ${mandate.bar}% of test visitors reserve.` });
  morning(s);
  return s;
}

type NewItem = Item extends infer I ? (I extends Item ? Omit<I, 'id'> : never) : never;

const push = (s: Sim, item: NewItem) => {
  s.seq += 1;
  const it = { ...item, id: `i${s.seq}` } as Item;
  if (it.kind === 'outward' && s.trust[it.out]) { applyOutward(s, it, { kind: 'outward', choice: 'send' }, 'trusted'); return; }
  s.items.push(it);
};
const log = (s: Sim, e: Omit<SimEvent, 'day'> & { day?: number }) => s.events.push({ day: s.day, ...e });
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

// ── Morning: what reaches you ──

function morning(s: Sim) {
  const slots = SCOUT_DAYS.filter((d) => d === s.day).length;
  for (let i = 0; i < slots; i++) scout(s);

  const dir = DIRECTIONS.find((d) => d.day === s.day);
  if (dir) push(s, { day: s.day, kind: 'direction', dirId: dir.id });

  if (isMonday(s.day) && s.day > 1 && Object.values(s.takes).some(holdsChips)) {
    const week = Math.floor((s.day - 1) / 7);
    const last = s.events.filter((e) => e.day > s.day - 8 && e.day < s.day);
    const earned = last.reduce((n, e) => n + (e.earn ?? 0), 0);
    log(s, { agent: 'ledger', morning: true, text: `Week ${week} closed: earned $${earned.toFixed(0)} across ${Object.values(s.takes).filter((t) => t.stage === 'live').length} live bets. Chips are yours to move.` });
    push(s, { day: s.day, kind: 'allocate' });
  }
}

function blockedBy(s: Sim, t: Take): string | null {
  if (s.mandate.offLimits.includes('server') && t.tags.includes('server')) return 'it needs a server, which your mandate rules out';
  if (s.passTags.includes('crowded') && t.competition === 'crowded') return 'you said crowded markets aren’t worth it';
  if (s.passTags.includes('hard') && t.tags.includes('server')) return 'you said tools that need a server are too hard';
  return null;
}

function focusMatch(s: Sim, t: Take) {
  if (s.focus === 'print') return t.tags.includes('print');
  if (s.focus === 'solo') return t.audience === 'solo';
  if (s.focus === 'open') return t.competition === 'open';
  return false;
}

function scout(s: Sim) {
  const fresh = TAKES.filter((t) => !s.takes[t.id]);
  for (const t of fresh) {
    const why = blockedBy(s, t);
    if (!why) continue;
    s.takes[t.id] = blank(t.id, s.day, 'skipped');
    s.takes[t.id].closedReason = why;
    s.takes[t.id].closedDay = s.day;
    log(s, { agent: t.scout, takeId: t.id, text: `Skipped “${t.title}” — ${why}.` });
  }
  const open = TAKES.filter((t) => !s.takes[t.id]);
  if (!open.length) return;
  const inMandate = open.filter((t) => s.mandate.audiences.includes(t.audience));
  const pool = inMandate.length ? inMandate : open;
  const pick = [...pool].sort((a, b) => Number(focusMatch(s, b)) - Number(focusMatch(s, a)))[0];

  const st = blank(pick.id, s.day, 'asking');
  st.outside = !inMandate.length;
  st.spent = 0.6;
  s.takes[pick.id] = st;
  s.agentMinutes += 50;
  const quotes = pick.evidence.length;
  log(s, { agent: pick.scout, takeId: pick.id, text: `Found ${quotes} ${quotes === 1 ? 'voice' : 'voices'} asking for the same thing: ${lc(pick.title)}.` });
  if (pick.shelf && s.mandate.shelf) log(s, { agent: 'shelf', takeId: pick.id, text: `Closest thing you own: ${pick.shelf}. Noted as a tiebreaker.` });
  log(s, { agent: 'analyst', takeId: pick.id, text: `Wrote it up as a take. Jev’s read before any test: ${Math.round(pick.jev * 100)}%.` });
  push(s, { day: s.day, kind: 'conviction', takeId: pick.id });
}

function blank(id: string, day: number, stage: Stage): TakeState {
  return {
    id, stage, found: day, chips: 0, daysIn: 0, weeks: 0, spent: 0, earned: 0,
    visits: 0, testVisits: 0, taps: 0, reserved: 0, sales: 0, boost: 0, pendingSales: 0, waiting: false, series: [],
  };
}

// ── Overnight: what the crew does while you're elsewhere ──

function overnight(s: Sim) {
  const d = s.day;
  const cv = chipValue(s);
  for (const st of Object.values(s.takes)) {
    const t = takeById(st.id);
    const r = rng(`${st.id}:${d}`);
    const noise = 0.75 + r() * 0.5;

    if (st.stage === 'practice' && !st.waiting) {
      st.daysIn += 1;
      const ads = (st.chips * cv) / 7 / CPC;
      const fromPosts = st.boost;
      st.boost = st.boost * 0.55 < 1 ? 0 : st.boost * 0.55;
      const visits = Math.round((ads + fromPosts) * t.truth.pull * noise);
      const taps = count(visits, t.truth.intent, `${st.id}:taps:${d}`);
      st.visits += visits; st.testVisits += visits; st.taps += taps; st.reserved += taps;
      st.spent += (st.chips * cv) / 7 + 0.15;
      s.agentMinutes += 12;
      st.series.push({ day: d, net: net(st), rate: rate(st) });
      if (taps) log(s, { agent: 'testpage', takeId: st.id, text: `${taps} ${taps === 1 ? 'person' : 'people'} reserved ${t.app} at ${t.priceLabel} (${visits} visits today).` });
      if (st.daysIn >= PRACTICE_DAYS) {
        const rr = rate(st);
        const cleared = rr * 100 >= s.mandate.bar;
        st.result = { rate: rr, visits: st.testVisits, taps: st.taps, cleared };
        st.waiting = true;
        if (st.call && !s.calls.some((c) => c.takeId === st.id)) {
          s.calls.push({ takeId: st.id, call: st.call, by: st.callBy ?? 'you', right: isYes(st.call) === cleared, how: 'test', day: d });
        }
        log(s, {
          agent: 'analyst', takeId: st.id, tone: cleared ? 'good' : 'bad',
          text: `Practice round for ${t.app} is in: ${st.testVisits} visits, ${st.taps} reserved — ${(rr * 100).toFixed(1)}% against your ${s.mandate.bar}% bar. Ads paused until you decide.`,
        });
        push(s, { day: d + 1, kind: 'build', takeId: st.id });
      }
    } else if (st.stage === 'building') {
      st.daysIn += 1;
      st.spent += 2.2;
      s.agentMinutes += 240;
      if (st.daysIn === 1) log(s, { agent: 'builder', takeId: st.id, text: `Building ${t.app} from the brief.` });
      if (st.daysIn >= t.truth.buildDays) {
        st.stage = 'checking'; st.daysIn = 0;
        log(s, { agent: 'builder', takeId: st.id, text: `${t.app} is built. Handed to the play tester.` });
      }
    } else if (st.stage === 'checking' && !st.waiting) {
      st.daysIn += 1;
      st.spent += 1.2;
      s.agentMinutes += 90;
      t.qa.fixed.forEach((f) => log(s, { agent: 'tester', takeId: st.id, text: `${t.app}: ${f}.` }));
      log(s, { agent: 'judge', takeId: st.id, text: `${t.app} keeps the take’s promise: ${Math.round(t.promise * 100)}%. One open note: ${lc(t.qa.open)}` });
      st.waiting = true;
      push(s, { day: d + 1, kind: 'ship', takeId: st.id });
    } else if (st.stage === 'live') {
      const liveDays = d - (st.liveSince ?? d);
      const ads = (st.chips * cv) / 7 / CPC;
      const organic = Math.min(1 + liveDays * 0.3, 5);
      const fromPosts = st.boost;
      st.boost = st.boost * 0.55 < 1 ? 0 : st.boost * 0.55;
      const visits = Math.round((ads + organic + fromPosts) * t.truth.pull * noise);
      const sales = count(visits, t.truth.intent * 0.6, `${st.id}:sales:${d}`) + st.pendingSales;
      const fromMail = st.pendingSales;
      st.pendingSales = 0;
      st.visits += visits; st.sales += sales;
      const earn = sales * t.price;
      st.earned += earn;
      st.spent += (st.chips * cv) / 7 + 0.05;
      s.agentMinutes += 15;
      st.series.push({ day: d, net: net(st), rate: rate(st) });
      if (sales) {
        log(s, {
          agent: 'pricer', takeId: st.id, earn, tone: 'good',
          text: `${sales} ${sales === 1 ? 'sale' : 'sales'} of ${t.app} — $${earn}${fromMail ? `, ${fromMail} from people who reserved` : ''}.`,
        });
      }
      if (liveDays === 1) {
        push(s, { day: d + 1, kind: 'outward', takeId: st.id, out: 'launchpost', draft: t.launchPost });
      }
      if (liveDays === 9 && st.earned < st.spent) {
        log(s, { agent: 'ledger', takeId: st.id, tone: 'bad', text: `${t.app} has spent $${st.spent.toFixed(0)} and made $${st.earned}. I’ll suggest benching it on Monday.` });
      }
    }

    if ((st.stage === 'passed' || st.stage === 'watch') && st.shadowDue === d) {
      const visits = 40;
      const taps = count(visits, t.truth.intent, `${st.id}:shadow`);
      const cleared = (taps / visits) * 100 >= s.mandate.bar;
      st.shadow = { visits, taps, cleared };
      st.spent += 3;
      if (st.call) s.calls.push({ takeId: st.id, call: st.call, by: st.callBy ?? 'you', right: !cleared, how: 'shadow', day: d });
      log(s, {
        agent: 'calibrator', takeId: st.id, tone: cleared ? 'bad' : 'good',
        text: cleared
          ? `Shadow test on ${t.app}, which you ${st.stage === 'passed' ? 'passed on' : 'leaned no on'}: ${taps} of ${visits} reserved. That clears your bar — worth a second look.`
          : `Shadow test on ${t.app}, which you ${st.stage === 'passed' ? 'passed on' : 'leaned no on'}: ${taps} of ${visits} reserved. Good call.`,
      });
      if (cleared && !st.reAsked) {
        st.reAsked = true;
        push(s, { day: d + 1, kind: 'conviction', takeId: st.id, second: true });
      }
    }
  }
}

export function nextDay(prev: Sim): Sim {
  const s = structuredClone(prev);
  overnight(s);
  s.day += 1;
  morning(s);
  return s;
}

// ── Answers ──

const SECONDS: Record<Answer['kind'], number> = { conviction: 12, build: 25, ship: 60, outward: 10, trust: 4, allocate: 40, direction: 8 };

export function answer(prev: Sim, itemId: string, a: Answer, by: 'you' | 'kan' = 'you'): Sim {
  const s = structuredClone(prev);
  const item = s.items.find((i) => i.id === itemId);
  if (!item) return prev;
  s.items = s.items.filter((i) => i.id !== itemId);
  if (by === 'you') s.seconds += SECONDS[a.kind] + ('reason' in a && a.reason ? 4 : 0);

  if (item.kind === 'conviction' && a.kind === 'conviction') conviction(s, item.takeId, a, by, !!item.second);
  else if (item.kind === 'build' && a.kind === 'build') build(s, item.takeId, a, by);
  else if (item.kind === 'ship' && a.kind === 'ship') ship(s, item.takeId, a, by);
  else if (item.kind === 'outward' && a.kind === 'outward') applyOutward(s, item, a, by);
  else if (item.kind === 'trust' && a.kind === 'trust') {
    if (a.yes) {
      s.trust[item.out] = true;
      log(s, { agent: OUTWARD_AGENT[item.out], tone: 'you', text: `Trusted: ${lc(OUTWARD_LABEL[item.out])} — without asking, and it tells you every time. One decline puts it back.` });
    }
  } else if (item.kind === 'allocate' && a.kind === 'allocate') {
    for (const [id, n] of Object.entries(a.chips)) if (s.takes[id]) s.takes[id].chips = n;
    log(s, { agent: 'ledger', tone: by === 'you' ? 'you' : undefined, text: `Chips moved${by === 'kan' ? ' on Kan’s call' : ''}: ${Object.entries(a.chips).filter(([, n]) => n).map(([id, n]) => `${takeById(id).app} ${n}`).join(', ') || 'none'}.` });
  } else if (item.kind === 'direction' && a.kind === 'direction') {
    const dir = DIRECTIONS.find((d) => d.id === item.dirId)!;
    const opt = dir.options.find((o) => o.id === a.option)!;
    s.answers[dir.id] = opt.id;
    if (dir.id === 'dig') s.focus = opt.id;
    s.rules.push({ day: s.day, text: dir.id === 'dig' ? `Scouts dig first in: ${lc(opt.label)}.` : dir.id === 'monthly' ? `Pricing: ${lc(opt.label)}.` : `New practice chips come from: ${lc(opt.label)}.` });
    log(s, { agent: dir.id === 'dig' ? 'demand' : dir.id === 'monthly' ? 'pricer' : 'ledger', tone: by === 'you' ? 'you' : undefined, text: `Direction${by === 'kan' ? ' (Kan’s call)' : ''}: ${opt.label}.` });
  }
  return s;
}

function conviction(s: Sim, takeId: string, a: Extract<Answer, { kind: 'conviction' }>, by: 'you' | 'kan', second: boolean) {
  const st = s.takes[takeId];
  const t = takeById(takeId);
  if (!second) { st.call = a.call; st.callBy = by; st.reason = a.reason; }

  if (isYes(a.call)) {
    st.stage = 'practice';
    st.daysIn = 0;
    st.waiting = false;
    const want = a.call === 'strong' ? 3 : 2;
    let got = Math.min(want, Math.max(0, spareChips(s)));
    if (got < want && s.answers.spare === 'weakest') {
      const weakest = Object.values(s.takes).filter((x) => x.stage === 'live' && x.chips > 0).sort((x, y) => net(x) - net(y))[0];
      if (weakest) {
        const take = Math.min(want - got, weakest.chips);
        weakest.chips -= take; got += take;
        log(s, { agent: 'ledger', text: `Moved ${take} chip${take === 1 ? '' : 's'} from ${takeById(weakest.id).app} to ${t.app}, as you asked.` });
      }
    }
    st.chips = got;
    st.spent += 0.5;
    s.agentMinutes += 60;
    log(s, { agent: 'testpage', takeId, text: `Test page is up for ${t.app}: ${t.priceLabel}, a Reserve button, nobody charged. ${got} chip${got === 1 ? '' : 's'} of ads behind it.` });
    if (s.mandate.traffic !== 'ads') push(s, { day: s.day, kind: 'outward', takeId, out: 'testpost', draft: t.testPost });
    else if (got === 0) log(s, { agent: 'reach', takeId, tone: 'bad', text: `No chips free and posts are off in your mandate — the ${t.app} test will be very quiet.` });
    return;
  }

  if (second) {
    log(s, { agent: 'calibrator', takeId, text: `Still a no on ${t.app}. Closed for good.` });
    st.stage = 'passed';
    st.closedDay = s.day;
    return;
  }

  st.stage = a.call === 'pass' ? 'passed' : 'watch';
  st.closedDay = s.day;
  if (s.mandate.shadow) st.shadowDue = s.day + 5;
  const reason = PASS_REASONS.find((r) => r.id === a.reason);
  if (reason?.rule) {
    if (reason.id === 'customer') {
      const aud = AUDIENCES.find((x) => x.id === t.audience)!;
      s.mandate = { ...s.mandate, audiences: s.mandate.audiences.filter((x) => x !== t.audience) };
      s.rules.push({ day: s.day, text: `Scouts stop bringing takes for ${lc(aud.label)}.` });
    } else if (!s.passTags.includes(reason.id)) {
      s.passTags.push(reason.id);
      s.rules.push({ day: s.day, text: reason.rule });
    }
    log(s, { agent: 'analyst', takeId, tone: 'you', text: `New rule from your ${a.call === 'pass' ? 'pass' : 'lean no'} on ${t.app}: ${lc(reason.label)}.` });
  }
  if (s.mandate.shadow) log(s, { agent: 'calibrator', takeId, text: `Will shadow-test ${t.app} for $3, so your no gets scored too.` });
}

function build(s: Sim, takeId: string, a: Extract<Answer, { kind: 'build' }>, by: 'you' | 'kan') {
  const st = s.takes[takeId];
  const t = takeById(takeId);
  const who = by === 'kan' ? ' (Kan’s call)' : '';
  if (a.choice === 'build') {
    st.stage = 'building'; st.daysIn = 0; st.waiting = false;
    log(s, { agent: 'spec', takeId, tone: by === 'you' ? 'you' : undefined, text: `Build approved${who}. Brief written: the take, ${t.evidence.length} quotes, and what ${st.reserved} people asked when they reserved.` });
  } else if (a.choice === 'again') {
    st.stage = 'practice'; st.daysIn = 0; st.waiting = false; st.weeks += 1;
    log(s, { agent: 'reach', takeId, tone: by === 'you' ? 'you' : undefined, text: `Another practice week for ${t.app}${who}. Ads back on.` });
  } else {
    kill(s, st, a.reason ?? 'Nobody pays for this', by);
  }
}

function ship(s: Sim, takeId: string, a: Extract<Answer, { kind: 'ship' }>, by: 'you' | 'kan') {
  const st = s.takes[takeId];
  const t = takeById(takeId);
  if (a.choice === 'ship') {
    st.stage = 'live'; st.liveSince = s.day; st.waiting = false;
    log(s, { agent: 'pricer', takeId, tone: by === 'you' ? 'you' : undefined, text: `${t.app} is live at ${t.priceLabel}${by === 'kan' ? ' (Kan’s call)' : ''}. Checkout is wired.` });
    log(s, { agent: 'lister', takeId, text: `${t.app} is in the directory with a thumbnail and a tagline.` });
    if (st.reserved > 0) {
      push(s, {
        day: s.day, kind: 'outward', takeId, out: 'launchmail', count: st.reserved,
        draft: `You reserved ${t.app} at ${t.priceLabel}. It’s ready — ${lc(t.does)} That price is yours for the next 48 hours: [link]`,
      });
    }
  } else if (a.choice === 'back') {
    st.stage = 'building'; st.daysIn = Math.max(0, t.truth.buildDays - 1); st.waiting = false;
    log(s, { agent: 'builder', takeId, tone: 'you', text: `Sent back: “${a.note || t.qa.open}” One more build day, then the tester plays it again.` });
  } else {
    kill(s, st, a.reason ?? 'Not good enough', by);
  }
}

function kill(s: Sim, st: TakeState, reason: string, by: 'you' | 'kan') {
  st.stage = 'killed'; st.chips = 0; st.closedReason = reason; st.closedDay = s.day; st.waiting = false;
  s.items = s.items.filter((i) => !('takeId' in i) || i.takeId !== st.id);
  log(s, { agent: 'ledger', takeId: st.id, tone: by === 'you' ? 'you' : undefined, text: `Killed ${takeById(st.id).app}${by === 'kan' ? ' on Kan’s call' : ''}: ${lc(reason)}. Its chips are free.` });
}

export function killTake(prev: Sim, takeId: string, reason: string): Sim {
  const s = structuredClone(prev);
  s.seconds += 8;
  kill(s, s.takes[takeId], reason, 'you');
  return s;
}

function applyOutward(s: Sim, item: Extract<Item, { kind: 'outward' }>, a: Extract<Answer, { kind: 'outward' }>, by: 'you' | 'kan' | 'trusted') {
  const st = s.takes[item.takeId];
  const t = takeById(item.takeId);
  const agent = OUTWARD_AGENT[item.out];
  if (a.choice === 'decline') {
    s.streak[item.out] = 0;
    s.rules.push({ day: s.day, text: `${crewById(agent).name}: “${lc(a.reason ?? 'not yet')}” — ${t.app}.` });
    log(s, { agent, takeId: item.takeId, tone: 'you', text: `Held back: ${lc(OUTWARD_LABEL[item.out])} for ${t.app}. Reason kept as a rule.` });
    return;
  }
  const edited = !!a.draft && a.draft.trim() !== item.draft.trim();
  if (item.out === 'testpost') st.boost += 40;
  if (item.out === 'launchpost') st.boost += 30;
  if (item.out === 'launchmail') st.pendingSales += Math.round(st.reserved * 0.45);
  s.agentMinutes += 10;
  const prefix = by === 'trusted' ? 'Did it without asking, as you trust it to: ' : by === 'kan' ? 'On Kan’s call: ' : '';
  const what = item.out === 'testpost' ? `shared the ${t.app} test page in ${t.where}`
    : item.out === 'launchmail' ? `told ${item.count} ${item.count === 1 ? 'person' : 'people'} who reserved that ${t.app} is ready`
    : `posted the ${t.app} launch in ${t.where}`;
  log(s, { agent, takeId: item.takeId, tone: by === 'you' ? 'you' : undefined, text: `${prefix}${what}${edited ? ', in your words' : ''}.` });

  if (by !== 'you') return;
  s.streak[item.out] = edited ? 0 : s.streak[item.out] + 1;
  if (s.streak[item.out] >= 2 && !s.trust[item.out] && !s.offered.includes(item.out)) {
    s.offered.push(item.out);
    s.seq += 1;
    s.items.push({ id: `i${s.seq}`, day: s.day, kind: 'trust', out: item.out });
  }
}

// ── Kan's calls ──

/** What Kan would answer. Jev's read for convictions, the bar for builds, the ledger for chips. */
export function recommend(s: Sim, item: Item): Answer {
  switch (item.kind) {
    case 'conviction': {
      if (item.second) return { kind: 'conviction', call: 'leanYes' };
      const j = takeById(item.takeId).jev;
      if (j >= 0.7) return { kind: 'conviction', call: 'strong' };
      if (j >= 0.55) return { kind: 'conviction', call: 'leanYes' };
      if (j >= 0.4) return { kind: 'conviction', call: 'leanNo' };
      return { kind: 'conviction', call: 'pass', reason: 'pay' };
    }
    case 'build': {
      const st = s.takes[item.takeId];
      const r = st.result;
      if (!r) return { kind: 'build', choice: 'again' };
      if (r.cleared && r.taps >= 3) return { kind: 'build', choice: 'build' };
      if ((r.cleared || r.rate * 100 >= s.mandate.bar * 0.6) && st.weeks < 1) return { kind: 'build', choice: 'again' };
      return { kind: 'build', choice: 'kill', reason: 'Nobody pays for this' };
    }
    case 'ship': return { kind: 'ship', choice: 'ship' };
    case 'outward': return { kind: 'outward', choice: 'send' };
    case 'trust': return { kind: 'trust', yes: true };
    case 'direction': return { kind: 'direction', option: DIRECTIONS.find((d) => d.id === item.dirId)!.options[0].id };
    case 'allocate': return { kind: 'allocate', chips: ledgerPlan(s) };
  }
}

/** The ledger's suggested chips: back what earns, keep tests fed, bench what loses. */
export function ledgerPlan(s: Sim): Record<string, number> {
  const held = Object.values(s.takes).filter(holdsChips);
  const weight = (st: TakeState) => {
    if (st.stage === 'live') {
      const days = s.day - (st.liveSince ?? s.day);
      if (days >= 7 && st.earned < st.spent) return 0.5;
      return 2 + Math.min(3, Math.max(0, net(st)) / 15);
    }
    if (st.stage === 'practice') return 2;
    return 1.5;
  };
  const total = held.reduce((n, st) => n + weight(st), 0) || 1;
  const plan: Record<string, number> = {};
  let used = 0;
  for (const st of held) { plan[st.id] = Math.floor((weight(st) / total) * TOTAL_CHIPS); used += plan[st.id]; }
  const order = [...held].sort((a, b) => weight(b) - weight(a));
  for (let i = 0; used < TOTAL_CHIPS && order.length; i++, used++) plan[order[i % order.length].id] += 1;
  return plan;
}

export function kanTakesToday(prev: Sim): Sim {
  let s = prev;
  let guard = 0;
  while (s.items.length && guard++ < 40) s = answer(s, s.items[0].id, recommend(s, s.items[0]), 'kan');
  return s;
}

export function playDays(prev: Sim, days: number): Sim {
  let s = prev;
  for (let i = 0; i < days; i++) s = nextDay(kanTakesToday(s));
  return s;
}

export const ITEM_ORDER: Item['kind'][] = ['ship', 'build', 'outward', 'trust', 'allocate', 'conviction', 'direction'];
export const sortItems = (items: Item[]) =>
  [...items].sort((a, b) => ITEM_ORDER.indexOf(a.kind) - ITEM_ORDER.indexOf(b.kind) || a.day - b.day);
