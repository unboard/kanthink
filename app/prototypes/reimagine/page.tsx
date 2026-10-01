'use client';

import { useState } from 'react';
import Link from 'next/link';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { Phone, type Overlay } from './phone';

/**
 * Kanthink, reimagined — from the account, not from the original pitch.
 *
 * The notes are the evidence (what the account shows), the vision it points
 * to, and the steps from today's app. One proposal, not a menu.
 */

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-neutral-400 [&_b]:font-medium [&_b]:text-neutral-100">{children}</div>
    </section>
  );
}

const EVIDENCE: [string, string][] = [
  ['171', 'conversations with Kan. 152 by voice — driving home, first thing in the morning, doing homework, fixing the fridge. In September a session averaged 300 of your words.'],
  ['37', 'apps started in September. 8 you kept building, 3 you published. 23 were first builds you never reopened.'],
  ['6 of 6', 'app notifications (feedback, a reply, a purchase) are still unread. You answered people from inside the app instead.'],
  ['141', 'things shared into Kan Bookmarks, 22 in the last 30 days, mostly agent and tool posts from X. About 100 have never left the Inbox.'],
  ['520', 'cards through the Work channel. It’s the one board that moves, and Claude Code moves it, not you.'],
  ['25 of 157', 'tasks done. 2 ever had a due date. 127 card moves in 90 days, across 32 channels.'],
  ['9 of 13', 'channels made since August got no new cards after day two. Of 33 shrooms, 30 are run-by-hand, and there’s no record of any of them running.'],
  ['7', 'separate times you asked Kan how print orders did today.'],
];

const BROKE: [string, string][] = [
  ['Sep 23', 'You started talking through your day. Kan made a to-do card mid-sentence and assigned it to Eric.'],
  ['Sep 11', 'You asked for a card in Work → Do these. It landed in Things to do → Eric. Twice.'],
  ['Sep 7 & 22', 'The call dropped after about five minutes of talking, and everything you said was lost.'],
  ['Sep 17', 'In your words: boards are “not very good at all for revisiting or finding something.”'],
];

const HOW: [string, string][] = [
  ['Kan never acts while you’re talking.', 'It catches. Each catch appears live under the conversation with where it would go. Nothing is created until you say keep, and you can move or drop any of them first.'],
  ['Every word is saved as you say it.', 'A dropped call picks up where it stopped. You never lose five minutes of talking again.'],
  ['The conversation is the record.', 'Each one says what landed from it. Plenty land nothing, and that’s fine. Any conversation can be handed to Claude Code as-is, which is what you already do.'],
  ['Home is only what comes back.', 'People who wrote in your apps, with a reply box. What Claude Code finished. What your saves add up to. The numbers you’d otherwise ask for. No tasks, no board, no count of things to clear.'],
  ['Apps get their own tab.', 'It’s what you make most. What’s out there, what you’re making, and the first builds you never went back to, folded out of the way.'],
  ['Channels become places Kan files into.', 'Library lists them by where things last landed, so the live ones rise and the ones you spun up for an idea fold away. You never process the list.'],
  ['Shrooms become things Kan does without asking.', 'You make one by saying “every morning, tell me print orders” in any conversation. It’s caught like anything else.'],
];

const MAPPING: [string, string][] = [
  ['Voice mode', 'The main button. Catches instead of acting.'],
  ['Operator chat history', 'Conversations in Library, each with what landed'],
  ['Board, columns, drag and drop', 'Still there inside a channel. Not the way in.'],
  ['Channel list, left nav', 'Places in Library, sorted by last landing'],
  ['Kan Bookmarks', '“What you saved” on Home, read for you'],
  ['Work → Do these', '“Claude Code” on Home: done and waiting'],
  ['App feedback notifications', '“People” on Home, and in each app, with reply'],
  ['Shrooms', '“Kan does without asking”, made by saying it'],
  ['Tasks', 'Unchanged, just not on Home'],
];

const STEPS: { title: string; body: string }[] = [
  { title: 'Catch, don’t act', body: 'Voice stops creating and moving cards mid-conversation. The tools queue catches instead, shown in a tray, kept on your say-so. Transcripts save as you talk and a dropped call resumes. This fixes every bad voice moment in September, and it ships inside today’s voice mode.' },
  { title: 'People first', body: 'App messages get a reply box wherever they appear, and a new one goes to the top of Home instead of into a notification list you don’t open.' },
  { title: 'The new Home', body: 'People, Claude Code, what you saved, last conversation — built from tables that already exist (app messages, the Work channel, Kan Bookmarks, operator threads). Ships as the new / with the old home one tap away.' },
  { title: 'Things Kan does without asking', body: 'A caught “every morning…” becomes a scheduled shroom. The first one is print orders from Mixpanel, which you’ve asked for seven times.' },
  { title: 'Library, and folding away', body: 'Conversations, places by last landing, and the channels that went quiet folded away — nothing deleted. The left nav leaves mobile once Library covers it.' },
];

