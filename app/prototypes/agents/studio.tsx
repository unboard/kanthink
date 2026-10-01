'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { AUDIENCES, DEFAULT_MANDATE, OFF_LIMITS, dayLabel, type Audience, type Mandate } from './data';
import { createSim, start, nextDay, type Sim } from './sim';
import { Today } from './today';
import { Apps } from './apps';
import { Button, Sheet, THEME } from './ui';

/**
 * The studio as a daily tool: open it in the morning, make a few calls, leave.
 * Two screens — Today (the calls) and Apps (how the bets are doing). Settings
 * and "how it works" are sheets you open when you want them.
 */

type Tab = 'today' | 'apps';

export function Studio() {
  const [sim, setSim] = useState<Sim>(() => createSim(DEFAULT_MANDATE));
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<'settings' | 'how' | null>(null);
  const waiting = sim.items.length;

  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const tomorrow = () => { setSim(nextDay); go('today'); };

  return (
    <div style={THEME} className="min-h-screen bg-(--paper) text-(--ink) antialiased">
      <div className="mx-auto max-w-[640px] px-5 pb-24 sm:px-8">
        <header className="flex items-center gap-3 py-5">
          <KanthinkIcon size={28} className="text-(--cobalt)" />
          <span className="text-[17px] font-semibold">Studio</span>
          {sim.started && (
            <nav className="ml-auto flex items-center gap-1 rounded-full bg-(--card) p-1 ring-1 ring-(--line)" aria-label="Studio">
              {(['today', 'apps'] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-current={tab === t ? 'page' : undefined}
                  onClick={() => go(t)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-medium transition ${tab === t ? 'bg-(--ink) text-white' : 'text-(--soft) hover:text-(--ink)'}`}
                >
                  {t === 'today' ? 'Today' : 'Apps'}
                  {t === 'today' && waiting > 0 && (
                    <span className={`min-w-5 rounded-full px-1.5 text-[13px] tabular-nums ${tab === t ? 'bg-white text-(--ink)' : 'bg-(--cobalt) text-white'}`}>{waiting}</span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </header>

        <main className="pt-6">
          {!sim.started ? (
            <Setup onStart={(m) => setSim((s) => start(s, m))} />
          ) : tab === 'today' ? (
            <>
              <p className="mb-5 text-[15px] text-(--soft)">{dayLabel(sim.day, true)}</p>
              <Today key={sim.day} sim={sim} setSim={setSim} onNextDay={tomorrow} onApps={() => go('apps')} />
            </>
          ) : (
            <Apps sim={sim} setSim={setSim} />
          )}
        </main>

        <footer className="mt-24 border-t border-(--line) pt-6 text-[15px] leading-[1.6] text-(--soft)">
          <p>This is a prototype. Days are simulated, and every take is an example of what scouts would find.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            <button type="button" onClick={() => setSheet('how')} className="text-(--ink) underline-offset-4 hover:underline">How it works</button>
            {sim.started && <button type="button" onClick={() => setSheet('settings')} className="text-(--ink) underline-offset-4 hover:underline">Settings</button>}
            {sim.started && <button type="button" onClick={tomorrow} className="text-(--ink) underline-offset-4 hover:underline">Skip to tomorrow</button>}
            {sim.started && <button type="button" onClick={() => { setSim(createSim(DEFAULT_MANDATE)); go('today'); }} className="text-(--ink) underline-offset-4 hover:underline">Start over</button>}
            <Link href="/prototypes" className="text-(--ink) underline-offset-4 hover:underline">All prototypes</Link>
          </div>
        </footer>
      </div>

      {sheet === 'how' && <HowItWorks onClose={() => setSheet(null)} />}
      {sheet === 'settings' && (
        <Sheet title="Settings" onClose={() => setSheet(null)}>
          <Settings value={sim.mandate} onChange={(m) => setSim((s) => ({ ...s, mandate: m }))} />
          {sim.rules.length > 0 && (
            <>
              <h3 className="mt-8 text-[17px] font-semibold">What Kan has learned from you</h3>
              <ul className="mt-3 space-y-2 text-[16px] leading-[1.5] text-(--soft)">
                {sim.rules.map((r, n) => <li key={n}>{r.text}</li>)}
              </ul>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

// ── First run: three questions, one at a time ──

function Choice({ on, onClick, title, note }: { on: boolean; onClick: () => void; title: string; note?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-[20px] px-5 py-4 text-left transition focus-visible:outline-2 focus-visible:outline-(--cobalt) ${on ? 'bg-(--wash) ring-2 ring-(--cobalt)' : 'bg-(--card) ring-1 ring-(--line) hover:ring-(--faint)'}`}
    >
      <span className="flex-1">
        <span className="block text-[18px] font-medium text-(--ink)">{title}</span>
        {note && <span className="mt-0.5 block text-[15px] text-(--soft)">{note}</span>}
      </span>
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[14px] ${on ? 'bg-(--cobalt) text-white' : 'ring-1 ring-(--line)'}`}>{on ? '✓' : ''}</span>
    </button>
  );
}

function Setup({ onStart }: { onStart: (m: Mandate) => void }) {
  const [m, setM] = useState<Mandate>(DEFAULT_MANDATE);
  const [step, setStep] = useState(0);
  const toggle = (a: Audience) => setM((x) => ({ ...x, audiences: x.audiences.includes(a) ? x.audiences.filter((y) => y !== a) : [...x.audiences, a] }));

  const steps = [
    {
      title: 'Who do you want to make things for?',
      body: 'Scouts look for people in these groups who are asking for something and would pay for it.',
      ok: m.audiences.length > 0,
      choices: AUDIENCES.map((a) => <Choice key={a.id} on={m.audiences.includes(a.id)} onClick={() => toggle(a.id)} title={a.label} note={a.note} />),
    },
    {
      title: 'How much can the crew spend each week?',
      body: 'It pays for ads behind tests and the AI time to build. The crew stops when it hits the limit.',
      ok: true,
      choices: ([25, 50, 100] as const).map((b) => <Choice key={b} on={m.budget === b} onClick={() => setM({ ...m, budget: b })} title={`$${b} a week`} note={b === 50 ? 'Enough to test three or four ideas at once' : b === 25 ? 'One or two tests at a time' : 'Faster answers, more at once'} />),
    },
    {
      title: 'When is something worth building?',
      body: 'Every idea gets a test page first. People can reserve it at the launch price. Nobody pays until it exists.',
      ok: true,
      choices: ([2, 3, 5] as const).map((b) => <Choice key={b} on={m.bar === b} onClick={() => setM({ ...m, bar: b })} title={`When ${b} in 100 visitors reserve it`} note={b === 2 ? 'Build more, and drop more later' : b === 3 ? 'Kan’s suggestion' : 'Build less, and only sure things'} />),
    },
  ];
  const s = steps[step];

  return (
    <div>
      <p className="text-[15px] font-medium text-(--cobalt)">{step === 0 ? 'Before the first morning' : `${step + 1} of 3`}</p>
      <h1 className="mt-3 text-[36px] font-semibold leading-[1.08] tracking-[-0.025em] [text-wrap:balance] sm:text-[44px]">{s.title}</h1>
      <p className="mt-4 max-w-[52ch] text-[18px] leading-[1.55] text-(--soft)">{s.body}</p>
      <div className="mt-8 space-y-3">{s.choices}</div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {step < 2
          ? <Button kind="decide" disabled={!s.ok} onClick={() => setStep(step + 1)}>Next</Button>
          : <Button kind="decide" onClick={() => onStart(m)}>Start the first morning</Button>}
        {step > 0 && <Button kind="quiet" onClick={() => setStep(step - 1)}>Back</Button>}
      </div>
      {step === 0 && (
        <p className="mt-10 max-w-[52ch] text-[15px] leading-[1.6] text-(--soft)">
          Three questions now, then about two minutes each morning. You can change any of this later in Settings.
        </p>
      )}
    </div>
  );
}

// ── Settings: the same choices, plus the quieter ones ──

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="py-4">
      <p className="text-[16px] font-medium">{label}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} className={`rounded-full px-4 py-2 text-[15px] transition ${value === o.id ? 'bg-(--ink) text-white' : 'bg-(--card) text-(--ink) ring-1 ring-(--line) hover:ring-(--faint)'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2 text-[16px] leading-[1.45]">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 flex-shrink-0 accent-(--cobalt)" />
      <span>{children}</span>
    </label>
  );
}

function Settings({ value, onChange }: { value: Mandate; onChange: (m: Mandate) => void }) {
  const set = <K extends keyof Mandate>(k: K, v: Mandate[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="divide-y divide-(--line)">
      <div className="pb-4">
        <p className="text-[16px] font-medium">Who you make things for</p>
        <div className="mt-1">
          {AUDIENCES.map((a) => (
            <Check key={a.id} on={value.audiences.includes(a.id)} onChange={(on) => set('audiences', on ? [...value.audiences, a.id] : value.audiences.filter((x) => x !== a.id))}>{a.label}</Check>
          ))}
        </div>
      </div>
      <Segmented label="Weekly budget" value={value.budget} options={[{ id: 25, label: '$25' }, { id: 50, label: '$50' }, { id: 100, label: '$100' }]} onChange={(v) => set('budget', v)} />
      <Segmented label="Build when this many in 100 reserve" value={value.bar} options={[{ id: 2, label: '2' }, { id: 3, label: '3' }, { id: 5, label: '5' }]} onChange={(v) => set('bar', v)} />
      <Segmented label="Where test visitors come from" value={value.traffic} options={[{ id: 'both', label: 'Ads and posts' }, { id: 'ads', label: 'Ads only' }, { id: 'posts', label: 'Posts only' }]} onChange={(v) => set('traffic', v)} />
      <div className="py-4">
        <p className="text-[16px] font-medium">Never make</p>
        <div className="mt-1">
          {OFF_LIMITS.map((o) => (
            <Check key={o.id} on={value.offLimits.includes(o.id)} onChange={(on) => set('offLimits', on ? [...value.offLimits, o.id] : value.offLimits.filter((x) => x !== o.id))}>{o.label}</Check>
          ))}
        </div>
      </div>
      <div className="pt-4">
        <Check on={value.shadow} onChange={(v) => set('shadow', v)}>Run a $3 test on ideas I pass on, so my no gets checked too</Check>
        <Check on={value.shelf} onChange={(v) => set('shelf', v)}>Mention what I already have when it’s close to a new idea</Check>
      </div>
    </div>
  );
}

// ── How it works ──

const STEPS: [string, string][] = [
  ['Scouts find people asking for something.', 'They read public posts and reviews for a chore someone would pay to lose. Your own data isn’t the source.'],
  ['You say how sure you are.', 'Pass, not sure, yes or strong yes. About fifteen seconds an idea.'],
  ['A yes gets a test page.', 'Five days, with the price and a Reserve button. Nobody is charged, and nothing is built yet.'],
  ['You decide whether to build it.', 'Only when enough people reserve it.'],
  ['The crew builds it and tests it.', 'A tester uses it like a customer would and sends back what breaks.'],
  ['You try it and ship it.', 'About a minute.'],
  ['The crew sells it.', 'Checkout, a listing, and a note to everyone who reserved. Anything sent to people asks you first, until you tell Kan to stop asking.'],
  ['On Mondays you split the budget.', 'Between tests and the apps that are selling.'],
];

function HowItWorks({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="How it works" onClose={onClose}>
      <ol className="space-y-5">
        {STEPS.map(([h, b], n) => (
          <li key={h} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="pt-0.5 text-[17px] font-semibold tabular-nums text-(--faint)">{n + 1}</span>
            <div>
              <p className="text-[17px] font-medium leading-[1.4]">{h}</p>
              <p className="mt-1 text-[16px] leading-[1.5] text-(--soft)">{b}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-[16px] leading-[1.55] text-(--soft)">
        Every call you make is scored by what happens next. The better your record, the more say your gut gets in what the scouts look for.
      </p>
    </Sheet>
  );
}
