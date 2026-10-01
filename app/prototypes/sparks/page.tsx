import type { Metadata } from 'next';
import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * What an app-making crew can actually do without you, and how you'd steer it.
 *
 * Written after two rejected rounds of UI: the question underneath was never
 * "what should the screen look like" but "what is possible, and where does it
 * run". So this is the answer, grounded in what Kanthink already ships, with
 * one example of steering by conversation instead of a form.
 */

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-sparks' });

export const metadata: Metadata = {
  title: 'What the crew can do',
  description: 'What runs without you, what needs you, and how you steer it by talking.',
};

const THEME = {
  '--paper': '#F2F4F7',
  '--card': '#FFFFFF',
  '--ink': '#111A2E',
  '--soft': '#4A5468',
  '--faint': '#7C8597',
  '--line': '#DDE2EA',
  '--cobalt': '#2747E8',
  '--wash': '#E9EDFD',
  '--money': '#0E7A55',
  fontFamily: 'var(--font-sparks), system-ui, sans-serif',
} as React.CSSProperties;

// ── The example morning ──

type Line = { who: 'kan' | 'you' | 'note'; text: React.ReactNode; time?: string };

const MORNING: Line[] = [
  {
    who: 'kan', time: '7:30',
    text: (
      <>
        <p>Something I noticed while reading teacher forums for the worksheet test: people keep asking for help with sub plans. Teachers spend an hour or two writing one the night before a sick day. I found 14 posts this month and nobody sells a tool that just does it.</p>
        <p className="mt-3">Want me to put up a test page? I’d try $5 a plan.</p>
      </>
    ),
  },
  { who: 'you', text: 'yeah, but make the first one free' },
  {
    who: 'kan',
    text: (
      <>
        <p>Done. The test page is up: first plan free, then $5. Here’s what I’d post in the two threads it came from:</p>
        <p className="mt-3 rounded-2xl bg-(--paper) px-4 py-3 text-(--ink)">“Sub plans kept coming up here, so I’m making a tool that writes one from your schedule. You can reserve it now, and the first one’s free.”</p>
        <p className="mt-3">Ok to post?</p>
      </>
    ),
  },
  { who: 'you', text: 'ok' },
  { who: 'note', text: 'Later that day' },
  {
    who: 'kan', time: '4:10',
    text: (
      <>
        <p>Fair Rotations is built, and 5 people reserved it during the test. Try it here: <span className="text-(--cobalt) underline underline-offset-4">kanthink.com/play/…</span></p>
        <p className="mt-3">Say “ship it” and I’ll turn on checkout at $9 a season and email those 5.</p>
      </>
    ),
  },
  { who: 'you', text: 'ship it. and honestly I’m more into stuff for small businesses than parents right now' },
  {
    who: 'kan',
    text: (
      <>
        <p>Shipped. The 5 emails go out in the morning.</p>
        <p className="mt-3">From tomorrow the scouts look at one-person businesses first. I’ve added that line to the Studio brief, which you can see and undo.</p>
      </>
    ),
  },
];

