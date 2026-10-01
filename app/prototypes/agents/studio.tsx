'use client';

import { useRef, useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { DEFAULT_MANDATE, dayLabel, type Mandate } from './data';
import { createSim, start, nextDay, playDays, type Sim } from './sim';
import { Today } from './today';
import { Portfolio, Line, CrewView, MandateView, MandateForm, TakeSheet } from './views';
import { Btn, Stat, duration, money } from './ui';

/**
 * The studio: what Kanthink would look like if a crew of agents ran the line
 * from "someone out there wants this" to "they paid", and you ran the crew.
 *
 * Today is the daily check-in — the one place you're needed. Portfolio is the
 * Supertake view: every take as a position with a return. The line is the same
 * takes as a board. Crew and Mandate are the standing orders.
 */

type Tab = 'today' | 'portfolio' | 'line' | 'crew' | 'mandate';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'line', label: 'The line' },
  { id: 'crew', label: 'Crew' },
  { id: 'mandate', label: 'Mandate' },
];

const LAST_DAY = 42;

export function Studio() {
  const [sim, setSim] = useState<Sim>(() => createSim(DEFAULT_MANDATE));
  const [tab, setTab] = useState<Tab>('today');
  const [openTake, setOpenTake] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const begin = (m: Mandate) => {
    setSim((s) => start(s, m));
    setTab('today');
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const takes = Object.values(sim.takes);
  const earned = takes.reduce((n, t) => n + t.earned, 0);
  const spent = takes.reduce((n, t) => n + t.spent, 0);
  const live = takes.filter((t) => t.stage === 'live').length;
  const waiting = sim.items.length;
  const done = sim.day >= LAST_DAY;

  const go = (fn: (s: Sim) => Sim) => setSim((s) => (s.day >= LAST_DAY ? s : fn(s)));

  return (
    <div ref={top} className="scroll-mt-4 overflow-hidden rounded-2xl border border-neutral-800 bg-[#0e0e0e] shadow-2xl shadow-black">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-violet-400" />
          <span className="text-[14px] font-semibold">Studio</span>
          <span className="text-[12px] text-neutral-500">{sim.started ? <>Day {sim.day} · <span className="text-neutral-300">{dayLabel(sim.day)}</span></> : 'Not started'}</span>
        </div>
        {sim.started && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <button
              disabled={done}
              onClick={() => go(nextDay)}
              className="rounded-full bg-violet-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-violet-400 disabled:opacity-40"
              title={waiting ? 'Anything you leave waits at its gate — agents don’t guess' : undefined}
            >
              Next day{waiting ? ` (${waiting} left waiting)` : ''}
            </button>
            <button disabled={done} onClick={() => go((s) => playDays(s, Math.min(7, LAST_DAY - s.day)))} className="rounded-full border border-neutral-700 px-3 py-1.5 text-[12px] text-neutral-300 hover:border-neutral-500 disabled:opacity-40" title="Kan answers everything on your behalf for a week, using its own recommendations">
              Hand Kan a week
            </button>
            <button onClick={() => { setSim(createSim(DEFAULT_MANDATE)); setTab('today'); setOpenTake(null); }} className="rounded-full border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-500 hover:border-neutral-600">
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Ledger */}
      {sim.started && (
        <div className="grid grid-cols-2 gap-2 border-b border-neutral-800 p-3 sm:grid-cols-5">
          <Stat label="Earned" value={money(earned)} sub="simulated sales" tone={earned ? 'text-emerald-300' : undefined} />
          <Stat label="Spent" value={money(spent)} sub="ads + model time" />
          <Stat label="Net" value={money(earned - spent)} sub={`${live} live ${live === 1 ? 'app' : 'apps'}`} tone={earned - spent >= 0 ? 'text-emerald-300' : 'text-rose-300'} />
          <Stat label="Your time" value={duration(sim.seconds)} sub={`over ${sim.day} ${sim.day === 1 ? 'day' : 'days'}`} tone="text-violet-200" />
          <Stat label="Agents’ time" value={`${Math.round(sim.agentMinutes / 60)}h`} sub="scouting, testing, building" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-3 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative whitespace-nowrap px-3 py-2.5 text-[12.5px] transition-colors ${tab === t.id ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'}`}
          >
            {t.label}
            {t.id === 'today' && waiting > 0 && <span className="ml-1.5 rounded-full bg-violet-500 px-1.5 py-px text-[10px] font-semibold text-white">{waiting}</span>}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-violet-400" />}
          </button>
        ))}
      </div>

      <div className="min-h-[560px]">
        {tab === 'today' && (sim.started
          ? done
            ? <Finished sim={sim} onPortfolio={() => setTab('portfolio')} />
            : <Today sim={sim} setSim={setSim} onOpenTake={setOpenTake} onNextDay={() => go(nextDay)} />
          : <Setup onStart={begin} />)}
        {tab === 'portfolio' && <Portfolio sim={sim} onOpen={setOpenTake} />}
        {tab === 'line' && <Line sim={sim} onOpen={setOpenTake} />}
        {tab === 'crew' && <CrewView sim={sim} setSim={setSim} />}
        {tab === 'mandate' && (sim.started ? <MandateView sim={sim} setSim={setSim} /> : <Setup onStart={begin} />)}
      </div>

      {openTake && <TakeSheet sim={sim} setSim={setSim} id={openTake} onClose={() => setOpenTake(null)} />}
    </div>
  );
}

function Setup({ onStart }: { onStart: (m: Mandate) => void }) {
  const [m, setM] = useState<Mandate>(DEFAULT_MANDATE);
  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <p className="text-[12px] text-neutral-500">Day zero · about 3 minutes, once</p>
      <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-neutral-50">Set the mandate</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
        This is the brief you give the crew as CEO: who to sell to, what to spend, how much of your day they can have, and what’s off limits. After this, they come to you — a few questions a day, and two decisions per app.
      </p>
      <div className="mt-2">
        <MandateForm value={m} onChange={setM} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Btn kind="violet" disabled={!m.audiences.length} onClick={() => onStart(m)}>Start the studio</Btn>
        <span className="text-[11.5px] text-neutral-500">Simulated: every take is an example of what scouts would find, and the world’s response is played out for you.</span>
      </div>
    </div>
  );
}

function Finished({ sim, onPortfolio }: { sim: Sim; onPortfolio: () => void }) {
  const takes = Object.values(sim.takes);
  const earned = takes.reduce((n, t) => n + t.earned, 0);
  const spent = takes.reduce((n, t) => n + t.spent, 0);
  const lastWeek = sim.events.filter((e) => e.day > sim.day - 8).reduce((n, e) => n + (e.earn ?? 0), 0);
  return (
    <div className="mx-auto max-w-xl px-4 py-12 text-center">
      <p className="text-[12px] text-neutral-500">Six weeks in</p>
      <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-neutral-50">{takes.filter((t) => t.stage === 'live').length} apps live, {money(earned)} earned, {money(spent)} spent</h2>
      <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-neutral-400">
        You gave it {duration(sim.seconds)}. The crew gave it {Math.round(sim.agentMinutes / 60)} hours. Last week alone earned {money(lastWeek)} — the line keeps paying for apps that are already live, which is the point of running it as a portfolio rather than a sprint.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Btn kind="violet" onClick={onPortfolio}>See the portfolio</Btn>
      </div>
    </div>
  );
}

