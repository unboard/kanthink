'use client';

import { useState } from 'react';
import { CALLS, KILL_REASONS, takeById, dayLabel } from './data';
import { holdsChips, killTake, rate, yourRecord, gutWeight, type Sim, type TakeState } from './sim';
import { Button, Reasons, Sheet, Trend, money } from './ui';

type SetSim = (fn: (s: Sim) => Sim) => void;

/** One plain sentence about where a take stands, from your side of the table. */
function status(sim: Sim, st: TakeState) {
  const t = takeById(st.id);
  switch (st.stage) {
    case 'live': return `${st.sales} sold at ${t.priceLabel}`;
    case 'practice': return st.waiting ? 'Test finished. Waiting for you.' : `Testing, day ${st.daysIn} of 5. ${st.taps} reserved so far.`;
    case 'building': return `Being built. ${st.reserved} ${st.reserved === 1 ? 'person is' : 'people are'} waiting for it.`;
    case 'checking': return st.waiting ? 'Built and tested. Waiting for you.' : 'Being tested.';
    case 'asking': return 'Waiting for your call.';
    case 'watch':
    case 'passed':
      if (st.shadow) return st.shadow.cleared ? `You said no. A small test says people want it (${st.shadow.taps} of ${st.shadow.visits}).` : `You said no, and a small test agreed.`;
      return st.stage === 'watch' ? 'Parked. A small test will check your call.' : 'Passed.';
    case 'killed': return `Dropped: ${st.closedReason?.toLowerCase()}${st.earned ? `. Made ${money(st.earned)} first.` : '.'}`;
    case 'skipped': return `Skipped: ${st.closedReason}.`;
  }
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h3 className="text-[19px] font-semibold text-(--ink)">{title}</h3>
      <ul className="mt-3 divide-y divide-(--line) rounded-[20px] bg-(--card) ring-1 ring-(--line)">{children}</ul>
    </section>
  );
}

function Row({ sim, st, onOpen }: { sim: Sim; st: TakeState; onOpen: () => void }) {
  const t = takeById(st.id);
  const live = st.stage === 'live';
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-(--paper)/60 focus-visible:outline-2 focus-visible:outline-(--cobalt)">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-medium text-(--ink)">{t.app}</p>
          <p className="mt-0.5 text-[15px] leading-[1.45] text-(--soft)">{status(sim, st)}</p>
        </div>
        {live && <Trend values={st.series.map((p) => p.earned ?? 0)} />}
        {live && (
          <div className="text-right">
            <p className="text-[19px] font-semibold tabular-nums text-(--money)">{money(st.earned)}</p>
            <p className="text-[14px] tabular-nums text-(--soft)">cost {money(st.spent)}</p>
          </div>
        )}
        {(st.waiting || st.stage === 'asking') && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-(--cobalt)" aria-label="Waiting for you" />}
      </button>
    </li>
  );
}