function Conversation() {
  return (
    <div className="rounded-[28px] bg-(--card) p-4 ring-1 ring-(--line) sm:p-6">
      <div className="space-y-4">
        {MORNING.map((l, n) => {
          if (l.who === 'note') return <p key={n} className="pt-2 text-center text-[14px] text-(--faint)">{l.text}</p>;
          const kan = l.who === 'kan';
          return (
            <div key={n} className={`flex gap-3 ${kan ? '' : 'justify-end'}`}>
              {kan && <KanthinkIcon size={28} className="mt-1 flex-shrink-0 text-(--cobalt)" />}
              <div className={`max-w-[85%] text-[17px] leading-[1.5] ${kan ? 'text-(--soft)' : 'rounded-[22px] rounded-br-md bg-(--ink) px-4 py-2.5 text-white'}`}>
                {kan && l.time && <p className="mb-1 text-[14px] text-(--faint)">Kan, {l.time}</p>}
                {l.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── The plain facts ──

type Job = { what: string; how: string; status: 'ships' | 'new' };

const ALONE: Job[] = [
  { what: 'Read the web every morning for people asking for something', how: 'A scheduled shroom with web search. Shrooms already run on a server timer with no browser open, and Kan already searches the web.', status: 'ships' },
  { what: 'Write up what it found as a spark, with the quotes and links', how: 'Kan writes it, and Jev scores it. Jev already judges shroom output against your taste and scores what you read in Kanwatch.', status: 'ships' },
  { what: 'Put up a test page with a price', how: 'The build shroom and the app generator already make and publish single-file apps without you. The Reserve button is new: it saves an email and the launch price and charges nobody.', status: 'new' },
  { what: 'Build the real app', how: 'The same generator, working from the card’s thread. That’s how build shrooms work today. It covers tools, calculators, generators and printables, not apps that need accounts or a server.', status: 'ships' },
  { what: 'Check it before you see it', how: 'Kan reads the code, and the app’s preflight check already runs. Clicking through it in a real browser is new, and has to run outside Kanthink’s servers (on GitHub or as a Claude Code cloud job).', status: 'new' },
  { what: 'Charge for it', how: 'App pricing and Stripe checkout already work. App purchases are already recorded.', status: 'ships' },
  { what: 'Tell the people who reserved it', how: 'Email through Customer.IO, which already sends Kanthink’s mail. It asks you the first couple of times.', status: 'ships' },
  { what: 'Keep the books', how: 'Purchases and AI spend are already recorded per app. Kan tells you the week in a sentence.', status: 'ships' },
];

const NEEDS_YOU: { when: string; what: string; why: string }[] = [
  {
    when: 'Once, and it matters most',
    what: 'Decide who the crew posts as.',
    why: 'A test page with no visitors tells you nothing, and visitors come from posting where the people are. Posting means an account, and many communities ban promotion. There are three ways to do it. Kan drafts and you paste it, about 30 seconds and the safest. You connect an X or Reddit account for Kan to post from. Or you open a small ad account with a hard weekly cap.',
  },
  {
    when: 'Once',
    what: 'Set a weekly spending cap, and decide whose name is on the apps.',
    why: 'Every agent stops at the cap. The name decides what the listing, the launch email and a refund say.',
  },
  {
    when: 'Each app',
    what: 'Try it for a minute, then say ship it or drop it.',
    why: 'Agents can tell broken from working. Only you can tell whether it’s something you’d put your name on.',
  },
  {
    when: 'Whenever you like',
    what: 'Talk.',
    why: 'Reply to a spark, or say what’s on your mind, typed or in voice mode. Kan turns it into direction for the crew.',
  },
];

const SOURCES: [string, string][] = [
  ['Research', 'Scouts read public posts, bad reviews of paid tools and search trends every morning. This is where most sparks come from.'],
  ['Your apps', 'People using your apps say what they want. Someone wrote “It’s free and I want to pay” in Cat Math, and that’s a spark.'],
  ['What you share', 'Links you share into Kan, and if you want it, the public reading Kanwatch already allows. Nothing new is captured, and privacy.js doesn’t change.'],
];

const FIRST: { title: string; body: string }[] = [
  { title: 'Sparks in conversation', body: 'The Studio channel, a scout shroom that reads the web each morning, one spark waiting in Kan chat (plus an email), and Kan able to act on your reply: dig in, drop it, or change the brief. This is useful on day one even if nothing else ships.' },
  { title: 'Test pages', body: 'The Reserve button, and whichever posting path you pick. This is the first real read on whether anyone wants a spark.' },
  { title: 'Build, check, ship by saying so', body: 'The build shroom builds from the spark’s thread, a browser check runs, you try it, and “ship it” in chat turns on checkout and sends the launch email.' },
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-20 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-(--ink) sm:text-[32px]">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 max-w-[62ch] text-[18px] leading-[1.6] text-(--soft)">{children}</p>;
}

export default function SparksPage() {
  return (
    <div className={bricolage.variable} style={THEME}>
      <div className="min-h-screen bg-(--paper) text-(--ink) antialiased">
        <div className="mx-auto max-w-[680px] px-5 pb-28 pt-8 sm:px-8">
          <Link href="/prototypes" className="text-[15px] text-(--soft) underline-offset-4 hover:text-(--ink) hover:underline">All prototypes</Link>

          <h1 className="mt-10 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] [text-wrap:balance] sm:text-[52px]">
            What the crew can do without you
          </h1>
          <p className="mt-6 max-w-[58ch] text-[20px] leading-[1.55] text-(--soft)">
            Almost all of it runs inside Kanthink on its own schedule, with no browser open. You come in by talking: a short reply to the morning spark, and “ship it” when something is ready. Two things genuinely need you. One is deciding who the crew posts as. The other is trying an app before it goes out.
          </p>

          <H2>A morning, as a conversation</H2>
          <P>This is the whole interface: no form and no dashboard. You can type it, or say it out loud in voice mode. It’s an example of how it would go, not a recording.</P>
          <div className="mt-8"><Conversation /></div>
          <P>Notice what your last reply did. You didn’t fill in a setting. You said what you were into, and Kan changed what the scouts look for. It wrote that into the brief, where you can see it and take it back.</P>

          <H2>Where sparks come from</H2>
          <div className="mt-6 space-y-5">
            {SOURCES.map(([h, b]) => (
              <div key={h}>
                <p className="text-[19px] font-semibold">{h}</p>
                <p className="mt-1 max-w-[62ch] text-[17px] leading-[1.55] text-(--soft)">{b}</p>
              </div>
            ))}
          </div>
          <P>Your own account can start a spark, but it never decides one. The test page decides.</P>

          <H2>What runs without you</H2>
          <P>Each job, how it would work, and whether that part already ships in Kanthink.</P>
          <ul className="mt-8 divide-y divide-(--line) rounded-[24px] bg-(--card) ring-1 ring-(--line)">
            {ALONE.map((j) => (
              <li key={j.what} className="px-5 py-5 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-[18px] font-medium leading-[1.4]">{j.what}</p>
                  <span className={`mt-0.5 flex-shrink-0 rounded-full px-3 py-1 text-[14px] ${j.status === 'ships' ? 'bg-[#E3F3EC] text-(--money)' : 'bg-(--wash) text-(--cobalt)'}`}>
                    {j.status === 'ships' ? 'Already works' : 'New'}
                  </span>
                </div>
                <p className="mt-2 text-[16px] leading-[1.55] text-(--soft)">{j.how}</p>
              </li>
            ))}
          </ul>

          <H2>What needs you</H2>
          <div className="mt-8 space-y-8">
            {NEEDS_YOU.map((n) => (
              <div key={n.what}>
                <p className="text-[15px] font-medium text-(--cobalt)">{n.when}</p>
                <p className="mt-1 text-[21px] font-semibold leading-[1.3]">{n.what}</p>
                <p className="mt-2 max-w-[62ch] text-[17px] leading-[1.6] text-(--soft)">{n.why}</p>
              </div>
            ))}
          </div>

          <H2>Where it lives</H2>
          <P>
            It’s a channel called Studio. Each card is one spark, and its thread holds the quotes, the test results and the app. The columns are the stages: sparks, testing, building, ready for you, live, dropped. Shrooms are the crew. The channel’s instructions are the brief, and your conversations edit it, using the same change-and-approve flow instructions already have.
          </P>
          <P>
            Everything above runs on Kanthink’s servers, so it keeps working while your laptop is closed. Two kinds of work happen elsewhere. A real-browser check of each app runs on GitHub or as a Claude Code cloud job. Any change to Kanthink itself goes through Claude Code, as the Work channel does now.
          </P>

          <H2>What I’d build first</H2>
          <ol className="mt-8 space-y-7">
            {FIRST.map((s, n) => (
              <li key={s.title} className="grid grid-cols-[36px_1fr] gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--ink) text-[15px] font-semibold text-white">{n + 1}</span>
                <div>
                  <p className="text-[20px] font-semibold leading-[1.3]">{s.title}</p>
                  <p className="mt-1.5 max-w-[60ch] text-[17px] leading-[1.6] text-(--soft)">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-20 rounded-[24px] bg-(--ink) px-6 py-7 text-white sm:px-8">
            <p className="text-[15px] font-medium text-[#AFC0FF]">The one call to make before step 2</p>
            <p className="mt-2 text-[22px] font-semibold leading-[1.35]">Who should the crew post as: you pasting Kan’s drafts, a connected X or Reddit account, or a small capped ad budget?</p>
            <p className="mt-3 text-[17px] leading-[1.55] text-[#C9D1E3]">Step 1 doesn’t need the answer. Just tell Kan in chat when you know.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
