'use client';

import { useState } from 'react';
import { DIRECTIONS, PASS_REASONS, KILL_REASONS, DECLINE_REASONS, crewById, takeById, type Call } from './data';
import {
  answer, recommend, kanTakesToday, ledgerPlan, sortItems, holdsChips, funded,
  OUTWARD_LABEL, TOTAL_CHIPS,
  type Answer, type Item, type Sim,
} from './sim';
import { Button, Reasons, duration, money } from './ui';

type SetSim = (fn: (s: Sim) => Sim) => void;

/** Rough seconds each kind of call takes, for the "about 2 minutes" line. */
const ITEM_SECONDS: Record<Item['kind'], number> = { conviction: 15, build: 25, ship: 60, outward: 10, trust: 5, allocate: 40, direction: 8 };

/** The conviction scale. Color deepens with certainty; cobalt only ever marks your decision. */
const SCALE: { id: Call; label: string; cls: string }[] = [
  { id: 'pass', label: 'Pass', cls: 'bg-(--card) text-(--ink)' },
  { id: 'leanNo', label: 'Not sure', cls: 'bg-(--card) text-(--ink)' },
  { id: 'leanYes', label: 'Yes', cls: 'bg-(--wash) text-(--cobalt)' },
  { id: 'strong', label: 'Strong yes', cls: 'bg-(--cobalt) text-white' },
];

export function Today({ sim, setSim, onNextDay, onApps }: { sim: Sim; setSim: SetSim; onNextDay: () => void; onApps: () => void }) {
  const items = sortItems(sim.items);
  const current = items[0];
  const total = items.length;
  const estimate = items.reduce((n, i) => n + ITEM_SECONDS[i.kind], 0);
  const [spentAtOpen] = useState(sim.seconds);

  return (
    <div>
      <Since sim={sim} />

      {current ? (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[15px] text-(--soft)">
            <span>{total === 1 ? 'Last one' : `${total} calls left`}, about {duration(Math.max(10, Math.round(estimate / 5) * 5))}</span>
            <button type="button" onClick={() => setSim(kanTakesToday)} className="underline-offset-4 hover:text-(--ink) hover:underline">
              Let Kan decide these
            </button>
          </div>
          <div className="mt-6">
            <Card key={current.id} sim={sim} item={current} onAnswer={(a) => setSim((s) => answer(s, current.id, a))} />
          </div>
        </>
      ) : (
        <Done sim={sim} spent={sim.seconds - spentAtOpen} onNextDay={onNextDay} onApps={onApps} />
      )}
    </div>
  );
}

