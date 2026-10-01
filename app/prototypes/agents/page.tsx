'use client';

import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { Studio } from './studio';

/**
 * Takes — a studio of agents that runs the whole line from "someone wants
 * this" to "they paid", run by you like a fund.
 *
 * Replaces "A crew that earns", which only sold what already existed. The
 * brief: agents identify, vet, build, vet, publish with payment and
 * distribute; you set direction and decide at a few key points. Direction
 * is borrowed from Supertake: a conviction becomes a portfolio with a return.
 */

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-neutral-400 [&_b]:font-medium [&_b]:text-neutral-100">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: [string, string, string?]; rows: [string, string, string?][] }) {
  const three = head.length === 3;
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800 text-[13px]">
      {head.some(Boolean) && (
        <div className={`grid gap-3 border-b border-neutral-800 bg-neutral-900/60 px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-500 ${three ? 'grid-cols-[28%_1fr_22%]' : 'grid-cols-[34%_1fr]'}`}>
          {head.map((h, n) => <span key={n}>{h}</span>)}
        </div>
      )}
      {rows.map((r, n) => (
        <div key={r[0]} className={`grid gap-3 px-4 py-2.5 ${three ? 'grid-cols-[28%_1fr_22%]' : 'grid-cols-[34%_1fr]'} ${n % 2 ? 'bg-neutral-900/30' : ''}`}>
          <span className="text-neutral-200">{r[0]}</span>
          <span className="text-neutral-400">{r[1]}</span>
          {three && <span className="text-neutral-500">{r[2]}</span>}
        </div>
      ))}
    </div>
  );
}

const LINE: { who: 'agents' | 'you'; name: string; body: string }[] = [
  { who: 'agents', name: 'Identify', body: 'Scouts read public demand: people describing a chore they’d pay to lose, bad reviews of paid tools, seasonal search. The analyst writes each find up as a take.' },
  { who: 'you', name: 'Your call', body: 'Pass, lean no, lean yes, strong yes. About 15 seconds a take, in the daily check-in.' },
  { who: 'agents', name: 'Vet: practice round', body: 'A test page with the price and a Reserve button, ads from the take’s chips, and a post where the demand was found. Five days. No app, nobody charged.' },
  { who: 'you', name: 'Build it?', body: 'The reserve rate against your bar. Build, another week, or kill.' },
  { who: 'agents', name: 'Build, then check', body: 'The spec writer turns the take into a brief, the builder builds it, the play tester plays it as the customer and sends back what breaks, and the judge scores it against the take’s promise.' },
  { who: 'you', name: 'Ship it?', body: 'You try it for a minute. Ship, send back with a note, or kill.' },
  { who: 'agents', name: 'Publish & sell', body: 'Price and checkout, directory listing, a launch note to everyone who reserved, a launch post back where it started. Anything outward asks until you trust it.' },
  { who: 'agents', name: 'Account', body: 'The ledger keeps spend against earnings per take. The calibrator scores your calls. On Mondays the chips are yours to move.' },
];

const SUPERTAKE: [string, string, string][] = [
  ['A take', 'A claim someone could be wrong about: “Volunteer coaches will pay to stop doing playing time by hand.”', 'thesis'],
  ['Conviction', 'Your call on it, from pass to strong yes. Strong backs it with more chips.', 'position size'],
  ['Practice take', 'Test page and reserve rate. Simulated return, clearly marked. Nobody is charged.', 'paper trade'],
  ['Live position', 'A shipped app with checkout. Real spend, real sales, a return since inception.', 'holding'],
  ['Chips', 'Ten a week. Reach for tests and live apps, moved by you on Mondays.', 'allocation'],
  ['Track record', 'Every call scored: yeses by their practice round, noes by a $3 shadow test.', 'performance'],
];

