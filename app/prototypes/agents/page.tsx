'use client';

import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { Desk } from './desk';

/**
 * Agents that make money — the desk, plus the reasoning behind it.
 *
 * Starts from one question, "how does this help Dustin make money?", and
 * answers it from the account rather than from what agents are fashionable for.
 */

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-neutral-400 [&_b]:font-medium [&_b]:text-neutral-100">{children}</div>
    </section>
  );
}

function Rows({ rows, width = 92 }: { rows: [string, string][]; width?: number }) {
  return (
    <div className="space-y-3">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-3" style={{ gridTemplateColumns: `${width}px 1fr` }}>
          <span className="text-[16px] font-semibold tabular-nums leading-snug text-neutral-100">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

const EVIDENCE: [string, string][] = [
  ['$0', 'in app sales, ever. The till exists — app prices, Stripe checkout, a purchases ledger, refunds — and has never rung.'],
  ['2', 'people wrote that they wanted to pay. One in Cat Math (“It’s free and I want to pay”), one in Logo Maker. Neither got a payment link.'],
  ['98', 'views across 8 public apps. Super Selfie has the most (25) and is free. Logo Maker ($10) has 16, Cat Math ($5) has 15.'],
  ['37', 'apps started in September. Building is not the bottleneck — you make more than one a day.'],
  ['4', 'MyCreativeShop motion videos published. The best has 13 views, all from links you sent by hand.'],
  ['7×', 'you asked Kan how print orders did. MCS is the business that already has customers, and there isn’t an agent in it.'],
  ['Aug 18', 'the last time anything landed in MCS Affiliate Strategy or MCS White Label Pipeline.'],
  ['7', 'Kanthink accounts, all free. Kanthink subscriptions aren’t where this month’s money is.'],
];

const FUNNEL: [string, string][] = [
  ['Make', 'Strong. An app a day, a motion video in an afternoon, Claude Code clearing the Work queue.'],
  ['Be seen', 'Weak. 98 views total, nearly all from links you shared yourself. Nothing goes where people already scroll.'],
  ['Be wanted', 'Proven, barely. Two people asked to pay without being asked.'],
  ['Get paid', 'Missing. Nobody answered either of them with a price.'],
  ['Learn', 'Impossible so far — there is no sale to learn from.'],
];

const ROLES: { name: string; dot: string; makes: string; body: string }[] = [
  {
    name: 'Listeners', dot: 'bg-sky-400', makes: 'signals',
    body: 'Hear money moving and say so, never act. A person in an app who says “pay”. A day of print orders that drifts. A thread you read that has a buyer in it. Jev does the hearing — it’s a judgement, fast and cheap — and nothing else happens until a doer picks it up.',
  },
  {
    name: 'Learners', dot: 'bg-amber-400', makes: 'beliefs',
    body: 'Turn outcomes into notes with a count behind them: what sold, at what price, after which reply. And your taste — every decline that had a reason, every rewrite of a draft. Every other agent reads these before it drafts, so you correct a thing once.',
  },
  {
    name: 'Doers', dot: 'bg-emerald-400', makes: 'drafts and builds',
    body: 'Act freely inside Kanthink — build a draft version, queue a card for Claude Code, write the reply. The moment something would reach a person or change what the public sees, it stops and waits for you.',
  },
  {
    name: 'Promoters', dot: 'bg-fuchsia-400', makes: 'reach',
    body: 'Take what you made to where people are: cuts of the MCS videos, directory listings, a note to the five people who use Cat Math when the thing they asked for exists. Everything they do is outward, so every promoter starts at “ask”.',
  },
];

const RULES: [string, string][] = [
  ['Outward waits.', 'Anything that reaches a person or the public needs your yes until you’ve trusted that agent with that kind of thing. Inside Kanthink, agents just work.'],
  ['Trust is earned per kind.', 'A run of approvals you didn’t change and the agent offers to stop asking — for that kind of action only, and it still tells you. One decline puts it back. Two in a row in the demo; more in real life.'],
  ['A no needs a reason.', 'A decline is one tap on a reason, and the reason becomes a rule everyone follows. This is how shrooms already learn: only from rejections with a reason.'],
  ['Every agent has a budget and a ledger.', 'Weekly model spend, stopped at the cap. Spent against earned, so an agent that costs money and makes none is visible, and gets benched.'],
  ['Kan never acts mid-sentence.', 'September’s worst moments were Kan acting too early. Agents propose; the desk is where you decide, in seconds, when you choose to look.'],
];

const PARTS: [string, string][] = [
  ['An agent', 'A shroom with a role, a budget, a trust level and a ledger line. Triggers, steps, safeguards and loop prevention already exist.'],
  ['Listeners', 'Event triggers on app_messages and app views, the Mixpanel data source, kanwatch_reads. Jev Noul for “is this a buyer?”'],
  ['Learners', 'The shroom rejection log, app_purchases, view_count. One new event: paywall seen.'],
  ['Doers', 'The build shroom, appPricing and appRelease, the Work channel and /kan.'],
  ['Promoters', 'scripts/motion and Cloudinary, the app directory and thumbnails, Customer.IO.'],
  ['The desk', 'New. A table of proposed actions (agent, draft, outward, value, decision, reason) and attribution: a sale credits the action just before it.'],
];

const STEPS: { title: string; body: string }[] = [
  { title: 'Answer the two buyers', body: 'Pay signals + Closer, and nothing else. Jev reads every app message for “wants to pay”; Closer drafts a reply with the payment link; you tap send from a notification. Two people are already waiting, so this can make the first sale the week it ships.' },
  { title: 'Print orders every morning', body: 'A scheduled listener on the Mixpanel source you already connected. Seven asks in September become zero, and it’s the first agent inside the business that earns today.' },
  { title: 'The desk', body: 'Proposals, decisions, reasons and the ledger in one place, so every new agent plugs into the same yes / no instead of growing its own notifications.' },
  { title: 'Clips for MCS', body: 'A weekly vertical cut of each motion video with a caption that follows the MCS rules, held for your yes. MCS has the customers; this is reach for the thing that already sells.' },
  { title: 'What sells, then the trust ladder', body: 'Paywall-seen events so the learner has a funnel, then trust offers once there are enough approvals to mean something.' },
];

const NOT: [string, string][] = [
  ['More apps', 'You don’t need a faster factory. You need the next person who says “pay” to be answered the same day.'],
  ['Agents that post as you on day one', 'Every promoter starts at ask. The prototype shows how one earns its way out of that.'],
  ['An agent marketplace or a builder for agents', 'A fixed crew of twelve with plain jobs. Adding a thirteenth is a shroom, not a product.'],
  ['Chasing Kanthink subscriptions now', 'Seven accounts. Use agents to sell what MCS and your apps already offer; Kanthink revenue follows if the desk works for you first.'],
];

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 md:px-8">
        <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">← Prototypes</Link>
        <div className="mt-4 flex items-center gap-3">
          <KanthinkIcon size={26} className="text-violet-400" />
          <h1 className="text-2xl font-semibold tracking-tight">A crew that earns</h1>
        </div>
        <p className="mt-4 max-w-3xl text-[20px] leading-snug text-neutral-100">
          You already make things faster than anyone sees them. The crew’s job is the rest: hear who wants to pay, answer them, take your work to where people are, and learn from every sale. You decide in seconds, from one desk.
        </p>
        <p className="mt-3 max-w-3xl text-[13px] text-neutral-500">
          Run the day below. Items marked “from your account” are real as of Oct 1; “example” items show what an agent would plausibly find. Approve, rewrite or decline — the day changes with you.
        </p>

        <div className="mt-8">
          <Desk />
        </div>

        <div className="mx-auto mt-16 max-w-2xl">
          <Note title="The question">
            <p><b>How does this help Dustin make money?</b> From first principles, money arrives when something you made is <b>seen</b> by someone who <b>wants</b> it, and they’re <b>asked to pay</b> — minus the hours it took you. Agents are only worth having if they move one of those without costing you the hours back.</p>
            <Rows rows={FUNNEL} />
            <p>So the crew is built for the bottom of that list. Making is already handled.</p>
          </Note>

          <Note title="What the account shows">
            <Rows rows={EVIDENCE} />
          </Note>

          <Note title="Four jobs, defined by what they produce">
            <div className="space-y-4">
              {ROLES.map((r) => (
                <div key={r.name}>
                  <p className="flex items-center gap-2 text-[15px] font-medium text-neutral-100">
                    <span className={`h-2 w-2 rounded-full ${r.dot}`} />{r.name}
                    <span className="text-[12px] font-normal text-neutral-500">produce {r.makes}</span>
                  </p>
                  <p className="mt-1">{r.body}</p>
                </div>
              ))}
            </div>
            <p>Only doers and promoters can change anything, and only promoters face outward by default. That split is what lets listeners and learners run all day for pennies without any risk.</p>
          </Note>

          <Note title="The rules">
            {RULES.map(([h, body]) => <p key={h}><b>{h}</b> {body}</p>)}
          </Note>

          <Note title="What it’s made of">
            <div className="overflow-hidden rounded-xl border border-neutral-800">
              {PARTS.map(([from, to], n) => (
                <div key={from} className={`grid grid-cols-[30%_1fr] gap-3 px-4 py-2.5 text-[13px] ${n % 2 ? 'bg-neutral-900/40' : ''}`}>
                  <span className="text-neutral-200">{from}</span>
                  <span className="text-neutral-400">{to}</span>
                </div>
              ))}
            </div>
            <p>Most of the crew is parts that ship today, given a job and a budget. The new pieces are the desk and attribution.</p>
          </Note>

          <Note title="How we get there">
            <p>Five steps, each useful alone, ordered by how soon they can earn.</p>
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

          <Note title="What I wouldn’t build">
            <Rows rows={NOT} width={150} />
          </Note>
        </div>
      </div>
    </div>
  );
}