export function Apps({ sim, setSim }: { sim: Sim; setSim: SetSim }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const all = Object.values(sim.takes);
  const of = (...stages: TakeState['stage'][]) => all.filter((t) => stages.includes(t.stage));
  const live = of('live').sort((a, b) => b.earned - a.earned);
  const making = of('practice', 'building', 'checking');
  const closed = of('watch', 'passed', 'killed', 'skipped');
  const earned = all.reduce((n, t) => n + t.earned, 0);
  const spent = all.reduce((n, t) => n + t.spent, 0);
  const record = yourRecord(sim);

  if (!all.length) {
    return <p className="pt-16 text-[19px] leading-[1.5] text-(--soft)">No apps yet. Your first takes arrive with the first check-in.</p>;
  }

  return (
    <div>
      <h2 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] text-(--ink) sm:text-[48px]">
        {earned ? <>{money(earned)} earned</> : 'Nothing earned yet'}
      </h2>
      <p className="mt-4 max-w-[48ch] text-[19px] leading-[1.5] text-(--soft)">
        {live.length ? `${live.length} ${live.length === 1 ? 'app is' : 'apps are'} selling. ` : ''}
        The crew has spent {money(spent)} on ads and model time{earned > spent ? `, so you’re ${money(earned - spent)} ahead.` : '.'}
      </p>

      <div className="mt-8 rounded-[20px] bg-(--card) px-5 py-4 ring-1 ring-(--line)">
        <p className="text-[17px] leading-[1.5] text-(--ink)">
          {record.total
            ? <>Your calls: <span className="font-semibold">{record.right} of {record.total} right.</span> Kan gives your gut {gutWeight(sim)}% of the say when it picks what to test next.</>
            : 'Your calls get scored about five days after you make them, by how the test does. Passes get a small $3 test too, so your no counts.'}
        </p>
      </div>

      {live.length > 0 && <Group title="Selling">{live.map((st) => <Row key={st.id} sim={sim} st={st} onOpen={() => setOpen(st.id)} />)}</Group>}
      {making.length > 0 && <Group title="On the way">{making.map((st) => <Row key={st.id} sim={sim} st={st} onOpen={() => setOpen(st.id)} />)}</Group>}
      {of('asking').length > 0 && <Group title="Waiting for your call">{of('asking').map((st) => <Row key={st.id} sim={sim} st={st} onOpen={() => setOpen(st.id)} />)}</Group>}

      {closed.length > 0 && (
        <div className="mt-12">
          <button type="button" onClick={() => setShowClosed(!showClosed)} className="text-[17px] text-(--soft) underline-offset-4 hover:text-(--ink) hover:underline">
            {showClosed ? 'Hide' : 'Show'} {closed.length} passed or dropped
          </button>
          {showClosed && <ul className="mt-3 divide-y divide-(--line) rounded-[20px] bg-(--card) ring-1 ring-(--line)">{closed.map((st) => <Row key={st.id} sim={sim} st={st} onOpen={() => setOpen(st.id)} />)}</ul>}
        </div>
      )}

      {open && <Detail sim={sim} setSim={setSim} id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Detail({ sim, setSim, id, onClose }: { sim: Sim; setSim: SetSim; id: string; onClose: () => void }) {
  const t = takeById(id);
  const st = sim.takes[id];
  const [dropping, setDropping] = useState(false);
  const story = sim.events.filter((e) => e.takeId === id);
  const call = CALLS.find((c) => c.id === st.call);
  const callWord = call ? { pass: 'passed', leanNo: 'weren’t sure', leanYes: 'said yes', strong: 'said strong yes' }[call.id] : null;

  return (
    <Sheet title={t.app} onClose={onClose}>
      <p className="text-[19px] font-medium leading-[1.4] text-(--ink)">{t.title}</p>
      <p className="mt-3 text-[16px] leading-[1.55] text-(--soft)">{t.does} {t.priceLabel}.</p>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        {[
          ['Earned', money(st.earned)],
          ['Cost', money(st.spent)],
          ['Reserved', `${st.taps}${st.testVisits ? ` of ${st.testVisits}` : ''}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[16px] bg-(--card) px-4 py-3 ring-1 ring-(--line)">
            <dt className="text-[14px] text-(--soft)">{k}</dt>
            <dd className="mt-0.5 text-[19px] font-semibold tabular-nums text-(--ink)">{v}</dd>
          </div>
        ))}
      </dl>
      {st.testVisits > 0 && <p className="mt-3 text-[15px] text-(--soft)">The test page converted {(rate(st) * 100).toFixed(1)}% of visitors into reservations. Your bar is {sim.mandate.bar}%.</p>}
      {callWord && <p className="mt-2 text-[15px] text-(--soft)">{st.callBy === 'kan' ? 'Kan made this call: it' : 'You'} {callWord} on {dayLabel(st.found)}.</p>}

      <h3 className="mt-8 text-[17px] font-semibold text-(--ink)">What happened</h3>
      <ol className="mt-3 space-y-3">
        {story.map((e, n) => (
          <li key={n} className="grid grid-cols-[72px_1fr] gap-3 text-[15px] leading-[1.5]">
            <span className="text-(--faint)">{dayLabel(e.day).replace(/,.*/, '')}</span>
            <span className={e.earn ? 'text-(--money)' : 'text-(--ink)'}>{e.text}</span>
          </li>
        ))}
      </ol>

      {holdsChips(st) && (
        <div className="mt-8 border-t border-(--line) pt-6">
          {dropping
            ? <Reasons prompt="Why drop it?" options={KILL_REASONS.map((x) => ({ id: x, label: x }))} onPick={(reason) => { setSim((s) => killTake(s, id, reason)); setDropping(false); onClose(); }} onCancel={() => setDropping(false)} />
            : <Button kind="quiet" onClick={() => setDropping(true)}>Drop this app</Button>}
        </div>
      )}
    </Sheet>
  );
}
