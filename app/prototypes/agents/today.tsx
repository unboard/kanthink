'use client';

import { useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import {
  AUDIENCES, CALLS, DIRECTIONS, PASS_REASONS, KILL_REASONS, DECLINE_REASONS, crewById, takeById, dayLabel,
  type Call,
} from './data';
import {
  answer, recommend, kanTakesToday, ledgerPlan, sortItems, rate, holdsChips,
  OUTWARD_AGENT, OUTWARD_LABEL, TOTAL_CHIPS,
  type Answer, type Item, type Sim,
} from './sim';
import { AgentTag, Btn, Chips, Spark, StagePill, Why, duration, money } from './ui';

type SetSim = (fn: (s: Sim) => Sim) => void;

const ITEM_SECONDS: Record<Item['kind'], number> = { conviction: 15, build: 25, ship: 60, outward: 10, trust: 4, allocate: 40, direction: 8 };
const KIND_LABEL: Record<Item['kind'], string> = {
  conviction: 'Your call', build: 'Build it?', ship: 'Ship it?', outward: 'Goes outside', trust: 'Trust', allocate: 'Monday chips', direction: 'Direction',
};

export function Today({ sim, setSim, onOpenTake, onNextDay }: { sim: Sim; setSim: SetSim; onOpenTake: (id: string) => void; onNextDay: () => void }) {
  const items = sortItems(sim.items);
  const current = items[0];
  const estimate = items.reduce((n, i) => n + ITEM_SECONDS[i.kind], 0);
  const send = (a: Answer) => current && setSim((s) => answer(s, current.id, a));

  return (
    <div className="mx-auto max-w-xl px-3 py-5 sm:px-0">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-neutral-500">{dayLabel(sim.day, true)}</p>
          <h2 className="mt-0.5 text-[20px] font-semibold tracking-tight text-neutral-100">
            {items.length ? `Kan has ${items.length} ${items.length === 1 ? 'thing' : 'things'} for you` : 'Nothing waiting on you'}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-neutral-500">
            {items.length ? `About ${duration(estimate)} · your mandate allows ${sim.mandate.minutes} min a day` : 'The crew has everything it needs until tomorrow.'}
          </p>
        </div>
        {items.length > 0 && (
          <button onClick={() => setSim(kanTakesToday)} className="flex-shrink-0 text-[12px] text-neutral-500 hover:text-violet-300">
            Kan’s calls for the rest →
          </button>
        )}
      </div>

      <Overnight sim={sim} onOpenTake={onOpenTake} />

      {items.length > 1 && (
        <div className="mt-5 flex items-center gap-1">
          {items.map((it, n) => (
            <span key={it.id} className={`h-1 flex-1 rounded-full ${n === 0 ? 'bg-violet-400' : 'bg-neutral-800'}`} />
          ))}
        </div>
      )}

      <div className="mt-3">
        {current ? (
          <Card key={current.id} sim={sim} item={current} onAnswer={send} onOpenTake={onOpenTake} />
        ) : (
          <AllClear sim={sim} onNextDay={onNextDay} />
        )}
      </div>

      {items.length > 1 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Up next</p>
          <ul className="space-y-1">
            {items.slice(1).map((it) => (
              <li key={it.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-neutral-400">
                <span className="w-24 flex-shrink-0 text-[11px] text-neutral-600">{KIND_LABEL[it.kind]}</span>
                <span className="truncate">{itemTitle(it)}</span>
                {it.day < sim.day && <span className="ml-auto flex-shrink-0 text-[10.5px] text-amber-300/80">waiting since {dayLabel(it.day).split(',')[0]}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-6 text-center text-[11px] text-neutral-600">Time you’ve given the studio so far: {duration(sim.seconds)}</p>
    </div>
  );
}

function itemTitle(it: Item) {
  switch (it.kind) {
    case 'conviction': return takeById(it.takeId).title;
    case 'build': return `${takeById(it.takeId).app} — practice results`;
    case 'ship': return `${takeById(it.takeId).app} is built and checked`;
    case 'outward': return `${OUTWARD_LABEL[it.out]} — ${takeById(it.takeId).app}`;
    case 'trust': return `Stop asking before: ${OUTWARD_LABEL[it.out].toLowerCase()}?`;
    case 'allocate': return 'Spread this week’s 10 chips';
    case 'direction': return DIRECTIONS.find((d) => d.id === it.dirId)!.question;
  }
}

function Overnight({ sim, onOpenTake }: { sim: Sim; onOpenTake: (id: string) => void }) {
  const last = sim.events.filter((e) => e.day === sim.day - 1 && e.tone !== 'you' && !e.morning);
  if (sim.day === 1 || !last.length) return null;
  const earned = last.reduce((n, e) => n + (e.earn ?? 0), 0);
  const pick = [...last].sort((a, b) => Number(!!b.earn) - Number(!!a.earn) || Number(!!b.tone) - Number(!!a.tone)).slice(0, 4);
  return (
    <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/30 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] text-neutral-500">
        <KanthinkIcon size={14} className="text-violet-400" />
        <span>Overnight</span>
        <span className="ml-auto tabular-nums">{last.length} things happened{earned ? <> · <span className="text-emerald-300">{money(earned)} earned</span></> : ''}</span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {pick.map((e, n) => (
          <li key={n} className="text-[12.5px] leading-snug text-neutral-300">
            <AgentTag id={e.agent} /> <span className={e.earn ? 'text-emerald-200' : ''}>{e.text}</span>
            {e.takeId && <button onClick={() => onOpenTake(e.takeId!)} className="ml-1 text-[11px] text-neutral-600 hover:text-neutral-300">open</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AllClear({ sim, onNextDay }: { sim: Sim; onNextDay: () => void }) {
  const tonight = Object.values(sim.takes).filter((t) => ['practice', 'building', 'checking', 'live'].includes(t.stage) && !t.waiting);
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-neutral-200">That’s today.</p>
      <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-neutral-500">
        {tonight.length
          ? `Tonight the crew works ${tonight.length} ${tonight.length === 1 ? 'take' : 'takes'}: ${tonight.map((t) => takeById(t.id).app).join(', ')}. Anything that needs you comes back here tomorrow.`
          : 'Scouts keep reading. Anything that needs you comes back here tomorrow.'}
      </p>
      <div className="mt-4"><Btn kind="violet" onClick={onNextDay}>Go to tomorrow →</Btn></div>
    </div>
  );
}

// ── Cards ──

function Shell({ kind, agent, children, ring = 'ring-violet-500/25', right }: { kind: string; agent?: string; children: React.ReactNode; ring?: string; right?: React.ReactNode }) {
  return (
    <article className={`rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 ring-1 sm:p-5 ${ring}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-200">{kind}</span>
        {agent && <AgentTag id={agent} />}
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </article>
  );
}

function Card({ sim, item, onAnswer, onOpenTake }: { sim: Sim; item: Item; onAnswer: (a: Answer) => void; onOpenTake: (id: string) => void }) {
  switch (item.kind) {
    case 'conviction': return <ConvictionCard sim={sim} item={item} onAnswer={onAnswer} />;
    case 'build': return <BuildCard sim={sim} item={item} onAnswer={onAnswer} onOpenTake={onOpenTake} />;
    case 'ship': return <ShipCard sim={sim} item={item} onAnswer={onAnswer} />;
    case 'outward': return <OutwardCard sim={sim} item={item} onAnswer={onAnswer} />;
    case 'trust': return <TrustCard item={item} onAnswer={onAnswer} />;
    case 'allocate': return <AllocateCard sim={sim} onAnswer={onAnswer} />;
    case 'direction': return <DirectionCard item={item} onAnswer={onAnswer} />;
  }
}

function ConvictionCard({ sim, item, onAnswer }: { sim: Sim; item: Extract<Item, { kind: 'conviction' }>; onAnswer: (a: Answer) => void }) {
  const t = takeById(item.takeId);
  const st = sim.takes[item.takeId];
  const [call, setCall] = useState<Call | null>(null);
  const aud = AUDIENCES.find((a) => a.id === t.audience)!;

  return (
    <Shell
      kind={item.second ? 'Second look' : 'Your call'}
      agent={item.second ? 'calibrator' : t.scout}
      right={<span className="text-neutral-500">{aud.label}{st.outside && <span className="text-amber-300/80"> · outside your mandate</span>}</span>}
    >
      {item.second && st.shadow && (
        <div className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] leading-snug text-amber-100">
          You {st.call === 'pass' ? 'passed' : 'leaned no'} on this. A $3 shadow test showed it to 40 people: {st.shadow.taps} reserved — that clears your {sim.mandate.bar}% bar.
        </div>
      )}
      <h3 className="text-[19px] font-semibold leading-snug tracking-tight text-neutral-50">{t.title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">{t.thesis}</p>

      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">The bet</p>
          <p className="text-[13px] font-medium text-neutral-100">{t.priceLabel}</p>
        </div>
        <p className="mt-1 text-[14px] font-medium text-neutral-100">{t.app}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-neutral-400">{t.does}</p>
      </div>

      <ul className="mt-4 space-y-2.5">
        {t.evidence.map((e) => (
          <li key={e.source} className="border-l-2 border-neutral-700 pl-3">
            <p className="text-[13px] leading-snug text-neutral-200">{e.quote}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">{e.source}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px] sm:grid-cols-3">
        <div>
          <p className="text-neutral-500">Jev’s read</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1 w-14 overflow-hidden rounded-full bg-neutral-800"><span className="block h-full bg-neutral-300" style={{ width: `${t.jev * 100}%` }} /></span>
            <span className="tabular-nums text-neutral-300">{Math.round(t.jev * 100)}%</span>
          </div>
        </div>
        <div>
          <p className="text-neutral-500">Competition</p>
          <p className={`mt-0.5 ${t.competition === 'crowded' ? 'text-amber-300' : 'text-neutral-300'}`}>{t.competition === 'open' ? 'Nobody does this well' : t.competition === 'some' ? 'Some, none focused' : 'Crowded, some free'}</p>
        </div>
        {t.clock && <div><p className="text-neutral-500">Clock</p><p className="mt-0.5 text-neutral-300">{t.clock}</p></div>}
        {t.shelf && sim.mandate.shelf && (
          <div className="col-span-2 sm:col-span-3"><p className="text-neutral-500">Tiebreaker from your shelf</p><p className="mt-0.5 text-neutral-400">{t.shelf}</p></div>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[11.5px] text-neutral-500">{item.second ? 'Practice it now?' : 'How sure are you? A yes starts a five-day practice round — a test page, no app built, nobody charged.'}</p>
        <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-neutral-700">
          {CALLS.map((c, n) => (
            <button
              key={c.id}
              onClick={() => (c.id === 'leanYes' || c.id === 'strong' ? onAnswer({ kind: 'conviction', call: c.id }) : setCall(c.id))}
              className={`px-1 py-2.5 text-[12.5px] transition-colors ${n ? 'border-l border-neutral-700' : ''} ${
                call === c.id ? 'bg-neutral-800 text-neutral-100'
                  : c.id === 'strong' ? 'text-violet-200 hover:bg-violet-500/20'
                  : c.id === 'leanYes' ? 'text-violet-200/80 hover:bg-violet-500/10'
                  : 'text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {call && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11.5px] text-neutral-500">
              {call === 'pass' ? 'Why not? A no needs a reason — some become rules the scouts follow.' : 'Any reason? Optional.'}
            </p>
            <Chips options={PASS_REASONS} onPick={(r) => onAnswer({ kind: 'conviction', call, reason: r })} />
            {call === 'leanNo' && <button onClick={() => onAnswer({ kind: 'conviction', call })} className="mt-2 text-[12px] text-neutral-500 hover:text-neutral-300">No reason, just lean no</button>}
          </div>
        )}
      </div>
      <Why>
        Your conviction is the only thing that decides what gets tested. Strong yes backs it with 3 chips, lean yes with 2. A no costs nothing{sim.mandate.shadow ? ', and the calibrator shadow-tests it for $3 so your no gets scored too' : ''}. Every call is scored against what happens, and the score decides how much Kan leans on your gut when it ranks takes.
      </Why>
    </Shell>
  );
}

function Bar({ value, bar }: { value: number; bar: number }) {
  const max = Math.max(bar * 2.5, value * 1.15, 1);
  return (
    <div className="relative mt-2 h-2 rounded-full bg-neutral-800">
      <div className={`h-full rounded-full ${value >= bar ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      <div className="absolute -top-1 h-4 w-px bg-neutral-300" style={{ left: `${(bar / max) * 100}%` }} />
      <span className="absolute top-3 -translate-x-1/2 text-[10px] text-neutral-400" style={{ left: `${(bar / max) * 100}%` }}>your bar {bar}%</span>
    </div>
  );
}

function KillPicker({ onPick, onCancel }: { onPick: (r: string) => void; onCancel: () => void }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11.5px] text-neutral-500">Why kill it? The reason is kept.</p>
      <Chips options={KILL_REASONS.map((r) => ({ id: r, label: r }))} onPick={onPick} />
      <button onClick={onCancel} className="mt-2 text-[12px] text-neutral-500 hover:text-neutral-300">Cancel</button>
    </div>
  );
}

function KanSays({ text }: { text: string }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-lg bg-neutral-950/60 px-3 py-2 text-[12px] leading-snug text-neutral-400">
      <KanthinkIcon size={14} className="mt-px flex-shrink-0 text-violet-400" />
      <span>{text}</span>
    </p>
  );
}

function BuildCard({ sim, item, onAnswer, onOpenTake }: { sim: Sim; item: Extract<Item, { kind: 'build' }>; onAnswer: (a: Answer) => void; onOpenTake: (id: string) => void }) {
  const t = takeById(item.takeId);
  const st = sim.takes[item.takeId];
  const r = st.result!;
  const [killing, setKilling] = useState(false);
  const rec = recommend(sim, item) as Extract<Answer, { kind: 'build' }>;
  const small = r.visits < 80;
  const recText = rec.choice === 'build'
    ? `Build it. ${r.taps} people reserved without an app existing — that’s ${r.taps} launch-day customers at ${t.priceLabel}.`
    : rec.choice === 'again'
      ? `Another week. ${small ? `${r.visits} visits is too few to read.` : 'It’s close to your bar.'} One more round costs about ${money((st.chips * sim.mandate.budget) / 10 + 1)}.`
      : `Kill it. ${(r.rate * 100).toFixed(1)}% is well under your bar${st.weeks ? ' after two rounds' : ''}. The ${st.reserved} who reserved get a kind note.`;

  return (
    <Shell kind="Build it?" agent="analyst" ring="ring-amber-500/25" right={<button onClick={() => onOpenTake(t.id)} className="text-neutral-500 hover:text-neutral-300">open take</button>}>
      <h3 className="text-[17px] font-semibold leading-snug text-neutral-50">{t.app}: the practice round is in</h3>
      <p className="mt-1 text-[12.5px] text-neutral-500">{t.title}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-neutral-950/60 py-2"><p className="text-[18px] font-semibold tabular-nums text-neutral-100">{r.visits}</p><p className="text-[10.5px] text-neutral-500">visits</p></div>
        <div className="rounded-lg bg-neutral-950/60 py-2"><p className="text-[18px] font-semibold tabular-nums text-neutral-100">{r.taps}</p><p className="text-[10.5px] text-neutral-500">reserved at {t.priceLabel}</p></div>
        <div className="rounded-lg bg-neutral-950/60 py-2"><p className={`text-[18px] font-semibold tabular-nums ${r.cleared ? 'text-emerald-300' : 'text-amber-300'}`}>{(r.rate * 100).toFixed(1)}%</p><p className="text-[10.5px] text-neutral-500">reserve rate</p></div>
      </div>
      <div className="mb-5 mt-3 px-1"><Bar value={r.rate * 100} bar={sim.mandate.bar} /></div>

      <div className="flex items-center justify-between gap-3 text-[11.5px] text-neutral-500">
        <span>Reserve rate by day</span>
        <Spark values={st.series.map((p) => p.rate * 100)} tone="amber" width={120} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-neutral-500">
        <span>Spent so far {money(st.spent)}</span>
        {st.call && <span>Your call: {CALLS.find((c) => c.id === st.call)!.label.toLowerCase()}</span>}
        {small && <span className="text-amber-300/80">Small sample</span>}
      </div>

      <KanSays text={recText} />

      {killing ? (
        <KillPicker onPick={(reason) => onAnswer({ kind: 'build', choice: 'kill', reason })} onCancel={() => setKilling(false)} />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn kind="primary" onClick={() => onAnswer({ kind: 'build', choice: 'build' })}>Build it</Btn>
          <Btn onClick={() => onAnswer({ kind: 'build', choice: 'again' })}>Another week</Btn>
          <Btn kind="quiet" onClick={() => setKilling(true)}>Kill</Btn>
        </div>
      )}
      <Why>
        Building is where the real spend starts — about $8 of model time and the builder’s queue. The test told you whether people reach for their wallet when the app doesn’t exist yet. You set the bar at {sim.mandate.bar}% in your mandate; this is the first of two times a take needs you.
      </Why>
    </Shell>
  );
}

function ShipCard({ sim, item, onAnswer }: { sim: Sim; item: Extract<Item, { kind: 'ship' }>; onAnswer: (a: Answer) => void }) {
  const t = takeById(item.takeId);
  const st = sim.takes[item.takeId];
  const [mode, setMode] = useState<'idle' | 'back' | 'kill'>('idle');
  const [note, setNote] = useState(t.qa.open);
  const [tried, setTried] = useState(false);

  return (
    <Shell kind="Ship it?" agent="judge" ring="ring-cyan-500/25" right={<span className="text-neutral-500">built in {t.truth.buildDays} days</span>}>
      <h3 className="text-[17px] font-semibold leading-snug text-neutral-50">{t.app} is built and checked</h3>
      <p className="mt-1 text-[12.5px] text-neutral-500">{t.does}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[170px_1fr]">
        <button onClick={() => setTried(true)} className="group mx-auto w-[170px] text-left">
          <div className="rounded-[22px] border border-neutral-700 bg-neutral-950 p-2 shadow-xl shadow-black/50">
            <div className="rounded-[16px] bg-gradient-to-b from-neutral-100 to-neutral-200 p-3 text-neutral-900">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500">{t.app}</p>
              <p className="mt-1 text-[12px] font-semibold leading-tight">{t.preview.header}</p>
              <div className="mt-2 space-y-1.5">
                {t.preview.rows.map((row) => <p key={row} className="rounded-md bg-white px-1.5 py-1 text-[9.5px] leading-tight text-neutral-700 shadow-sm">{row}</p>)}
              </div>
              <p className="mt-2.5 rounded-md bg-neutral-900 py-1.5 text-center text-[10px] font-medium text-white">{t.preview.cta}</p>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-neutral-500 group-hover:text-neutral-300">{tried ? 'You tried it ✓' : 'Tap to try it (1 min)'}</p>
        </button>

        <div className="space-y-3 text-[12.5px]">
          <div>
            <p className="text-[11px] text-neutral-500">Play tester fixed</p>
            <ul className="mt-1 space-y-1">{t.qa.fixed.map((f) => <li key={f} className="text-neutral-300"><span className="text-emerald-400">✓</span> {f}</li>)}</ul>
          </div>
          <div>
            <p className="text-[11px] text-neutral-500">Still open</p>
            <p className="mt-1 text-amber-200/90">{t.qa.open}</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <div>
              <p className="text-[11px] text-neutral-500">Judge: keeps the take’s promise</p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-neutral-100">{Math.round(t.promise * 100)}%</p>
            </div>
            <div>
              <p className="text-[11px] text-neutral-500">Launch price</p>
              <p className="mt-0.5 text-[15px] font-semibold text-neutral-100">{t.priceLabel}</p>
            </div>
            <div>
              <p className="text-[11px] text-neutral-500">Waiting for it</p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-neutral-100">{st.reserved}</p>
            </div>
          </div>
        </div>
      </div>

      <KanSays text={`Ship it. The open note is real but small, and ${st.reserved} ${st.reserved === 1 ? 'person is' : 'people are'} waiting at ${t.priceLabel}. Checkout, the directory listing and the launch note are ready to go the moment you say so.`} />

      {mode === 'kill' ? (
        <KillPicker onPick={(reason) => onAnswer({ kind: 'ship', choice: 'kill', reason })} onCancel={() => setMode('idle')} />
      ) : mode === 'back' ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[11.5px] text-neutral-500">What should change? The builder reads this as the brief.</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[13px] text-neutral-200 focus:border-neutral-600 focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <Btn kind="primary" onClick={() => onAnswer({ kind: 'ship', choice: 'back', note })}>Send it back</Btn>
            <Btn kind="quiet" onClick={() => setMode('idle')}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn kind="primary" onClick={() => onAnswer({ kind: 'ship', choice: 'ship' })}>Ship at {t.priceLabel}</Btn>
          <Btn onClick={() => setMode('back')}>Send back</Btn>
          <Btn kind="quiet" onClick={() => setMode('kill')}>Kill</Btn>
        </div>
      )}
      <Why>
        This is the second and last time a take needs you. Agents tested it and judged it; only you can say whether it’s something you’d put your name on. Shipping publishes it with checkout and a directory page — nothing goes to a person until the launch note, which asks separately until you trust it.
      </Why>
    </Shell>
  );
}

function OutwardCard({ sim, item, onAnswer }: { sim: Sim; item: Extract<Item, { kind: 'outward' }>; onAnswer: (a: Answer) => void }) {
  const t = takeById(item.takeId);
  const [draft, setDraft] = useState(item.draft);
  const [declining, setDeclining] = useState(false);
  const agent = OUTWARD_AGENT[item.out];
  const edited = draft.trim() !== item.draft.trim();
  const where = item.out === 'launchmail' ? `${item.count} ${item.count === 1 ? 'person' : 'people'} who reserved` : t.where;

  return (
    <Shell kind="Goes outside" agent={agent} ring="ring-fuchsia-500/25" right={<span className="text-neutral-500">to {where}</span>}>
      <h3 className="text-[16px] font-semibold leading-snug text-neutral-50">{OUTWARD_LABEL[item.out]}</h3>
      <p className="mt-1 text-[12.5px] text-neutral-500">{t.app} · {t.title}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        className="mt-3 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[13px] leading-relaxed text-neutral-200 focus:border-neutral-600 focus:outline-none"
      />
      <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-neutral-500">
        {item.out === 'testpost' && <span>Test pages get most of their visits from this post.</span>}
        {item.out === 'launchmail' && <span>The people most likely to buy are the ones who already reserved.</span>}
        {item.out === 'launchpost' && <span>Back where the take came from.</span>}
        {edited && <span className="text-amber-300">edited — next drafts start from yours</span>}
      </div>
      {declining ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11.5px] text-neutral-500">Why not? It becomes a rule.</p>
          <Chips options={DECLINE_REASONS.map((r) => ({ id: r, label: r }))} onPick={(reason) => onAnswer({ kind: 'outward', choice: 'decline', reason })} />
          <button onClick={() => setDeclining(false)} className="mt-2 text-[12px] text-neutral-500 hover:text-neutral-300">Cancel</button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Btn kind="primary" onClick={() => onAnswer({ kind: 'outward', choice: 'send', draft })}>{item.out === 'launchmail' ? `Send to ${item.count}` : 'Post it'}</Btn>
          <Btn onClick={() => setDeclining(true)}>Not this</Btn>
        </div>
      )}
      <Why>
        Anything that reaches a person waits for you until you trust {crewById(agent).name.toLowerCase()} with this kind of thing. Two approvals you don’t change, and it offers to stop asking — for this kind only. {sim.trust[item.out] ? '' : 'One decline puts it back.'}
      </Why>
    </Shell>
  );
}

function TrustCard({ item, onAnswer }: { item: Extract<Item, { kind: 'trust' }>; onAnswer: (a: Answer) => void }) {
  const agent = OUTWARD_AGENT[item.out];
  return (
    <Shell kind="Trust" agent={agent}>
      <h3 className="text-[16px] font-semibold leading-snug text-neutral-50">{crewById(agent).name} is two for two, unchanged.</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
        Let it {OUTWARD_LABEL[item.out].toLowerCase()} without asking? It follows every rule you’ve given it, it tells you each time in the overnight note, and one decline puts it back to asking.
      </p>
      <div className="mt-4 flex gap-2">
        <Btn kind="violet" onClick={() => onAnswer({ kind: 'trust', yes: true })}>Yes, for this kind</Btn>
        <Btn onClick={() => onAnswer({ kind: 'trust', yes: false })}>Keep asking</Btn>
      </div>
    </Shell>
  );
}

function AllocateCard({ sim, onAnswer }: { sim: Sim; onAnswer: (a: Answer) => void }) {
  const held = Object.values(sim.takes).filter(holdsChips);
  const [chips, setChips] = useState<Record<string, number>>(() => Object.fromEntries(held.map((t) => [t.id, t.chips])));
  const used = Object.values(chips).reduce((a, b) => a + b, 0);
  const spare = TOTAL_CHIPS - used;
  const plan = ledgerPlan(sim);
  const cv = sim.mandate.budget / TOTAL_CHIPS;
  const losing = held.filter((t) => t.stage === 'live' && sim.day - (t.liveSince ?? sim.day) >= 7 && t.earned < t.spent);

  return (
    <Shell kind="Monday chips" agent="ledger" ring="ring-neutral-500/30" right={<span className="text-neutral-500">1 chip = {money(cv)} a week</span>}>
      <h3 className="text-[16px] font-semibold leading-snug text-neutral-50">Spread this week’s {TOTAL_CHIPS} chips</h3>
      <p className="mt-1 text-[12.5px] leading-snug text-neutral-500">Chips are reach: ads behind a test page or a live app. Builds don’t need them.</p>
      <ul className="mt-4 divide-y divide-neutral-800/70">
        {held.map((st) => {
          const t = takeById(st.id);
          const n = chips[st.id] ?? 0;
          const series = st.stage === 'practice' ? st.series.map((p) => p.rate * 100) : st.series.map((p) => p.net);
          return (
            <li key={st.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate text-[13px] text-neutral-200">{t.app}</span><StagePill stage={st.stage} /></div>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {st.stage === 'live' ? `${money(st.earned)} earned · ${money(st.spent)} spent` : st.stage === 'practice' ? `${(rate(st) * 100).toFixed(1)}% reserving so far` : 'Holding chips for launch'}
                  {plan[st.id] !== undefined && plan[st.id] !== n && <span className="text-neutral-600"> · ledger says {plan[st.id]}</span>}
                </p>
              </div>
              <Spark values={series} tone={st.stage === 'practice' ? 'amber' : 'auto'} width={60} />
              <div className="flex items-center gap-1">
                <button onClick={() => setChips((c) => ({ ...c, [st.id]: Math.max(0, n - 1) }))} className="h-7 w-7 rounded-full border border-neutral-700 text-neutral-400 hover:border-neutral-500">−</button>
                <span className="w-6 text-center text-[14px] font-semibold tabular-nums text-neutral-100">{n}</span>
                <button disabled={spare <= 0} onClick={() => setChips((c) => ({ ...c, [st.id]: n + 1 }))} className="h-7 w-7 rounded-full border border-neutral-700 text-neutral-400 hover:border-neutral-500 disabled:opacity-30">+</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: TOTAL_CHIPS }).map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < used ? 'bg-violet-400' : 'bg-neutral-800'}`} />)}
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500">{spare} spare {spare === 1 ? 'chip' : 'chips'} — spare chips sit in the bank, unspent.</p>
      {losing.length > 0 && <KanSays text={`Bench ${losing.map((t) => takeById(t.id).app).join(' and ')}: a week live, spending more than it earns. It stays up, just without ads.`} />}
      <div className="mt-4 flex flex-wrap gap-2">
        <Btn kind="primary" onClick={() => onAnswer({ kind: 'allocate', chips })}>Lock in</Btn>
        <Btn onClick={() => setChips(plan)}>Use the ledger’s plan</Btn>
      </div>
      <Why>
        This is your resource allocation, once a week. The ledger shows what each chip has earned and suggests a split, but where the money goes is a CEO call. You also decide your budget — it’s ${sim.mandate.budget} a week in your mandate.
      </Why>
    </Shell>
  );
}

function DirectionCard({ item, onAnswer }: { item: Extract<Item, { kind: 'direction' }>; onAnswer: (a: Answer) => void }) {
  const dir = DIRECTIONS.find((d) => d.id === item.dirId)!;
  return (
    <Shell kind="Direction" agent={dir.id === 'dig' ? 'demand' : dir.id === 'monthly' ? 'pricer' : 'ledger'}>
      <h3 className="text-[17px] font-semibold leading-snug text-neutral-50">{dir.question}</h3>
      <div className="mt-4 space-y-2">
        {dir.options.map((o) => (
          <button key={o.id} onClick={() => onAnswer({ kind: 'direction', option: o.id })} className="block w-full rounded-xl border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-left transition-colors hover:border-violet-500/60 hover:bg-violet-500/5">
            <p className="text-[14px] font-medium text-neutral-100">{o.label}</p>
            <p className="mt-0.5 text-[12px] text-neutral-500">{o.note}</p>
          </button>
        ))}
      </div>
      <Why>{dir.why}</Why>
    </Shell>
  );
}