const YOU: [string, string, string][] = [
  ['Mandate', 'Who to sell to, budget, your time, test traffic, the build bar, off limits.', 'Once · 3 min'],
  ['Daily check-in', 'New takes to call, and the occasional direction question. Kan orders it so the big calls come first.', 'Daily · ~2 min'],
  ['Build it?', 'Practice results against your bar.', 'Per take · 25s'],
  ['Ship it?', 'Try the app, read the tester’s and judge’s notes.', 'Per app · 1 min'],
  ['Monday chips', 'Spread ten chips across tests and live apps. The ledger suggests a split.', 'Weekly · 40s'],
  ['Outward', 'Posts and launch notes, until you trust each kind.', 'Fades out'],
];

const HARD: [string, string][] = [
  ['Traffic', '$50 a week of ads buys around a hundred visits across every test. Five days needs about a hundred visits per take to tell 3% from 1%. What makes tests readable is a post in the thread where the demand was found. That post is outward, so it needs your yes until you trust it. Turn posts off in the mandate and most tests come back “too few to read”. The studio shows you that rather than hiding it.'],
  ['Honest tests', 'Practice pages never take money. “Reserve at the launch price” saves an email, and the launch mailer honours the price. A fake checkout that fails at the last step would be faster to read and is off the table.'],
  ['What agents can build', 'Single-file apps cover tools, generators, calculators and printables, and scouts favour takes in that shape. Anything that needs accounts, sync or a server goes to Claude Code, which is slower, and the mandate can rule it out.'],
  ['Quality', 'The tester catches broken; the judge catches off-promise. Neither catches “fine but forgettable”. That’s why shipping is your call, and why you try it first.'],
  ['Small numbers', 'In the simulation a good app earns tens of dollars a month. The bet is many cheap tests and a portfolio of long-tail earners that keep paying after you’ve moved on, not one hit. If that’s the wrong shape of money, say so before step 2.'],
];

const PARTS: [string, string][] = [
  ['Already ships', 'Shrooms (schedules, event triggers, safeguards, loop prevention, learning only from reasons). The build shroom and playground generator. /play publishing. appPricing, Stripe checkout, app_purchases. App directory and thumbnails. Customer.IO. Jev. Card threads as briefs. /kan with Claude Code.'],
  ['New', 'A takes table (thesis, evidence, call, stage, chips, ledger). Reserve mode on app pricing. A capped ad account and a posting identity for test traffic. A Playwright play tester. The calibrator and shadow tests. The check-in itself, as Kan’s home screen.'],
];

const STEPS: { title: string; body: string }[] = [
  { title: 'Takes and the daily check-in', body: 'Scouts and the analyst write takes from public demand; you call them in the app every morning. Useful on its own: a steady stream of argued ideas, and a record of your calls.' },
  { title: 'Practice rounds', body: 'A test page with Reserve, capped ads, a post held for your yes, and results into the build gate. This is the first real read on demand before any app code exists.' },
  { title: 'Build and check', body: 'The build shroom works from the take’s thread, the Playwright tester plays the result, the judge scores it, and the ship gate comes to you.' },
  { title: 'Sell', body: 'Pricer, lister, a launch note to people who reserved, and the poster on the trust ladder. This is where the first sale should land.' },
  { title: 'Close the loop', body: 'The ledger, Monday chips, calibration and shadow tests. From here the studio gets better at picking, and so do you.' },
];

const ASK: [string, string][] = [
  ['Test traffic', 'An ad account with a hard weekly cap, and a posting identity. Do agents post as you, as Kan, or as a studio name? This decides whether practice rounds can be read at all.'],
  ['Whose name is on the apps', 'Kanthink, a new studio brand, or each app standing alone. It changes the directory, the launch posts and what a refund email says.'],
  ['Budget', 'The simulation runs on $50 a week. Whatever the real number is, it’s the one cap every agent is held to.'],
];