/** What changed since yesterday, as one sentence, with the rest a tap away. */
function Since({ sim }: { sim: Sim }) {
  const [open, setOpen] = useState(false);
  const last = sim.events.filter((e) => e.day === sim.day - 1 && e.tone !== 'you' && !e.morning);
  if (sim.day === 1 || !last.length) return null;
  const earned = last.reduce((n, e) => n + (e.earn ?? 0), 0);
  const reserved = Object.values(sim.takes).reduce((n, t) => {
    const today = t.series.find((p) => p.day === sim.day - 1);
    const before = t.series.find((p) => p.day === sim.day - 2);
    return n + (today ? today.taps - (before?.taps ?? 0) : 0);
  }, 0);
  const selling = Object.values(sim.takes).some((t) => t.stage === 'live');
  const lead = earned
    ? `Since yesterday your apps made ${money(earned)}.`
    : reserved
      ? `Overnight, ${reserved} ${reserved === 1 ? 'person' : 'people'} reserved an app that doesn’t exist yet.`
      : selling ? 'Nothing sold since yesterday.' : 'A quiet night. The crew kept working.';
  const notable = last.find((e) => !e.earn && e.tone);

  return (
    <div className="rounded-[20px] bg-(--card) px-5 py-4 ring-1 ring-(--line)">
      <p className="text-[17px] leading-[1.5] text-(--ink)">
        {lead} {notable && <span className="text-(--soft)">{notable.text}</span>}
      </p>
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[15px] text-(--soft) underline-offset-4 hover:text-(--ink) hover:underline">
        {open ? 'Hide' : `Everything the crew did (${last.length})`}
      </button>
      {open && (
        <ul className="mt-3 space-y-2.5 border-t border-(--line) pt-3">
          {last.map((e, n) => (
            <li key={n} className="text-[15px] leading-[1.45] text-(--soft)">
              <span className="text-(--ink)">{crewById(e.agent).name}.</span> {e.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Done({ sim, spent, onNextDay, onApps }: { sim: Sim; spent: number; onNextDay: () => void; onApps: () => void }) {
  const working = Object.values(sim.takes).filter((t) => holdsChips(t) && !t.waiting);
  const names = (stages: string[]) => working.filter((t) => stages.includes(t.stage)).map((t) => takeById(t.id).app);
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
  const testing = names(['practice']);
  const building = names(['building', 'checking']);
  const selling = names(['live']);
  const lines = [
    testing.length && `testing ${list(testing)}`,
    building.length && `building ${list(building)}`,
    selling.length && `selling ${list(selling)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="pt-14">
      <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] text-(--ink) sm:text-[48px]">You’re done for today.</h2>
      <p className="mt-5 max-w-[36ch] text-[19px] leading-[1.5] text-(--soft)">
        {spent > 0 ? `That took ${duration(spent)}. ` : ''}
        {lines.length ? `While you’re away, the crew is ${lines.join(', ')}.` : 'The scouts keep reading. New takes arrive in the morning.'}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={onApps}>See your apps</Button>
        <Button kind="quiet" onClick={onNextDay}>Skip to tomorrow</Button>
      </div>
    </div>
  );
}

// ── The cards ──

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] font-medium text-(--cobalt)">{children}</p>;
}

function Headline({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.022em] text-(--ink) [text-wrap:balance] sm:text-[40px]">{children}</h2>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.55] text-(--soft)">{children}</p>;
}

function KanLine({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 max-w-[60ch] text-[17px] leading-[1.55] text-(--ink)"><span className="font-semibold">Kan says</span> {children}</p>;
}

function Card({ sim, item, onAnswer }: { sim: Sim; item: Item; onAnswer: (a: Answer) => void }) {
  switch (item.kind) {
    case 'conviction': return <Take sim={sim} item={item} onAnswer={onAnswer} />;
    case 'build': return <Build sim={sim} item={item} onAnswer={onAnswer} />;
    case 'ship': return <Ship sim={sim} item={item} onAnswer={onAnswer} />;
    case 'outward': return <Outward item={item} onAnswer={onAnswer} />;
    case 'trust': return <Trust item={item} onAnswer={onAnswer} />;
    case 'allocate': return <Allocate sim={sim} onAnswer={onAnswer} />;
    case 'direction': return <Direction item={item} onAnswer={onAnswer} />;
  }
}

const kanRead = (j: number) => (j >= 0.65 ? 'Kan thinks this will sell.' : j >= 0.5 ? 'Kan thinks it could go either way.' : 'Kan doubts this one.');

function Take({ sim, item, onAnswer }: { sim: Sim; item: Extract<Item, { kind: 'conviction' }>; onAnswer: (a: Answer) => void }) {
  const t = takeById(item.takeId);
  const st = sim.takes[item.takeId];
  const [call, setCall] = useState<Call | null>(null);
  const [more, setMore] = useState(false);
  const [first, ...rest] = t.evidence;

  return (
    <article>
      <Kicker>{item.second ? 'Worth a second look' : 'A take from the scouts'}</Kicker>
      <Headline>{t.title}</Headline>

      {item.second && st.shadow && (
        <Body>You {st.call === 'pass' ? 'passed' : 'weren’t sure'}, so Kan showed a $3 test page to 40 people. {st.shadow.taps} reserved, which clears your {sim.mandate.bar}% bar.</Body>
      )}

      <figure className="mt-7 border-l-[3px] border-(--cobalt) pl-5">
        <blockquote className="text-[20px] leading-[1.45] text-(--ink)">{first.quote}</blockquote>
        <figcaption className="mt-2 text-[15px] text-(--soft)">{first.source}</figcaption>
      </figure>

      <div className="mt-7 rounded-[20px] bg-(--card) p-5 ring-1 ring-(--line)">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[19px] font-semibold text-(--ink)">{t.app}</p>
          <p className="whitespace-nowrap text-[17px] text-(--ink)">{t.priceLabel}</p>
        </div>
        <p className="mt-1.5 text-[16px] leading-[1.5] text-(--soft)">{t.does}</p>
      </div>

      <p className="mt-5 text-[16px] leading-[1.5] text-(--soft)">
        {kanRead(t.jev)}{t.clock ? ` ${t.clock}.` : ''}{t.competition === 'crowded' ? ' Free tools already do something like it.' : ''}
      </p>

      {more && (
        <div className="mt-5 space-y-5">
          <p className="max-w-[60ch] text-[17px] leading-[1.55] text-(--soft)">{t.thesis}</p>
          {rest.map((e) => (
            <figure key={e.source} className="border-l-[3px] border-(--line) pl-5">
              <blockquote className="text-[17px] leading-[1.5] text-(--ink)">{e.quote}</blockquote>
              <figcaption className="mt-1 text-[15px] text-(--soft)">{e.source}</figcaption>
            </figure>
          ))}
          {t.shelf && sim.mandate.shelf && <p className="text-[15px] text-(--soft)">Closest thing you already have: {t.shelf}.</p>}
        </div>
      )}
      <button type="button" onClick={() => setMore(!more)} className="mt-4 text-[15px] text-(--soft) underline-offset-4 hover:text-(--ink) hover:underline">
        {more ? 'Less' : 'Why this take'}
      </button>

      <div className="mt-9">
        <p className="text-[17px] font-medium text-(--ink)">{item.second ? 'Test it now?' : 'How sure are you?'}</p>
        <div role="group" aria-label="How sure are you?" className="mt-3 grid grid-cols-4 gap-1.5 rounded-[22px] bg-(--line) p-1.5">
          {SCALE.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={call === c.id}
              onClick={() => (c.id === 'leanYes' || c.id === 'strong' ? onAnswer({ kind: 'conviction', call: c.id }) : setCall(c.id))}
              className={`min-h-[56px] rounded-[16px] px-1 text-[15px] font-medium leading-tight transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-(--cobalt) sm:text-[16px] ${c.cls} ${call === c.id ? 'ring-2 ring-(--ink)' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[15px] leading-[1.5] text-(--soft)">A yes puts up a test page for five days. Nothing gets built, and nobody is charged.</p>
        {call === 'pass' && <Reasons prompt="What’s wrong with it? Kan will remember." options={PASS_REASONS} onPick={(r) => onAnswer({ kind: 'conviction', call: 'pass', reason: r })} onCancel={() => setCall(null)} />}
        {call === 'leanNo' && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => onAnswer({ kind: 'conviction', call: 'leanNo' })}>Park it</Button>
            <Button kind="quiet" onClick={() => setCall(null)}>Cancel</Button>
          </div>
        )}
      </div>
    </article>
  );
}

function Meter({ value, bar }: { value: number; bar: number }) {
  const max = Math.max(bar * 2.5, value * 1.2);
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative mt-8 h-3 rounded-full bg-(--line)">
      <div className={`h-full rounded-full ${value >= bar ? 'bg-(--money)' : 'bg-(--warn)'}`} style={{ width: at(value) }} />
      <div className="absolute -top-2 h-7 w-[2px] rounded bg-(--ink)" style={{ left: at(bar) }} />
      <p className="absolute top-6 -translate-x-1/2 whitespace-nowrap text-[14px] text-(--ink)" style={{ left: at(bar) }}>your bar, {bar}%</p>
    </div>
  );
}

function Build({ sim, item, onAnswer }: { sim: Sim; item: Extract<Item, { kind: 'build' }>; onAnswer: (a: Answer) => void }) {
  const t = takeById(item.takeId);
  const st = sim.takes[item.takeId];
  const r = st.result!;
  const [dropping, setDropping] = useState(false);
  const rec = recommend(sim, item) as Extract<Answer, { kind: 'build' }>;
  const pctText = `${(r.rate * 100).toFixed(1)}%`;
  const advice = rec.choice === 'build'
    ? `build it. ${r.taps} people asked for it before it existed, and they’re your first customers.`
    : rec.choice === 'again'
      ? (r.visits < 80 ? `test another week. ${r.visits} visits is too few to tell.` : 'test another week. It’s close.')
      : `drop it. ${pctText} is well under your bar.`;

  return (
    <article>
      <Kicker>Test results</Kicker>
      <Headline>{r.taps} of {r.visits} people reserved {t.app}.</Headline>
      <Body>That’s {pctText}. You build anything that reaches {sim.mandate.bar}%.</Body>
      <div className="mb-14"><Meter value={r.rate * 100} bar={sim.mandate.bar} /></div>
      <KanLine>{advice}</KanLine>
      {dropping ? (
        <Reasons prompt="Why drop it?" options={KILL_REASONS.map((x) => ({ id: x, label: x }))} onPick={(reason) => onAnswer({ kind: 'build', choice: 'kill', reason })} onCancel={() => setDropping(false)} />
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button kind="decide" onClick={() => onAnswer({ kind: 'build', choice: 'build' })}>Build it</Button>
          <Button onClick={() => onAnswer({ kind: 'build', choice: 'again' })}>Test another week</Button>
          <Button kind="quiet" onClick={() => setDropping(true)}>Drop it</Button>
        </div>
      )}
    </article>
  );
}

function Phone({ app, preview }: { app: string; preview: { header: string; rows: string[]; cta: string } }) {
  return (
    <div className="w-[230px] rounded-[34px] bg-(--ink) p-2.5 shadow-[0_24px_48px_-20px_rgba(17,26,46,0.45)]">
      <div className="rounded-[26px] bg-(--card) px-4 pb-5 pt-6">
        <p className="text-[13px] font-medium text-(--faint)">{app}</p>
        <p className="mt-1 text-[18px] font-semibold leading-tight text-(--ink)">{preview.header}</p>
        <div className="mt-4 space-y-2">
          {preview.rows.map((row) => <p key={row} className="rounded-xl bg-(--paper) px-3 py-2.5 text-[13px] leading-snug text-(--ink)">{row}</p>)}
        </div>
        <p className="mt-4 rounded-full bg-(--ink) py-2.5 text-center text-[14px] font-medium text-white">{preview.cta}</p>
      </div>
    </div>
  );
}

function Ship({ sim, item, onAnswer }: { sim: Sim; item: Extract<Item, { kind: 'ship' }>; onAnswer: (a: Answer) => void }) {
  const t = takeById(item.takeId);
  const st = sim.takes[item.takeId];
  const [mode, setMode] = useState<'idle' | 'back' | 'drop'>('idle');
  const [note, setNote] = useState(t.qa.open);
  const fixed = t.qa.fixed.length;

  return (
    <article>
      <Kicker>Ready to ship</Kicker>
      <Headline>{t.app} is built and tested.</Headline>
      <div className="mt-8 flex justify-center sm:justify-start"><Phone app={t.app} preview={t.preview} /></div>
      <Body>
        The tester fixed {fixed === 1 ? 'one thing' : `${fixed} things`}. One small thing is left: {t.qa.open.charAt(0).toLowerCase() + t.qa.open.slice(1)}{' '}
        {st.reserved > 0 && <>{st.reserved} {st.reserved === 1 ? 'person is' : 'people are'} waiting to buy it at {t.priceLabel}.</>}
      </Body>
      {mode === 'drop' ? (
        <Reasons prompt="Why drop it?" options={KILL_REASONS.map((x) => ({ id: x, label: x }))} onPick={(reason) => onAnswer({ kind: 'ship', choice: 'kill', reason })} onCancel={() => setMode('idle')} />
      ) : mode === 'back' ? (
        <div className="mt-6">
          <label htmlFor="sendback" className="text-[16px] text-(--ink)">What should change?</label>
          <textarea id="sendback" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full resize-none rounded-[16px] bg-(--card) px-4 py-3 text-[17px] leading-[1.5] text-(--ink) ring-1 ring-(--line) focus:outline-none focus:ring-2 focus:ring-(--cobalt)" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button kind="decide" onClick={() => onAnswer({ kind: 'ship', choice: 'back', note })}>Send it back</Button>
            <Button kind="quiet" onClick={() => setMode('idle')}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button kind="decide" onClick={() => onAnswer({ kind: 'ship', choice: 'ship' })}>Ship it at {t.priceLabel}</Button>
          <Button onClick={() => setMode('back')}>Send it back</Button>
          <Button kind="quiet" onClick={() => setMode('drop')}>Drop it</Button>
        </div>
      )}
    </article>
  );
}

function outwardAsk(item: Extract<Item, { kind: 'outward' }>) {
  const t = takeById(item.takeId);
  if (item.out === 'testpost') return `Ok to share the ${t.app} test page in ${t.where}?`;
  if (item.out === 'launchmail') return `Ok to tell the ${item.count} ${item.count === 1 ? 'person' : 'people'} who reserved ${t.app} that it’s ready?`;
  return `Ok to post the ${t.app} launch in ${t.where}?`;
}

function Outward({ item, onAnswer }: { item: Extract<Item, { kind: 'outward' }>; onAnswer: (a: Answer) => void }) {
  const [draft, setDraft] = useState(item.draft);
  const [declining, setDeclining] = useState(false);

  return (
    <article>
      <Kicker>Before anything goes out</Kicker>
      <Headline>{outwardAsk(item)}</Headline>
      <label htmlFor="draft" className="mt-7 block text-[15px] text-(--soft)">Kan’s draft. Change anything.</label>
      <textarea
        id="draft"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        className="mt-2 w-full resize-none rounded-[20px] bg-(--card) px-5 py-4 text-[18px] leading-[1.55] text-(--ink) ring-1 ring-(--line) focus:outline-none focus:ring-2 focus:ring-(--cobalt)"
      />
      {declining ? (
        <Reasons prompt="What’s wrong with it? Kan will remember." options={DECLINE_REASONS.map((x) => ({ id: x, label: x }))} onPick={(reason) => onAnswer({ kind: 'outward', choice: 'decline', reason })} onCancel={() => setDeclining(false)} />
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button kind="decide" onClick={() => onAnswer({ kind: 'outward', choice: 'send', draft })}>{item.out === 'launchmail' ? 'Send it' : 'Post it'}</Button>
          <Button onClick={() => setDeclining(true)}>Don’t</Button>
        </div>
      )}
    </article>
  );
}

function Trust({ item, onAnswer }: { item: Extract<Item, { kind: 'trust' }>; onAnswer: (a: Answer) => void }) {
  const what = OUTWARD_LABEL[item.out].charAt(0).toLowerCase() + OUTWARD_LABEL[item.out].slice(1);
  return (
    <article>
      <Kicker>You’ve said yes twice without changing a word</Kicker>
      <Headline>Let Kan {what} without asking?</Headline>
      <Body>It would still tell you the next morning. One “don’t” and it goes back to asking.</Body>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button kind="decide" onClick={() => onAnswer({ kind: 'trust', yes: true })}>Stop asking</Button>
        <Button onClick={() => onAnswer({ kind: 'trust', yes: false })}>Keep asking</Button>
      </div>
    </article>
  );
}

function Allocate({ sim, onAnswer }: { sim: Sim; onAnswer: (a: Answer) => void }) {
  const held = Object.values(sim.takes).filter(funded);
  const [chips, setChips] = useState<Record<string, number>>(() => Object.fromEntries(held.map((t) => [t.id, t.chips])));
  const unit = sim.mandate.budget / TOTAL_CHIPS;
  const used = Object.values(chips).reduce((a, b) => a + b, 0);
  const left = TOTAL_CHIPS - used;

  return (
    <article>
      <Kicker>Monday</Kicker>
      <Headline>Where should this week’s {money(sim.mandate.budget)} go?</Headline>
      <Body>It pays for ads behind tests and apps that are selling. Apps being built don’t need any.</Body>
      <ul className="mt-6 divide-y divide-(--line) rounded-[20px] bg-(--card) ring-1 ring-(--line)">
        {held.map((st) => {
          const t = takeById(st.id);
          const n = chips[st.id] ?? 0;
          const status = st.stage === 'live'
            ? `Made ${money(st.earned)}, cost ${money(st.spent)}`
            : `Testing, ${st.taps} reserved so far`;
          return (
            <li key={st.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-medium text-(--ink)">{t.app}</p>
                <p className="mt-0.5 text-[15px] text-(--soft)">{status}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={`Less for ${t.app}`} onClick={() => setChips((c) => ({ ...c, [st.id]: Math.max(0, n - 1) }))} className="h-10 w-10 rounded-full text-[20px] text-(--ink) ring-1 ring-(--line) hover:ring-(--faint)">−</button>
                <span className="w-12 text-center text-[17px] font-semibold tabular-nums text-(--ink)">{money(n * unit)}</span>
                <button type="button" aria-label={`More for ${t.app}`} disabled={left <= 0} onClick={() => setChips((c) => ({ ...c, [st.id]: n + 1 }))} className="h-10 w-10 rounded-full text-[20px] text-(--ink) ring-1 ring-(--line) hover:ring-(--faint) disabled:opacity-30">+</button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[15px] text-(--soft)">{left ? `${money(left * unit)} left unspent.` : 'All of it is spoken for.'}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button kind="decide" onClick={() => onAnswer({ kind: 'allocate', chips })}>Use this split</Button>
        <Button onClick={() => setChips(ledgerPlan(sim))}>Show Kan’s split</Button>
      </div>
    </article>
  );
}

function Direction({ item, onAnswer }: { item: Extract<Item, { kind: 'direction' }>; onAnswer: (a: Answer) => void }) {
  const dir = DIRECTIONS.find((d) => d.id === item.dirId)!;
  return (
    <article>
      <Kicker>A question about direction</Kicker>
      <Headline>{dir.question}</Headline>
      <Body>{dir.why}</Body>
      <div className="mt-7 space-y-3">
        {dir.options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onAnswer({ kind: 'direction', option: o.id })}
            className="block w-full rounded-[20px] bg-(--card) px-5 py-4 text-left ring-1 ring-(--line) transition hover:ring-2 hover:ring-(--cobalt) focus-visible:outline-2 focus-visible:outline-(--cobalt)"
          >
            <p className="text-[18px] font-medium text-(--ink)">{o.label}</p>
            <p className="mt-1 text-[15px] text-(--soft)">{o.note}</p>
          </button>
        ))}
      </div>
    </article>
  );
}
