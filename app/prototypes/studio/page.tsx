'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AudioLines } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { MyceliumWeb } from '@/components/kan/KanThinking';

/**
 * The studio, tied into Kanthink as it already is.
 *
 * No new section of the app. The crew reaches you in three places you already
 * use: Kan on the home screen (a spark waiting as the first message, answered in
 * the same composer, or by voice), an ordinary channel called Studio that the
 * shrooms work in, and the morning email. Every class here is lifted from the
 * real component it imitates — OperatorHome, Board, Column, Card, the email
 * shell — so this is judged as the product, not as a mockup of one.
 */

type View = 'home' | 'channel' | 'email';

const VIEWS: { id: View; label: string; where: string }[] = [
  { id: 'home', label: 'Home', where: 'Your home screen. The morning spark is waiting as Kan’s first message, and you answer in the same box, or by voice.' },
  { id: 'channel', label: 'Studio channel', where: 'An ordinary channel. The shrooms move cards through it. The only new thing is the one-line strip under the header.' },
  { id: 'email', label: 'Morning email', where: 'The same spark, sent at 7:30. The button opens Home with it waiting.' },
];

export default function StudioPrototype() {
  const [view, setView] = useState<View>('home');
  const current = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[rgb(10,10,10)] text-neutral-100">
      {/* Prototype bar: the only thing on the page that isn't Kanthink */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-4 py-2.5">
        <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">Prototypes</Link>
        <div className="flex items-center gap-0.5 rounded-lg bg-neutral-900 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${view === v.id ? 'bg-neutral-800 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">{current.where}</p>
      </div>

      <div className="relative min-h-0 flex-1">
        {view === 'home' && <Home />}
        {view === 'channel' && <StudioChannel />}
        {view === 'email' && <MorningEmail onOpen={() => setView('home')} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Home: OperatorHome, opening on a spark
// ─────────────────────────────────────────────────────────────────────────────

const Check = () => (
  <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
);

function Done({ children, view }: { children: React.ReactNode; view?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Check />
      <span className="text-green-300">{children}</span>
      {view && <span className="ml-1 text-violet-400 hover:underline">View</span>}
    </div>
  );
}

function CardPreview({ column, title, note }: { column: string; title: string; note: string }) {
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-neutral-400">
        <span>Studio</span><span>/</span><span>{column}</span>
      </div>
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-1 text-xs text-neutral-400">{note}</p>
    </div>
  );
}

type Msg =
  | { role: 'assistant'; body: React.ReactNode; results?: React.ReactNode }
  | { role: 'user'; text: string }
  | { role: 'divider'; text: string };

/** The scripted morning. User lines are typed into the real composer, then sent. */
const SCRIPT: Msg[] = [
  {
    role: 'assistant',
    body: (
      <>
        <p>Morning. Something I noticed while reading teacher forums for the Sheet Maker test: people keep asking for help with <strong>sub plans</strong>. Teachers spend an hour or two writing one the night before a sick day.</p>
        <p>I found 14 posts like that this month, and nobody sells a tool that just does it. Want me to put up a test page? I’d try $5 a plan.</p>
      </>
    ),
    results: (
      <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
        <p className="text-[10px] text-neutral-400">Where it came from</p>
        <ul className="mt-1.5 space-y-1 text-xs text-neutral-300">
          <li>“Writing sub plans at 11pm with a fever is its own circle of hell.” <span className="text-neutral-500">teachers forum, 212 upvotes</span></li>
          <li>“Is there anything that just makes a sub plan from my schedule?” <span className="text-neutral-500">teachers forum, 38 replies</span></li>
          <li className="text-violet-400">12 more</li>
        </ul>
      </div>
    ),
  },
  { role: 'user', text: 'yeah, but make the first one free' },
  {
    role: 'assistant',
    body: (
      <>
        <p>Done. The test page is up, with the first plan free and $5 after that. Nobody is charged while it’s a test. Reserving just saves their email.</p>
        <p>Here’s what I’d post in the two threads it came from:</p>
        <blockquote>Sub plans kept coming up here, so I’m making a tool that writes one from your schedule. You can reserve it now, and the first one’s free.</blockquote>
        <p>Ok to post?</p>
      </>
    ),
    results: <CardPreview column="Testing" title="Sub Plan Writer" note="Test page live. Day 1 of 5, nobody charged" />,
  },
  { role: 'user', text: 'ok' },
  {
    role: 'assistant',
    body: <p>Posted. I’ll tell you how it’s doing in the morning.</p>,
    results: <><Done>Posted in 2 teacher threads</Done></>,
  },
  { role: 'divider', text: 'Today, 4:10 PM' },
  {
    role: 'assistant',
    body: (
      <>
        <p><strong>Fair Rotations</strong> is built and tested, and 5 people reserved it during its test. Try it before anyone else does:</p>
      </>
    ),
    results: (
      <>
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-violet-500/20 text-violet-300">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">Fair Rotations</p>
              <p className="text-xs text-neutral-400">Equal playing time for every kid, shared with parents</p>
            </div>
            <span className="text-xs text-violet-400">Open</span>
          </div>
        </div>
        <p className="text-xs text-neutral-400">The tester fixed 2 things. One small one is left: the print view cuts the last inning on narrow phones. Say “ship it” and I’ll turn on checkout at $9 a season and email those 5 people.</p>
      </>
    ),
  },
  { role: 'user', text: 'ship it. and honestly I’m more into stuff for small businesses than parents right now' },
  {
    role: 'assistant',
    body: (
      <>
        <p>Shipped. From tomorrow the scouts will look at one-person businesses first, and I’ve added that to the Studio brief.</p>
      </>
    ),
    results: (
      <>
        <Done view>Fair Rotations is live at $9 a season</Done>
        <Done>Launch email to 5 people goes out at 8am</Done>
        <Done view>Studio brief updated: “Look first at one-person businesses.”</Done>
      </>
    ),
  },
];

function Home() {
  const [step, setStep] = useState(1); // the spark is already waiting
  const [typing, setTyping] = useState({ step: 0, n: 0 });
  const [auto, setAuto] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const shown = SCRIPT.slice(0, step);
  const next = SCRIPT[step];
  const userTurn = next?.role === 'user' ? next : null;
  const typed = userTurn && typing.step === step ? userTurn.text.slice(0, typing.n) : '';
  // Kan is "thinking" for as long as its next message is on the way.
  const thinking = next?.role === 'assistant';

  // Type the next user line into the composer, a character at a time.
  useEffect(() => {
    if (!userTurn) return;
    const t = setInterval(() => {
      setTyping((p) => (p.step === step ? { step, n: Math.min(p.n + 1, userTurn.text.length) } : { step, n: 1 }));
    }, 28);
    return () => clearInterval(t);
  }, [userTurn, step]);

  // Kan's turn (or a time divider) follows on its own after a beat.
  useEffect(() => {
    if (!next || next.role === 'user') return;
    const t = setTimeout(() => setStep((s) => s + 1), next.role === 'divider' ? 700 : 1400);
    return () => clearTimeout(t);
  }, [next]);

  // In auto mode, send each line once it's typed.
  useEffect(() => {
    if (!auto || !userTurn || typed !== userTurn.text) return;
    const t = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(t);
  }, [auto, typed, userTurn]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [step, thinking]);

  const send = () => { if (userTurn && typed === userTurn.text) setStep((s) => s + 1); };
  const restart = () => { setAuto(false); setStep(1); };

  return (
    <div className="relative flex h-full flex-col items-center">
      {/* Top bar — new chat + history, as on the real home screen */}
      <div className="absolute right-4 top-3 z-10 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </span>
      </div>

      <div className="flex h-full min-h-0 w-full max-w-3xl flex-col px-4">
        <div className="min-h-0 flex-1 overflow-y-auto pb-4 pt-6">
          <div className="space-y-6">
            {shown.map((m, n) => {
              if (m.role === 'divider') return <p key={n} className="text-center text-[11px] text-neutral-500">{m.text}</p>;
              if (m.role === 'user') {
                return (
                  <div key={n} className="flex justify-end gap-3">
                    <div className="max-w-[85%] rounded-2xl bg-violet-600 px-4 py-3 text-white">
                      <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={n} className="flex gap-3">
                  <div className="mt-1 flex-shrink-0"><KanthinkIcon size={20} className="text-violet-400" /></div>
                  <div className="max-w-[85%] rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-neutral-200">
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-blockquote:my-2 prose-blockquote:border-violet-500/60 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-neutral-300">
                      {m.body}
                    </div>
                    {m.results && <div className="mt-3 space-y-2 border-t border-neutral-700/50 pt-3">{m.results}</div>}
                  </div>
                </div>
              );
            })}
            {thinking && (
              <div className="flex gap-3">
                <div className="mt-1 flex-shrink-0"><KanthinkIcon size={20} className="text-violet-400" /></div>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3"><MyceliumWeb size={22} className="text-violet-400" /></div>
              </div>
            )}
            <div ref={end} />
          </div>
        </div>

        {/* The real composer, with the next reply typed in for you */}
        <div className="relative pb-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 transition-colors duration-200 focus-within:border-neutral-700">
            <textarea
              readOnly
              value={typed}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
              placeholder={next ? 'Ask Kan anything...' : 'That’s the morning.'}
              rows={2}
              className="w-full resize-none bg-transparent px-5 pb-1 pt-4 text-[15px] text-white placeholder:text-neutral-500 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
              <span className="hidden truncate pl-2 text-[11px] text-neutral-600 sm:block">
                {step >= SCRIPT.length
                  ? <button onClick={restart} className="text-violet-400 hover:underline">Play it again</button>
                  : userTurn
                    ? <>Your reply is typed in. Press send, or <button onClick={() => setAuto(true)} className="text-violet-400 hover:underline">play the rest of the morning</button></>
                    : 'Kan can search your workspace, create cards, and take action'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <span title="Talk to Kan" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300">
                  <AudioLines className="h-4 w-4" />
                </span>
                <button
                  onClick={send}
                  disabled={!userTurn || typed !== userTurn.text}
                  title="Send"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m-7 7l7-7 7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The Studio channel: Board, Column and Card, with one new strip
// ─────────────────────────────────────────────────────────────────────────────

type Tag = { label: string; cls: string };
const T = {
  spark: { label: 'Spark', cls: 'bg-amber-500/15 text-amber-300' },
  you: { label: 'Waiting on you', cls: 'bg-violet-500/20 text-violet-300' },
  teachers: { label: 'Teachers', cls: 'bg-sky-500/15 text-sky-300' },
  solo: { label: 'Small business', cls: 'bg-emerald-500/15 text-emerald-300' },
  parents: { label: 'Parents', cls: 'bg-pink-500/15 text-pink-300' },
} satisfies Record<string, Tag>;

interface DemoCard {
  id: string;
  title: string;
  preview: string;
  tags: Tag[];
  progress?: { label: string; pct: number };
  app?: { name: string; live: boolean };
  thread: { who: 'kan' | 'you'; text: string; when: string }[];
}

const COLS: { id: string; name: string; shroom?: string; cards: DemoCard[] }[] = [
  {
    id: 'sparks', name: 'Sparks', shroom: 'Scout',
    cards: [
      {
        id: 'subs', title: 'Sub Plan Writer', tags: [T.spark, T.teachers],
        preview: 'Teachers write sub plans the night before a sick day. 14 posts this month, nobody sells it.',
        thread: [
          { who: 'kan', when: 'Today 7:30', text: 'Found 14 posts this month asking for help with sub plans. Two quotes: “Writing sub plans at 11pm with a fever is its own circle of hell.” and “Is there anything that just makes a sub plan from my schedule?”' },
          { who: 'kan', when: 'Today 7:30', text: 'Jev thinks it will sell. Nothing like it is for sale. I’d try $5 a plan.' },
        ],
      },
      {
        id: 'menu', title: 'Menu Board', tags: [T.spark, T.solo],
        preview: 'Food trucks redo their menu every Monday in a design app. Type the items, get the board.',
        thread: [{ who: 'kan', when: 'Yesterday', text: '“I redo the menu in a design app every Monday. Takes an hour.” A food-truck owners’ group. MyCreativeShop prints boards, which could be a nice tie-in.' }],
      },
    ],
  },
  {
    id: 'testing', name: 'Testing', shroom: 'Tester',
    cards: [
      {
        id: 'sheet', title: 'Sheet Maker', tags: [T.teachers],
        preview: 'The same worksheet at three levels, answer keys included. $6 a pack.',
        progress: { label: '6 of 120 reserved, day 4 of 5', pct: 80 },
        thread: [
          { who: 'kan', when: 'Mon', text: 'Test page is up at $6 a pack. Nobody is charged; reserving saves their email.' },
          { who: 'you', when: 'Mon', text: 'ok post it' },
          { who: 'kan', when: 'Thu', text: '6 of 120 visitors have reserved so far (5%). Your bar is 3%.' },
        ],
      },
    ],
  },
  {
    id: 'building', name: 'Building', shroom: 'Builder',
    cards: [
      {
        id: 'inspect', title: 'Move-in Report', tags: [T.solo],
        preview: 'Room-by-room photos, a dated PDF both sides sign. 4 people are waiting.',
        progress: { label: 'Building, day 2 of 3', pct: 66 },
        thread: [{ who: 'kan', when: 'Tue', text: 'Building from this thread: the take, 2 quotes, and what the 4 people asked when they reserved.' }],
      },
    ],
  },
  {
    id: 'ready', name: 'Ready for you',
    cards: [
      {
        id: 'coach', title: 'Fair Rotations', tags: [T.you, T.parents],
        preview: 'Built and tested. 5 people reserved it. Try it, then say ship it.',
        app: { name: 'Fair Rotations', live: false },
        thread: [
          { who: 'kan', when: 'Today 4:10', text: 'Built and tested. The tester fixed 2 things; the print view still cuts the last inning on narrow phones.' },
          { who: 'kan', when: 'Today 4:10', text: 'Say “ship it” and I’ll turn on checkout at $9 a season and email the 5 people who reserved it.' },
        ],
      },
    ],
  },
  {
    id: 'live', name: 'Live', shroom: 'Seller',
    cards: [
      {
        id: 'quilt', title: 'Quilt Math', tags: [],
        preview: '$63 earned, $21 spent. 9 sold this week.',
        app: { name: 'Quilt Math', live: true },
        thread: [{ who: 'kan', when: 'Sun', text: 'This week: 9 sold, $63 in. Ads cost $10 and AI time $11. You came out $42 ahead.' }],
      },
    ],
  },
  {
    id: 'dropped', name: 'Dropped',
    cards: [
      {
        id: 'seat', title: 'Seat Plan', tags: [T.parents],
        preview: 'You passed: too crowded. A $3 check agreed, 1 of 40 reserved.',
        thread: [
          { who: 'you', when: 'Oct 5', text: 'pass, too crowded, wedding sites do this free' },
          { who: 'kan', when: 'Oct 10', text: 'Checked your no with a small test: 1 of 40 reserved. You were right.' },
        ],
      },
    ],
  },
];

function CardTile({ card, onOpen }: { card: DemoCard; onOpen: () => void }) {
  return (
    <div onClick={onOpen} className="card-container group relative cursor-pointer select-none rounded-md bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-neutral-900">
      <div className="relative p-3">
        {card.tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1 pr-12">
            {card.tags.map((t) => <span key={t.label} className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${t.cls}`}>{t.label}</span>)}
          </div>
        )}
        <h4 className="wrap-anywhere pr-6 text-sm font-medium text-neutral-900 dark:text-white">{card.title}</h4>
        <p className="wrap-anywhere mt-1 line-clamp-2 text-xs text-neutral-500">{card.preview}</p>
        {card.progress && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-500"><span>{card.progress.label}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div className="h-full rounded-full bg-green-500 dark:bg-green-600" style={{ width: `${card.progress.pct}%` }} />
            </div>
          </div>
        )}
        {card.app && (
          <div className="-mx-1.5 mt-2 space-y-0.5">
            <div className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-neutral-800">
              <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded bg-violet-500/20 text-violet-300">
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </span>
              <span className="flex-1 truncate text-xs text-neutral-400">{card.app.name}</span>
              {card.app.live && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" title="Published" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StudioChannel() {
  const [open, setOpen] = useState<DemoCard | null>(null);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-[120px] flex-shrink-0 truncate text-sm text-neutral-500">Money</span>
          <span className="flex-shrink-0 text-neutral-600">/</span>
          <h2 className="truncate text-base font-semibold text-white sm:text-lg">Studio</h2>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2 text-neutral-500">
          {[
            'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
            'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
            'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
          ].map((d) => (
            <span key={d} className="rounded-md p-2"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg></span>
          ))}
        </div>
      </header>

      {/* The one new piece of chrome: the week in a line, styled like the channel description */}
      <p className="-mt-1 mb-3 px-4 text-xs text-neutral-500 sm:px-6">
        This week <span className="text-green-400">$63 earned</span>, $38 spent. 1 waiting on you. Brief: look first at one-person businesses.
      </p>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-6 sm:px-6">
        {COLS.map((col) => (
          <div key={col.id} className="column-container relative flex h-full w-[280px] flex-shrink-0 flex-col rounded-lg bg-neutral-100 transition-colors sm:w-72 dark:bg-neutral-800/50">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="flex-1 truncate text-sm font-medium text-neutral-700 dark:text-neutral-300">{col.name}</span>
              <div className="flex items-center gap-1">
                {col.shroom && (
                  <span className="flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-300">
                    <span className="leading-none">🍄</span>{col.shroom}
                  </span>
                )}
                <span className="text-xs text-neutral-500">{col.cards.length}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-8">
              {col.cards.map((c) => <CardTile key={c.id} card={c} onOpen={() => setOpen(c)} />)}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Ask Kan button, as on every board */}
      <span className="absolute bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-neutral-600 bg-neutral-800 text-white shadow-lg">
        <KanthinkIcon size={24} className="text-white" />
      </span>

      {open && <CardThread card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CardThread({ card, onClose }: { card: DemoCard; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="m-2 flex h-[calc(100%-1rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-800 px-5 py-4">
          <div>
            <div className="mb-1.5 flex flex-wrap gap-1">{card.tags.map((t) => <span key={t.label} className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${t.cls}`}>{t.label}</span>)}</div>
            <h2 className="text-[15px] font-semibold text-white">{card.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {card.thread.map((m, n) => (
            <div key={n} className={`rounded-xl px-4 py-3 ${m.who === 'kan' ? 'bg-neutral-800/50' : 'bg-neutral-800'}`}>
              <div className="mb-2 flex items-center gap-2">
                {m.who === 'kan'
                  ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400"><KanthinkIcon size={14} className="text-violet-400" />Kan</span>
                  : <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400"><span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-900 text-[7px] font-medium text-violet-300">D</span>You</span>}
                <span className="text-xs text-neutral-500">{m.when}</span>
              </div>
              <p className="text-sm text-neutral-200">{m.text}</p>
            </div>
          ))}
        </div>
        <div className="px-3 pb-3 pt-2">
          <div className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-neutral-500">Reply to Kan about this card…</div>
        </div>
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The morning email, in the shell every Kanthink email already uses
// ─────────────────────────────────────────────────────────────────────────────

function MorningEmail({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="h-full overflow-y-auto bg-[#f4f4f5] px-4 py-8" style={{ fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div className="mx-auto mb-4 max-w-[480px] text-[13px] text-neutral-500">
        <p><span className="text-neutral-800">From:</span> Kan at Kanthink</p>
        <p><span className="text-neutral-800">Subject:</span> A spark: sub plans</p>
      </div>
      <div className="mx-auto max-w-[480px] overflow-hidden rounded-lg bg-white">
        <div className="h-1 bg-[#7c3aed]" />
        <div className="bg-[#18181b] p-5 text-center">
          <KanthinkIcon size={32} className="mr-2 inline-block align-middle text-white" />
          <span className="align-middle text-lg font-bold text-white">Kanthink</span>
        </div>
        <div className="px-6 py-8">
          <h1 className="mb-4 text-[22px] font-bold leading-tight text-[#18181b]">A spark: sub plans</h1>
          <p className="mb-4 text-[15px] leading-relaxed text-[#3f3f46]">While reading teacher forums for the Sheet Maker test, I kept seeing the same thing. Teachers spend an hour or two writing a sub plan the night before a sick day. I found 14 posts this month, and nobody sells a tool that just does it.</p>
          <p className="mb-4 text-[15px] leading-relaxed text-[#3f3f46]">Want me to put up a test page? I’d try $5 a plan.</p>
          <p className="mb-6 text-[15px] leading-relaxed text-[#3f3f46]">Also overnight: Sheet Maker is at 6 of 120 reserved, and Quilt Math sold 2.</p>
          <button onClick={onOpen} className="rounded-md bg-[#7c3aed] px-6 py-3 text-[15px] font-semibold text-white">Answer Kan</button>
        </div>
        <div className="border-t border-[#f4f4f5] px-6 py-4 text-[12px] text-[#a1a1aa]">One spark a morning, never more. Turn this off in Settings.</div>
      </div>
    </div>
  );
}