export default function TakesPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 md:px-8">
        <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">← Prototypes</Link>
        <div className="mt-4 flex items-center gap-3">
          <KanthinkIcon size={26} className="text-violet-400" />
          <h1 className="text-2xl font-semibold tracking-tight">Takes</h1>
          <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-400">app studio, run like a fund</span>
        </div>
        <p className="mt-4 max-w-3xl text-[20px] leading-snug text-neutral-100">
          A crew of agents finds what people would pay for, tests it before anything is built, builds it, checks it, prices it and sells it. You run it like a fund: set a mandate once, spend two minutes a day on calls, and make two decisions per app.
        </p>
        <p className="mt-3 max-w-3xl text-[13px] text-neutral-500">
          Start it below and play a few days. Every take is an example of what scouts would plausibly find. How people respond is simulated with deliberately modest numbers, and your calls can be wrong. “Hand Kan a week” lets the agents answer for you, so you can compare their calls with yours.
        </p>

        <div className="mt-8">
          <Studio />
        </div>

        <div className="mx-auto mt-16 max-w-2xl">
          <Note title="What changed from the last version">
            <p>The last version answered a different question. It sold what you already had, built every agent on your account’s data, and argued against making more apps. <b>This one runs the whole line, from finding an idea to the sale.</b> Your account plays a small part, and your time is treated as the scarcest resource on the books, so agents bring you decisions rather than work.</p>
          </Note>

          <Note title="The line">
            <ol className="space-y-0">
              {LINE.map((s, n) => (
                <li key={s.name} className="grid grid-cols-[22px_1fr] gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`mt-1.5 h-3 w-3 flex-shrink-0 rounded-full ${s.who === 'you' ? 'bg-violet-400 ring-4 ring-violet-500/20' : 'border border-neutral-600 bg-neutral-900'}`} />
                    {n < LINE.length - 1 && <span className="w-px flex-1 bg-neutral-800" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-[14px] font-medium text-neutral-100">{s.name} <span className={`ml-1 text-[11px] font-normal ${s.who === 'you' ? 'text-violet-300' : 'text-neutral-500'}`}>{s.who === 'you' ? 'you' : 'agents'}</span></p>
                    <p className="mt-0.5 text-[13px]">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Note>

          <Note title="Borrowed from Supertake">
            <p>Supertake turns a conviction into a portfolio, tracks its return, and labels practice takes as simulated. Swap stocks for small apps and dollars for chips and your time, and it maps one-for-one:</p>
            <Table head={['Here', 'What it is', 'Investing']} rows={SUPERTAKE} />
            <p>What this adds is a scored gut. Every call is scored, <b>including the noes</b>: a pass gets a $3 shadow test, and if that test says you were wrong, the take comes back once for a second look. Your record decides how much Kan weighs your call against Jev’s read. It starts at 50/50 and moves with you.</p>
          </Note>

          <Note title="Where you come in">
            <Table head={['Touchpoint', 'What you decide', 'How often']} rows={YOU} />
            <p>In the simulation a month comes to <b>under twenty minutes of your time</b>. Nothing at a gate moves without you, and agents never guess: leave a take waiting and it waits, costing nothing.</p>
          </Note>

          <Note title="Your account’s place">
            <p>Scouts read <b>public demand</b>. Your account comes in at three points, all small. “Your shelf” notes the closest thing you already own as a tiebreaker. Your reasons for saying no become rules that filter what scouts bring. Rewrites of drafts become the house style. <b>Kanwatch is not an input</b>, and none of this changes what privacy.js allows.</p>
          </Note>

          <Note title="The hard parts">
            <div className="space-y-3">
              {HARD.map(([h, b]) => <p key={h}><b>{h}.</b> {b}</p>)}
            </div>
          </Note>

          <Note title="What it’s made of">
            <Table head={['', '']} rows={PARTS} />
          </Note>

          <Note title="How we get there">
            <p>Five steps, each useful on its own.</p>
            <ol className="mt-2 space-y-5">
              {STEPS.map((s, n) => (
                <li key={s.title} className="grid grid-cols-[28px_1fr] gap-2">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-700 text-[12px] text-neutral-300">{n + 1}</span>
                  <div>
                    <p className="text-[15px] font-medium text-neutral-100">{s.title}</p>
                    <p className="mt-1">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Note>

          <Note title="Three calls only you can make">
            <Table head={['', '']} rows={ASK} />
          </Note>
        </div>
      </div>
    </div>
  );
}