export default function ReimaginePage() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [dropped, setDropped] = useState(false);
  const fire = (o: Overlay) => {
    setOverlay(o);
    if (window.innerWidth < 768) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const tryButtons = (
    <>
      <button onClick={() => fire('talk')} className="rounded-full border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-300 hover:border-neutral-600">Talk through your day</button>
      <button
        onClick={() => { if (overlay !== 'talk') fire('talk'); setDropped(true); setTimeout(() => setDropped(false), 2600); }}
        className="rounded-full border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-300 hover:border-neutral-600"
      >
        Drop the call
      </button>
      <button onClick={() => fire('share')} className="rounded-full border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-300 hover:border-neutral-600">Share a post in</button>
    </>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-neutral-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:items-start md:px-8 md:py-10">
        <div className="md:sticky md:top-10 md:w-[392px] md:flex-shrink-0">
          <div className="h-[100dvh] md:h-[820px] md:max-h-[calc(100vh-110px)] md:overflow-hidden md:rounded-[44px] md:border md:border-neutral-800 md:shadow-2xl md:shadow-black">
            <Phone overlay={overlay} setOverlay={setOverlay} dropped={dropped} />
          </div>
          <div className="mt-4 hidden flex-wrap justify-center gap-2 md:flex">{tryButtons}</div>
        </div>

        <article className="px-5 pb-20 md:max-w-xl md:px-0 md:pt-4">
          <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">← Prototypes</Link>
          <div className="mt-4 flex items-center gap-3">
            <KanthinkIcon size={26} className="text-violet-400" />
            <h1 className="text-2xl font-semibold tracking-tight">Kanthink, reimagined</h1>
          </div>
          <p className="mt-4 text-[20px] leading-snug text-neutral-100">
            Kanthink is where you think out loud. Kan listens, catches what matters, and files it only when you say so. What comes back is people, finished work, and what your saves add up to.
          </p>
          <p className="mt-3 text-[13px] text-neutral-500">Built from your account: every conversation, share, app, channel and shroom since January.</p>

          <div className="mt-5 flex flex-wrap gap-2 md:hidden">{tryButtons}</div>

          <div className="mt-10">
            <Note title="What your account shows">
              <div className="space-y-3">
                {EVIDENCE.map(([n, text]) => (
                  <div key={n} className="grid grid-cols-[76px_1fr] gap-3">
                    <span className="text-[17px] font-semibold tabular-nums text-neutral-100">{n}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <p className="pt-2">So in practice Kanthink is four loops: <b>talk</b>, <b>make apps</b>, <b>save things</b>, <b>hand work to Claude Code</b>. The Kanban board sits in the middle of all four and none of them run through it.</p>
            </Note>

            <Note title="Where it breaks today">
              <div className="space-y-2.5">
                {BROKE.map(([d, text]) => (
                  <div key={d} className="grid grid-cols-[76px_1fr] gap-3">
                    <span className="text-[12px] text-neutral-500">{d}</span>
                    <span>{text}</span>
                  </div>
                ))}
              </div>
              <p className="pt-2">Almost every bad moment is Kan acting too early or putting something in the wrong place, and every one of them happens in voice.</p>
            </Note>

            <Note title="How it works">
              {HOW.map(([h, body]) => <p key={h}><b>{h}</b> {body}</p>)}
            </Note>

            <Note title="What happens to what you have">
              <div className="overflow-hidden rounded-xl border border-neutral-800">
                {MAPPING.map(([from, to], n) => (
                  <div key={from} className={`grid grid-cols-[42%_1fr] gap-3 px-4 py-2.5 text-[13px] ${n % 2 ? 'bg-neutral-900/40' : ''}`}>
                    <span className="text-neutral-500">{from}</span>
                    <span className="text-neutral-200">{to}</span>
                  </div>
                ))}
              </div>
              <p>Nothing is removed and the data model doesn’t change. Channels, cards, columns and shrooms all stay; they stop being the way in.</p>
            </Note>

            <Note title="How we get there">
              <p>Five steps, in this order. Each ships alone. The first one is the most important and the smallest.</p>
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

            <Note title="What changed from the earlier drafts">
              <p>The earlier drafts were guesses: an inbox, five open things, cards growing through stages, Kan filing everything. Your account doesn’t support them. You don’t juggle work in progress, and you don’t need anything filed without asking. Kan filing without asking is exactly what went wrong on the 11th and the 23rd. Two ideas survived: Home shows what comes back, and routines are something you say.</p>
            </Note>
          </div>
        </article>
      </div>
    </div>
  );
}
