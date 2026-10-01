'use client';

import { useState } from 'react';
import {
  AUDIENCES, CALLS, CREW, OFF_LIMITS, STAGES, KILL_REASONS, takeById, dayLabel,
  type Mandate, type Stage,
} from './data';
import { holdsChips, killTake, net, rate, takeReturn, yourRecord, gutWeight, OUTWARD_AGENT, type Sim, type TakeState } from './sim';
import { AgentTag, Btn, CallPill, Chips, Spark, StagePill, money, pct } from './ui';

type SetSim = (fn: (s: Sim) => Sim) => void;

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-baseline justify-between gap-3 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{children}</h3>
      {right && <span className="text-[11px] text-neutral-600">{right}</span>}
    </div>
  );
}

// ── Portfolio ──

function ReturnFigure({ sim, st }: { sim: Sim; st: TakeState }) {
  const r = takeReturn(sim, st);
  if (!r) {
    if (st.stage !== 'practice') return null;
    return <p className="text-[12px] text-neutral-500">Collecting visits</p>;
  }
  return (
    <div className="text-right">
      <p className={`text-[20px] font-semibold tabular-nums tracking-tight ${r.pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pct(r.pct)}</p>
      <p className="text-[10px] text-neutral-500">{r.simulated ? 'practice · simulated' : 'since inception'}</p>
    </div>
  );
}

function Position({ sim, st, onOpen }: { sim: Sim; st: TakeState; onOpen: () => void }) {
  const t = takeById(st.id);
  const practice = st.stage === 'practice';
  const values = practice ? st.series.map((p) => p.rate * 100) : st.series.map((p) => p.net);
  return (
    <button onClick={onOpen} className={`flex w-full flex-col rounded-2xl border bg-neutral-900/50 p-4 text-left transition-colors hover:border-neutral-600 ${practice ? 'border-dashed border-neutral-700' : 'border-neutral-800'}`}>
      <div className="flex w-full items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StagePill stage={st.stage} waiting={st.waiting} />
            <CallPill call={st.call} by={st.callBy} />
          </div>
          <p className="mt-2 text-[15px] font-semibold text-neutral-100">{t.app}</p>
        </div>
        <ReturnFigure sim={sim} st={st} />
      </div>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-neutral-400">{t.title}</p>
      <div className="mt-auto flex w-full items-end justify-between gap-3 pt-3">
        <div className="text-[11px] tabular-nums text-neutral-500">
          {st.stage === 'live' && <p>{st.sales} sold · {money(st.earned)} in · {money(st.spent)} out</p>}
          {practice && <p>{st.testVisits} visits · {st.taps} reserved · {(rate(st) * 100).toFixed(1)}%</p>}
          {(st.stage === 'building' || st.stage === 'checking') && <p>{st.reserved} waiting · {money(st.spent)} spent</p>}
          <p>{st.chips} {st.chips === 1 ? 'chip' : 'chips'} · since {dayLabel(st.found).split(',')[0]}</p>
        </div>
        <Spark values={values} tone={practice ? 'amber' : 'auto'} dashed={practice} />
      </div>
    </button>
  );
}

function Row({ st, onOpen, note }: { st: TakeState; onOpen: () => void; note?: React.ReactNode }) {
  const t = takeById(st.id);
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-neutral-900">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-neutral-200">{t.app}</span>
          <StagePill stage={st.stage} />
          <CallPill call={st.call} by={st.callBy} />
        </div>
        <p className="mt-0.5 truncate text-[11.5px] text-neutral-500">{note ?? t.title}</p>
      </div>
    </button>
  );
}

export function CallRecordCard({ sim }: { sim: Sim }) {
  const mine = yourRecord(sim, 'you');
  const kan = yourRecord(sim, 'kan');
  const resolved = sim.calls.slice().reverse();
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] text-neutral-500">Your calls</p>
          <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-neutral-100">
            {mine.total ? `${mine.right} of ${mine.total} right` : 'Not scored yet'}
          </p>
          {kan.total > 0 && <p className="text-[11.5px] text-neutral-500">Kan’s calls, when you handed it the day: {kan.right} of {kan.total}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] text-neutral-500">Kan weighs your gut at</p>
          <p className="mt-0.5 text-[22px] font-semibold tabular-nums text-violet-300">{gutWeight(sim)}%</p>
          <p className="text-[11px] text-neutral-500">against Jev, when ranking takes</p>
        </div>
      </div>
      {resolved.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-neutral-800 pt-3">
          {resolved.slice(0, 8).map((c) => (
            <li key={`${c.takeId}-${c.how}`} className="flex items-center gap-2 text-[12px]">
              <span className={c.right ? 'text-emerald-400' : 'text-rose-400'}>{c.right ? '✓' : '✗'}</span>
              <span className="text-neutral-300">{takeById(c.takeId).app}</span>
              <span className="text-neutral-500">{c.by === 'kan' ? 'Kan' : 'you'} said {CALLS.find((x) => x.id === c.call)!.label.toLowerCase()}</span>
              <span className="ml-auto text-[11px] text-neutral-600">{c.how === 'shadow' ? 'shadow test' : 'practice round'}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-neutral-800 pt-3 text-[12px] text-neutral-500">A call is scored when its practice round finishes, or when a pass is shadow-tested — about five days after you make it.</p>
      )}
    </div>
  );
}

export function Portfolio({ sim, onOpen }: { sim: Sim; onOpen: (id: string) => void }) {
  const all = Object.values(sim.takes);
  const by = (stages: Stage[]) => all.filter((t) => stages.includes(t.stage));
  const live = by(['live']).sort((a, b) => net(b) - net(a));
  const works = by(['practice', 'building', 'checking']);
  const asking = by(['asking']);
  const watch = by(['watch', 'passed']);
  const closed = by(['killed', 'skipped']);

  if (!all.length) {
    return <p className="px-4 py-16 text-center text-[13px] text-neutral-500">No takes yet. Set the mandate on Today and the scouts start reading.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl px-3 py-5 sm:px-4">
      <CallRecordCard sim={sim} />

      {live.length > 0 && <>
        <SectionTitle right="real money, simulated here">Live</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">{live.map((st) => <Position key={st.id} sim={sim} st={st} onOpen={() => onOpen(st.id)} />)}</div>
      </>}

      {works.length > 0 && <>
        <SectionTitle right="practice takes show simulated results; nobody is charged">In the works</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">{works.map((st) => <Position key={st.id} sim={sim} st={st} onOpen={() => onOpen(st.id)} />)}</div>
      </>}

      {asking.length > 0 && <>
        <SectionTitle>Waiting for your call</SectionTitle>
        {asking.map((st) => <Row key={st.id} st={st} onOpen={() => onOpen(st.id)} />)}
      </>}

      {watch.length > 0 && <>
        <SectionTitle right="passes get a $3 shadow test, so your no is scored too">Passed &amp; watching</SectionTitle>
        {watch.map((st) => (
          <Row key={st.id} st={st} onOpen={() => onOpen(st.id)} note={
            st.shadow
              ? <span>Shadow test: {st.shadow.taps} of {st.shadow.visits} reserved — <span className={st.shadow.cleared ? 'text-amber-300' : 'text-emerald-300'}>{st.shadow.cleared ? 'cleared your bar' : 'you were right'}</span></span>
              : st.shadowDue ? `Shadow test reads ${dayLabel(st.shadowDue).split(',')[0]}` : undefined
          } />
        ))}
      </>}

      {closed.length > 0 && <>
        <SectionTitle>Closed</SectionTitle>
        {closed.map((st) => <Row key={st.id} st={st} onOpen={() => onOpen(st.id)} note={st.closedReason ? `${st.stage === 'skipped' ? 'Skipped' : 'Killed'}: ${st.closedReason}${st.earned ? ` · earned ${money(st.earned)}` : ''}` : undefined} />)}
      </>}
    </div>
  );
}

// ── The line: the pipeline as a board ──

const LINE: ({ kind: 'col'; id: string; name: string; stages: Stage[]; agents: string[] } | { kind: 'gate'; id: string; name: string; item: 'build' | 'ship' })[] = [
  { kind: 'col', id: 'scouted', name: 'Scouted', stages: ['asking', 'watch'], agents: ['demand', 'reviews', 'trends', 'analyst'] },
  { kind: 'col', id: 'practice', name: 'Practice', stages: ['practice'], agents: ['testpage', 'reach'] },
  { kind: 'gate', id: 'g-build', name: 'Build?', item: 'build' },
  { kind: 'col', id: 'build', name: 'Build', stages: ['building'], agents: ['spec', 'builder'] },
  { kind: 'col', id: 'check', name: 'Check', stages: ['checking'], agents: ['tester', 'judge'] },
  { kind: 'gate', id: 'g-ship', name: 'Ship?', item: 'ship' },
  { kind: 'col', id: 'live', name: 'Live', stages: ['live'], agents: ['pricer', 'lister', 'mailer', 'poster'] },
];

export function Line({ sim, onOpen }: { sim: Sim; onOpen: (id: string) => void }) {
  const all = Object.values(sim.takes);
  return (
    <div className="py-5">
      <p className="mx-auto mb-4 max-w-4xl px-4 text-[12.5px] leading-relaxed text-neutral-500">
        The same takes as a board. Agents move cards between columns; the two violet gates are the only places a take stops for you. In the real build this is a Kanthink channel, and the agents are shrooms.
      </p>
      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
        {LINE.map((c) => {
          if (c.kind === 'gate') {
            const waiting = sim.items.filter((i) => i.kind === c.item).length;
            return (
              <div key={c.id} className="relative w-14 flex-shrink-0">
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-violet-500/60 via-violet-500/20 to-transparent" />
                <div className={`relative mt-14 flex flex-col items-center rounded-xl border px-1.5 py-2 text-center ${waiting ? 'border-violet-400 bg-violet-500/20' : 'border-violet-500/30 bg-neutral-950'}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-300">You</span>
                  <span className="mt-0.5 text-[11px] text-violet-100">{c.name}</span>
                  {waiting > 0 && <span className="mt-1 rounded-full bg-violet-400 px-1.5 text-[10px] font-semibold text-neutral-950">{waiting}</span>}
                </div>
              </div>
            );
          }
          const cards = all.filter((t) => c.stages.includes(t.stage));
          return (
            <div key={c.id} className="w-[200px] flex-shrink-0 rounded-xl bg-neutral-900/40 p-2">
              <div className="flex items-center justify-between px-1.5 pb-1">
                <span className="text-[12.5px] font-medium text-neutral-200">{c.name}</span>
                <span className="text-[11px] tabular-nums text-neutral-600">{cards.length}</span>
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-0.5 px-1.5 pb-2">
                {c.agents.map((a) => <AgentTag key={a} id={a} />)}
              </div>
              <div className="space-y-1.5">
                {cards.map((st) => {
                  const t = takeById(st.id);
                  return (
                    <button key={st.id} onClick={() => onOpen(st.id)} className={`block w-full rounded-lg border bg-neutral-950 p-2.5 text-left hover:border-neutral-600 ${st.waiting || st.stage === 'asking' ? 'border-violet-500/40' : 'border-neutral-800'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium text-neutral-100">{t.app}</span>
                        {st.stage === 'watch' && <span className="text-[10px] text-neutral-500">watching</span>}
                        {(st.waiting || st.stage === 'asking') && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutral-500">{t.title}</p>
                      <p className="mt-1.5 text-[10.5px] tabular-nums text-neutral-400">
                        {st.stage === 'practice' && `Day ${st.daysIn} of 5 · ${st.taps} reserved`}
                        {st.stage === 'building' && `Day ${st.daysIn} of ${t.truth.buildDays}`}
                        {st.stage === 'checking' && (st.waiting ? 'Checked — waiting on you' : 'Play tester on it')}
                        {st.stage === 'live' && `${money(st.earned)} earned · ${st.sales} sold`}
                        {st.stage === 'asking' && 'Your call'}
                        {st.stage === 'watch' && (st.shadow ? `Shadow: ${st.shadow.taps}/${st.shadow.visits}` : 'Shadow test running')}
                      </p>
                    </button>
                  );
                })}
                {!cards.length && <p className="px-1.5 py-3 text-[11px] text-neutral-700">Empty</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Crew ──

export function CrewView({ sim, setSim }: { sim: Sim; setSim: SetSim }) {
  const [open, setOpen] = useState<string | null>(null);
  const runs = (id: string) => sim.events.filter((e) => e.agent === id).length;
  const trustKind = (id: string) => (Object.entries(OUTWARD_AGENT).find(([, a]) => a === id)?.[0] as keyof Sim['trust'] | undefined);

  return (
    <div className="mx-auto max-w-4xl px-3 py-5 sm:px-4">
      <p className="mb-5 text-[12.5px] leading-relaxed text-neutral-500">
        Seventeen agents, one line. Each is a shroom with a job, a weekly budget and a ledger line. Most of them are parts Kanthink already ships, given a job. Agent time this month: <span className="text-neutral-300">{Math.round(sim.agentMinutes / 60)} hours</span>.
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        {STAGES.map((stage) => (
          <div key={stage.id}>
            <p className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${stage.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />{stage.name}
            </p>
            <div className="space-y-1.5">
              {CREW.filter((c) => c.stage === stage.id).map((c) => {
                const isOpen = open === c.id;
                const tk = trustKind(c.id);
                return (
                  <div key={c.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40">
                    <button onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-neutral-100">{c.name}</p>
                        <p className={`mt-0.5 text-[12px] leading-snug text-neutral-500 ${isOpen ? '' : 'line-clamp-1'}`}>{c.job}</p>
                      </div>
                      <div className="flex-shrink-0 text-right text-[10.5px] text-neutral-500">
                        <p className="tabular-nums">{runs(c.id)} runs</p>
                        {tk && <p className={sim.trust[tk] ? 'text-neutral-400' : 'text-violet-300'}>{sim.trust[tk] ? 'acts, tells you' : 'asks'}</p>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="grid gap-2 border-t border-neutral-800 px-3 py-2.5 text-[11.5px] sm:grid-cols-2">
                        <div><p className="text-neutral-500">Does alone</p><p className="text-neutral-300">{c.alone}</p></div>
                        <div><p className="text-neutral-500">Needs your yes</p><p className="text-neutral-300">{c.needsYes}</p></div>
                        <div><p className="text-neutral-500">Built from</p><p className="text-neutral-300">{c.builtFrom}</p></div>
                        <div><p className="text-neutral-500">Budget</p><p className="text-neutral-300">{c.budget ? `$${c.budget} a week of model time, then it stops itself` : 'No model spend'}</p></div>
                        {tk && (
                          <div className="sm:col-span-2">
                            <p className="text-neutral-500">Trust</p>
                            <div className="mt-1 flex gap-1.5">
                              <button onClick={() => setSim((s) => ({ ...s, trust: { ...s.trust, [tk]: false } }))} className={`rounded-md px-2 py-1 text-[11px] ${!sim.trust[tk] ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40' : 'bg-neutral-800 text-neutral-400'}`}>Asks every time</button>
                              <button onClick={() => setSim((s) => ({ ...s, trust: { ...s.trust, [tk]: true } }))} className={`rounded-md px-2 py-1 text-[11px] ${sim.trust[tk] ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40' : 'bg-neutral-800 text-neutral-400'}`}>Acts, then tells you</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mandate ──

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5">
      <p className="text-[13px] font-medium text-neutral-200">{label}</p>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-neutral-700">
      {options.map((o, n) => (
        <button key={String(o.id)} onClick={() => onChange(o.id)} className={`px-3 py-1.5 text-[12.5px] ${n ? 'border-l border-neutral-700' : ''} ${value === o.id ? 'bg-violet-500/20 text-violet-100' : 'text-neutral-400 hover:bg-neutral-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Multi({ value, options, onChange }: { value: string[]; options: { id: string; label: string }[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} className={`rounded-full border px-2.5 py-1 text-[12px] ${on ? 'border-violet-400/60 bg-violet-500/15 text-violet-100' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
            {on ? '✓ ' : ''}{o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex items-center gap-2.5 text-left text-[12.5px] text-neutral-300">
      <span className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-violet-500' : 'bg-neutral-700'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  );
}

export function MandateForm({ value, onChange }: { value: Mandate; onChange: (m: Mandate) => void }) {
  const set = <K extends keyof Mandate>(k: K, v: Mandate[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="divide-y divide-neutral-800/70">
      <Field label="Who do you want to sell to?" hint="Scouts read public demand for these customers. Anything outside comes back marked as outside, and only when they run dry.">
        <Multi value={value.audiences} options={AUDIENCES.map((a) => ({ id: a.id, label: a.label }))} onChange={(v) => set('audiences', v as Mandate['audiences'])} />
      </Field>
      <Field label="Weekly budget" hint="Ads behind tests and live apps, plus model time. Agents stop themselves at the cap.">
        <Seg value={value.budget} options={[{ id: 25, label: '$25' }, { id: 50, label: '$50' }, { id: 100, label: '$100' }]} onChange={(v) => set('budget', v)} />
      </Field>
      <Field label="Your time" hint="How long the daily check-in may take. Kan orders it so the important calls come first.">
        <Seg value={value.minutes} options={[{ id: 2, label: '2 min a day' }, { id: 5, label: '5 min' }, { id: 10, label: '10 min' }]} onChange={(v) => set('minutes', v)} />
      </Field>
      <Field label="Where test traffic comes from" hint="Posts go where the demand was found and get far more visits than a small ad budget — but each one asks you first until you trust it.">
        <Seg value={value.traffic} options={[{ id: 'ads', label: 'Ads only' }, { id: 'posts', label: 'Posts only' }, { id: 'both', label: 'Both' }]} onChange={(v) => set('traffic', v)} />
      </Field>
      <Field label="Build when this many test visitors reserve" hint="Reserving saves their email and the launch price. Nobody is charged for something that doesn’t exist.">
        <Seg value={value.bar} options={[{ id: 2, label: '2%' }, { id: 3, label: '3%' }, { id: 5, label: '5%' }]} onChange={(v) => set('bar', v)} />
      </Field>
      <Field label="Off limits">
        <Multi value={value.offLimits} options={OFF_LIMITS} onChange={(v) => set('offLimits', v)} />
      </Field>
      <div className="space-y-3 py-3.5">
        <Toggle on={value.shadow} onChange={(v) => set('shadow', v)} label="Shadow-test my passes for $3 each, so my no gets scored too" />
        <Toggle on={value.shelf} onChange={(v) => set('shelf', v)} label="Use what I already own as a tiebreaker (never as a source)" />
      </div>
    </div>
  );
}

export function MandateView({ sim, setSim }: { sim: Sim; setSim: SetSim }) {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-3 py-5 sm:px-4 md:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <p className="text-[12.5px] leading-relaxed text-neutral-500">The standing orders. Set once; change any time — changes apply from tomorrow’s scouting.</p>
        <MandateForm value={sim.mandate} onChange={(m) => setSim((s) => ({ ...s, mandate: m }))} />
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Learned from you</p>
          {sim.rules.length ? (
            <ul className="mt-2 space-y-2 text-[12.5px] leading-snug text-neutral-300">
              {sim.rules.map((r, n) => <li key={n}><span className="text-neutral-600">{dayLabel(r.day).split(',')[0]} · </span>{r.text}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">Nothing yet. Every no with a reason, every direction you pick, and every draft you rewrite lands here — and every agent reads it before it acts.</p>
          )}
        </div>
        <CallRecordCard sim={sim} />
      </div>
    </div>
  );
}

// ── One take, in full ──

export function TakeSheet({ sim, setSim, id, onClose }: { sim: Sim; setSim: SetSim; id: string; onClose: () => void }) {
  const t = takeById(id);
  const st = sim.takes[id];
  const [killing, setKilling] = useState(false);
  if (!st) return null;
  const events = sim.events.filter((e) => e.takeId === id).slice().reverse();
  const aud = AUDIENCES.find((a) => a.id === t.audience)!;
  const r = takeReturn(sim, st);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto border-l border-neutral-800 bg-[#0e0e0e] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5"><StagePill stage={st.stage} waiting={st.waiting} /><CallPill call={st.call} by={st.callBy} /></div>
          <button onClick={onClose} className="text-[13px] text-neutral-500 hover:text-neutral-200">Close</button>
        </div>
        <h2 className="mt-3 text-[18px] font-semibold leading-snug text-neutral-50">{t.title}</h2>
        <p className="mt-1 text-[11.5px] text-neutral-500">{aud.label} · found by <AgentTag id={t.scout} /> on {dayLabel(st.found)}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-neutral-400">{t.thesis}</p>

        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="flex items-baseline justify-between"><p className="text-[14px] font-medium text-neutral-100">{t.app}</p><p className="text-[12.5px] text-neutral-300">{t.priceLabel}</p></div>
          <p className="mt-0.5 text-[12px] text-neutral-400">{t.does}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['Spent', money(st.spent)],
            ['Earned', money(st.earned)],
            [r ? (r.simulated ? 'Simulated' : 'Return') : 'Reserved', r ? pct(r.pct) : String(st.reserved)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-neutral-900/60 py-2">
              <p className="text-[15px] font-semibold tabular-nums text-neutral-100">{v}</p>
              <p className="text-[10.5px] text-neutral-500">{k}</p>
            </div>
          ))}
        </div>
        {(st.testVisits > 0 || st.visits > 0) && (
          <p className="mt-2 text-[11.5px] tabular-nums text-neutral-500">
            Test page: {st.testVisits} visits, {st.taps} reserved ({(rate(st) * 100).toFixed(1)}%){st.stage === 'live' || st.liveSince ? ` · Live: ${st.visits - st.testVisits} visits, ${st.sales} sold` : ''}{st.chips ? ` · ${st.chips} chips` : ''}
          </p>
        )}
        {st.shadow && <p className="mt-2 text-[11.5px] text-neutral-500">Shadow test: {st.shadow.taps} of {st.shadow.visits} reserved — {st.shadow.cleared ? 'cleared your bar' : 'under your bar'}.</p>}
        {st.closedReason && <p className="mt-2 text-[11.5px] text-neutral-500">{st.stage === 'skipped' ? 'Skipped' : 'Closed'}: {st.closedReason}</p>}

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Evidence</p>
        <ul className="mt-2 space-y-2">
          {t.evidence.map((e) => (
            <li key={e.source} className="border-l-2 border-neutral-700 pl-3"><p className="text-[12.5px] text-neutral-300">{e.quote}</p><p className="text-[11px] text-neutral-500">{e.source}</p></li>
          ))}
        </ul>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Timeline</p>
        <ol className="mt-2">
          {events.map((e, n) => (
            <li key={n} className="relative border-l border-neutral-800 py-1.5 pl-4">
              <span className="absolute -left-[3.5px] top-3 h-[6px] w-[6px] rounded-full bg-neutral-600" />
              <p className="text-[10.5px] text-neutral-500">{dayLabel(e.day).split(',')[0]} · <AgentTag id={e.agent} /></p>
              <p className={`text-[12px] leading-snug ${e.earn ? 'text-emerald-300' : e.tone === 'you' ? 'text-violet-200' : 'text-neutral-300'}`}>{e.text}</p>
            </li>
          ))}
        </ol>

        {holdsChips(st) && (
          <div className="mt-5 border-t border-neutral-800 pt-4">
            {killing ? (
              <>
                <p className="mb-1.5 text-[11.5px] text-neutral-500">Why kill it?</p>
                <Chips options={KILL_REASONS.map((x) => ({ id: x, label: x }))} onPick={(reason) => { setSim((s) => killTake(s, id, reason)); setKilling(false); }} />
              </>
            ) : (
              <Btn kind="quiet" onClick={() => setKilling(true)}>Kill this take</Btn>
            )}
          </div>
        )}
        {net(st) !== 0 && <p className="mt-4 text-[11px] text-neutral-600">Net so far {money(net(st))}. Numbers are simulated.</p>}
      </aside>
    </div>
  );
}
