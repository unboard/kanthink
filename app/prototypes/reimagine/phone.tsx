'use client';

import { useEffect, useRef, useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import {
  APPS, TRIED_ONCE, DISPATCHES, SHARES, CONVERSATIONS, PLACES, STANDING, SCRIPT, CATCHES,
  type App, type Catch, type Conversation, type Dispatch, type Landed, type Standing,
} from './data';

/**
 * Kanthink, reimagined from how the account is actually used.
 *
 * You talk; Kan listens without acting and shows what it caught; you keep what
 * you want and it lands where it belongs. Home is only what comes back: people
 * using your apps, work Claude Code finished, what your shares add up to, and
 * the numbers you'd otherwise ask for.
 */

type Tab = 'home' | 'apps' | 'library';
export type Overlay = null | 'talk' | 'share';

const KIND_LABEL: Record<Landed['kind'], string> = {
  card: 'Card', app: 'App', dispatch: 'Claude Code', question: 'Every morning', email: 'Email', kept: 'Kept here',
};

// ── Small pieces ─────────────────────────────────────────────────────────────

function Block({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mx-4 mt-3 rounded-2xl border border-neutral-800/80 bg-neutral-900/70 p-4">
      <div className="mb-2.5 flex items-center">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">{label}</h3>
        <div className="ml-auto text-[11px] text-neutral-500">{right}</div>
      </div>
      {children}
    </section>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-900" aria-label="Back">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
    </button>
  );
}

function ReplyBox({ onSend, placeholder = 'Reply' }: { onSend: (text: string) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  return (
    <div className="mt-2 flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-950 py-1 pl-3.5 pr-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { onSend(text.trim()); setText(''); } }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-100 outline-none placeholder:text-neutral-600"
      />
      <button
        disabled={!text.trim()}
        onClick={() => { onSend(text.trim()); setText(''); }}
        className="rounded-full bg-violet-500 px-3 py-1 text-[12px] text-white disabled:bg-neutral-800 disabled:text-neutral-600"
      >
        Send
      </button>
    </div>
  );
}

function LandedChip({ l }: { l: Landed }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-400">
      <span className="text-violet-300">{KIND_LABEL[l.kind]}</span>
      <span className="truncate">{l.text}</span>
    </span>
  );
}

// ── Home: only what comes back ───────────────────────────────────────────────

function Home({
  apps, dispatches, standing, conversations, onApp, onConversation, onTalk, onReply,
}: {
  apps: App[];
  dispatches: Dispatch[];
  standing: Standing[];
  conversations: Conversation[];
  onApp: (id: string) => void;
  onConversation: (id: string) => void;
  onTalk: () => void;
  onReply: (appId: string, msgId: string, text: string) => void;
}) {
  const [showWaiting, setShowWaiting] = useState(false);
  const waitingOnYou = apps.flatMap((a) => (a.people_msgs ?? []).filter((m) => !m.replied).map((m) => ({ app: a, m })));
  const done = dispatches.filter((d) => d.state === 'done');
  const queued = dispatches.filter((d) => d.state === 'waiting');
  const numbers = standing.filter((s) => s.answer);
  const last = conversations[0];
  const agents = SHARES.filter((s) => s.topic === 'agents');

  return (
    <div className="pb-6">
      <header className="px-5 pt-2">
        <div className="flex items-center gap-2 text-[12px] text-neutral-500">
          <KanthinkIcon size={16} className="text-violet-300" /> Wednesday morning
        </div>
        <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-neutral-50">
          Morning, Dustin.{' '}
          <span className="text-neutral-500">
            {waitingOnYou.length > 0 ? `${waitingOnYou.length === 1 ? 'Someone' : 'Two people'} wrote to you in your apps.` : 'Nobody’s waiting on you.'}
          </span>
        </h2>
      </header>

      {waitingOnYou.length > 0 && (
        <Block label="People" right="in your apps">
          <div className="space-y-4">
            {waitingOnYou.map(({ app, m }) => (
              <div key={m.id}>
                <button onClick={() => onApp(app.id)} className="text-[12px] text-neutral-500 hover:text-neutral-300">
                  {m.who} on <span className="text-neutral-300">{app.name}</span> · {m.when}
                </button>
                <p className="mt-1 text-[15px] leading-snug text-neutral-100">“{m.text}”</p>
                <ReplyBox onSend={(t) => onReply(app.id, m.id, t)} placeholder="Reply — they’ll see it in the app" />
              </div>
            ))}
          </div>
        </Block>
      )}

      {numbers.map((s) => (
        <Block key={s.id} label="Print orders yesterday" right={s.when}>
          <p className="text-[20px] font-medium tracking-tight text-neutral-50">{s.answer}</p>
          <p className="mt-1 text-[12px] text-neutral-500">From Mixpanel. Ask Kan for the breakdown.</p>
        </Block>
      ))}

      <Block label="Claude Code" right={`${queued.length} waiting in Do these`}>
        <ul className="space-y-2">
          {done.map((d) => (
            <li key={d.id} className="flex items-start gap-2.5 text-[14px] text-neutral-200">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] text-emerald-300">✓</span>
              <span className="flex-1">{d.title}</span>
              <span className="text-[11px] text-neutral-600">{d.when}</span>
            </li>
          ))}
        </ul>
        <button onClick={() => setShowWaiting(!showWaiting)} className="mt-3 text-[12px] text-neutral-500 hover:text-neutral-300">
          {showWaiting ? 'Hide' : 'Show'} what’s waiting
        </button>
        {showWaiting && (
          <ul className="mt-2 space-y-1.5 border-t border-neutral-800 pt-2">
            {queued.map((d) => (
              <li key={d.id} className="text-[13px] text-neutral-400">
                {d.title} <span className="text-neutral-600">· {d.from}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block label="What you saved" right="since the 11th">
        <p className="text-[14px] leading-snug text-neutral-200">
          {SHARES.length} saves. {agents.length} are about agents — OpenAI’s Agents API, System One, a Substack post. That’s the thread running through August too.
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={onTalk} className="rounded-full bg-violet-500 px-3 py-1.5 text-[12px] text-white">Talk it through</button>
          <button className="rounded-full border border-neutral-700 px-3 py-1.5 text-[12px] text-neutral-300">See them</button>
        </div>
      </Block>

      {last && (
        <button onClick={() => onConversation(last.id)} className="mx-4 mt-3 block w-[calc(100%-32px)] rounded-2xl border border-neutral-800/80 p-4 text-left hover:border-neutral-700">
          <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500">Last time we talked · {last.when}</p>
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug text-neutral-300">{last.gist}</p>
          {last.landed.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{last.landed.map((l, n) => <LandedChip key={n} l={l} />)}</div>}
        </button>
      )}
    </div>
  );
}

// ── Talking ──────────────────────────────────────────────────────────────────

function TalkSession({
  dropped, onEnd, onKeep,
}: {
  /** Set by the page's "Drop the call" button. */
  dropped: boolean;
  onEnd: () => void;
  onKeep: (kept: Catch[]) => void;
}) {
  const [line, setLine] = useState(0); // lines fully said
  const [partial, setPartial] = useState('');
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [catches, setCatches] = useState<Catch[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [moved, setMoved] = useState<Record<string, string>>({});
  const scroller = useRef<HTMLDivElement>(null);

  // Type out the script word by word, pausing while "dropped".
  useEffect(() => {
    if (done || dropped) return;
    if (line >= SCRIPT.said.length) {
      const t = setTimeout(() => setDone(true), 700);
      return () => clearTimeout(t);
    }
    const words = SCRIPT.said[line].split(' ');
    const shown = partial ? partial.split(' ').length : 0;
    const t = setTimeout(() => {
      if (shown < words.length) setPartial(words.slice(0, shown + 1).join(' '));
      else {
        setLine((l) => l + 1);
        setPartial('');
        const c = CATCHES.find((x) => x.after === line);
        if (c) setCatches((cs) => [...cs, c]);
      }
    }, shown < words.length ? 110 : 650);
    return () => clearTimeout(t);
  }, [line, partial, dropped, done]);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [done]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [line, partial, done, catches.length]);

  const live = catches.filter((c) => !removed.includes(c.id)).map((c) => ({ ...c, where: moved[c.id] ?? c.where }));

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-neutral-950">
      <div className="flex items-center gap-2 px-4 pt-10">
        <span className={`h-2 w-2 rounded-full ${dropped ? 'bg-amber-400' : done ? 'bg-neutral-600' : 'animate-pulse bg-rose-500'}`} />
        <span className="text-[12px] text-neutral-400">
          {dropped ? 'Reconnecting…' : done ? 'Paused' : 'Listening'} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </span>
        <span className="ml-2 text-[11px] text-emerald-400/80">saved as you talk</span>
        <button onClick={onEnd} className="ml-auto rounded-full border border-neutral-800 px-3 py-1 text-[12px] text-neutral-400">End</button>
      </div>

      {dropped && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-200">
          The connection dropped. Everything up to here is saved — picking up where you stopped.
        </div>
      )}

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-5 pb-4 pt-5 [scrollbar-width:none]">
        {SCRIPT.said.slice(0, line).map((s, n) => (
          <p key={n} className="text-[18px] leading-snug text-neutral-200">{s}</p>
        ))}
        {partial && <p className="text-[18px] leading-snug text-neutral-50">{partial}<span className="animate-pulse text-violet-400">▍</span></p>}
        {!done && !partial && line < SCRIPT.said.length && <p className="text-[13px] text-neutral-600">Kan is listening. It won’t do anything until you say so.</p>}
        {done && (
          <div className="pt-2">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-violet-300/80"><KanthinkIcon size={11} /> Kan</p>
            <p className="mt-1.5 text-[17px] leading-snug text-neutral-300">{SCRIPT.reply}</p>
          </div>
        )}
      </div>

      {/* What Kan caught — nothing is made until you keep it */}
      <div className="border-t border-neutral-900 bg-neutral-950 px-4 pb-7 pt-3">
        <div className="mb-2 flex items-center">
          <span className="text-[11px] uppercase tracking-[0.08em] text-neutral-500">Caught · {live.length}</span>
          <span className="ml-auto text-[11px] text-neutral-600">tap where it goes to change it</span>
        </div>
        <div className="max-h-[210px] space-y-1.5 overflow-y-auto [scrollbar-width:none]">
          {live.length === 0 && <p className="py-2 text-[13px] text-neutral-600">Nothing yet.</p>}
          {live.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-xl bg-neutral-900 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-neutral-100">{c.text}</p>
                <button
                  onClick={() => {
                    const options = [CATCHES.find((x) => x.id === c.id)!.where, ...c.alternatives];
                    const i = options.indexOf(c.where);
                    setMoved({ ...moved, [c.id]: options[(i + 1) % options.length] });
                  }}
                  className="mt-1 text-[11px] text-violet-300"
                >
                  <span className="text-neutral-500">{KIND_LABEL[c.kind]} →</span> {c.where}
                </button>
              </div>
              <button onClick={() => setRemoved([...removed, c.id])} className="px-1 text-[16px] leading-none text-neutral-600 hover:text-neutral-300" aria-label="Drop">×</button>
            </div>
          ))}
        </div>
        {done && (
          <div className="mt-3 flex gap-2">
            <button onClick={() => onKeep(live)} className="h-11 flex-1 rounded-full bg-violet-500 text-[14px] font-medium text-white">
              {live.length ? `Keep ${live.length === CATCHES.length ? 'all' : live.length}` : 'Done'}
            </button>
            <button onClick={onEnd} className="h-11 rounded-full border border-neutral-700 px-4 text-[14px] text-neutral-300">Keep none</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Apps ─────────────────────────────────────────────────────────────────────

function AppsScreen({ apps, onApp }: { apps: App[]; onApp: (id: string) => void }) {
  const [showTried, setShowTried] = useState(false);
  const live = apps.filter((a) => a.status === 'published');
  const making = apps.filter((a) => a.status === 'draft');
  const tile = (a: App) => {
    const waiting = (a.people_msgs ?? []).filter((m) => !m.replied).length;
    return (
      <button key={a.id} onClick={() => onApp(a.id)} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 text-left hover:border-neutral-700">
        <div className={`relative flex h-20 items-center justify-center bg-gradient-to-br ${a.tint} to-neutral-900 text-2xl`}>
          {a.emoji}
          {waiting > 0 && <span className="absolute right-2 top-2 rounded-full bg-violet-500 px-1.5 text-[10px] text-white">{waiting} waiting</span>}
        </div>
        <div className="p-3">
          <p className="truncate text-[14px] text-neutral-100">{a.name}</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {a.status === 'published' ? `${a.opens} opens · ${a.people} ${a.people === 1 ? 'person' : 'people'}` : `${a.builds} builds · ${a.updated}`}
          </p>
        </div>
      </button>
    );
  };
  return (
    <div className="pb-6">
      <div className="px-5 pt-2">
        <h2 className="text-[24px] font-semibold tracking-tight text-neutral-50">Apps</h2>
        <p className="text-[13px] text-neutral-500">37 started in September. These are the ones that stuck.</p>
      </div>
      <p className="mb-2 mt-5 px-5 text-[11px] uppercase tracking-[0.08em] text-neutral-500">Out there</p>
      <div className="grid grid-cols-2 gap-2.5 px-4">{live.map(tile)}</div>
      <p className="mb-2 mt-6 px-5 text-[11px] uppercase tracking-[0.08em] text-neutral-500">Making</p>
      <div className="grid grid-cols-2 gap-2.5 px-4">{making.map(tile)}</div>
      <div className="mx-4 mt-6 rounded-2xl border border-neutral-800 p-4">
        <button onClick={() => setShowTried(!showTried)} className="flex w-full items-center text-left">
          <span className="text-[14px] text-neutral-300">Tried once · 23</span>
          <span className="ml-auto text-[12px] text-neutral-500">{showTried ? 'Hide' : 'Show'}</span>
        </button>
        <p className="mt-1 text-[12px] text-neutral-500">First builds you never went back to — including four Reading Logs from one afternoon.</p>
        {showTried && <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">{TRIED_ONCE.join(' · ')}</p>}
      </div>
    </div>
  );
}

function AppView({ app, onBack, onReply, toast }: { app: App; onBack: () => void; onReply: (msgId: string, text: string) => void; toast: (s: string) => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-neutral-950">
      <div className="flex items-center gap-2 px-3 pt-10">
        <Back onClick={onBack} />
        <span className={`rounded-full px-2 py-0.5 text-[11px] ${app.status === 'published' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
          {app.status === 'published' ? 'Published' : 'Draft'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto pb-8 [scrollbar-width:none]">
        <h2 className="px-5 pt-2 text-[24px] font-semibold tracking-tight text-neutral-50">{app.name}</h2>
        <p className="px-5 text-[12px] text-neutral-500">From “{app.card}” · {app.builds} builds</p>
        <div className={`mx-4 mt-4 flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br ${app.tint} to-neutral-900 text-5xl`}>{app.emoji}</div>
        <div className="mx-4 mt-3 flex gap-2">
          <button className="flex-1 rounded-full bg-neutral-100 py-2.5 text-[13px] font-medium text-neutral-900">Play</button>
          <button onClick={() => toast('Kan is updating it from the thread…')} className="flex-1 rounded-full border border-neutral-700 py-2.5 text-[13px] text-neutral-200">Update app</button>
        </div>
        {app.status === 'published' && (
          <p className="mt-4 px-5 text-[13px] text-neutral-400">{app.opens} opens · {app.people} {app.people === 1 ? 'person' : 'people'} signed in · free</p>
        )}
        {app.people_msgs && (
          <div className="mt-5 px-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.08em] text-neutral-500">People</p>
            <div className="space-y-4">
              {app.people_msgs.map((m) => (
                <div key={m.id}>
                  <p className="text-[12px] text-neutral-500">{m.who} · {m.when}</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-neutral-100">“{m.text}”</p>
                  {m.replied ? (
                    <p className="mt-1.5 border-l-2 border-violet-500/50 pl-2.5 text-[13px] text-neutral-400">You: {m.replied}</p>
                  ) : (
                    <ReplyBox onSend={(t) => onReply(m.id, t)} placeholder="Reply — or ask Kan to change the app" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Library ──────────────────────────────────────────────────────────────────

function LibraryScreen({
  conversations, standing, onConversation, toast,
}: { conversations: Conversation[]; standing: Standing[]; onConversation: (id: string) => void; toast: (s: string) => void }) {
  const [q, setQ] = useState('');
  const [showQuiet, setShowQuiet] = useState(false);
  const [folded, setFolded] = useState(false);
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const active = PLACES.filter((p) => !p.quiet && match(p.name));
  const quiet = PLACES.filter((p) => p.quiet && match(p.name));

  return (
    <div className="pb-6">
      <div className="px-5 pt-2">
        <h2 className="text-[24px] font-semibold tracking-tight text-neutral-50">Library</h2>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-neutral-500" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Anything you said, saved or made" className="flex-1 bg-transparent text-[14px] text-neutral-100 outline-none placeholder:text-neutral-600" />
        </div>
      </div>

      <p className="mb-1 mt-6 px-5 text-[11px] uppercase tracking-[0.08em] text-neutral-500">Conversations</p>
      {conversations.filter((c) => match(c.gist)).map((c) => (
        <button key={c.id} onClick={() => onConversation(c.id)} className="block w-full px-5 py-3 text-left hover:bg-neutral-900">
          <p className="text-[12px] text-neutral-500">{c.when} · {c.context} · {c.minutes} min</p>
          <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-neutral-200">{c.gist}</p>
          {c.landed.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{c.landed.map((l, n) => <LandedChip key={n} l={l} />)}</div>}
        </button>
      ))}

      <p className="mb-1 mt-6 px-5 text-[11px] uppercase tracking-[0.08em] text-neutral-500">Kan does without asking</p>
      {standing.map((s) => (
        <div key={s.id} className="px-5 py-2.5">
          <p className="text-[14px] leading-snug text-neutral-200">{s.sentence}</p>
          <p className="mt-0.5 text-[11px] text-neutral-600">{s.when}</p>
        </div>
      ))}
      <p className="px-5 pt-1 text-[12px] text-neutral-600">Say “every morning, tell me…” in any conversation to add one.</p>

      <p className="mb-1 mt-6 px-5 text-[11px] uppercase tracking-[0.08em] text-neutral-500">Places · by where things last landed</p>
      {active.map((p) => (
        <div key={p.name} className="flex items-center px-5 py-2">
          <span className="flex-1 text-[14px] text-neutral-200">{p.name}</span>
          <span className="text-[11px] text-neutral-600">{p.lastLanding} · {p.count}</span>
        </div>
      ))}
      {!folded && quiet.length > 0 && (
        <div className="mx-4 mt-2 rounded-2xl border border-neutral-800 p-4">
          <p className="text-[14px] text-neutral-300">{quiet.length} places went quiet</p>
          <p className="mt-1 text-[12px] text-neutral-500">Channels you spun up for an idea, then moved on from.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setFolded(true); toast(`${quiet.length} places folded away. Nothing deleted.`); }} className="rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-900">Fold them away</button>
            <button onClick={() => setShowQuiet(!showQuiet)} className="rounded-full border border-neutral-700 px-3 py-1.5 text-[12px] text-neutral-300">{showQuiet ? 'Hide' : 'Show'}</button>
          </div>
          {showQuiet && <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">{quiet.map((p) => p.name).join(' · ')}</p>}
        </div>
      )}
    </div>
  );
}

function ConversationView({ c, onBack, toast }: { c: Conversation; onBack: () => void; toast: (s: string) => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-neutral-950">
      <div className="flex items-center px-3 pt-10"><Back onClick={onBack} /></div>
      <div className="flex-1 overflow-y-auto px-5 pb-8 [scrollbar-width:none]">
        <p className="text-[12px] text-neutral-500">{c.when} · {c.context} · {c.minutes} min</p>
        <p className="mt-2 text-[20px] leading-snug text-neutral-50">{c.gist}</p>
        <p className="mb-2 mt-6 text-[11px] uppercase tracking-[0.08em] text-neutral-500">What landed</p>
        {c.landed.length ? (
          <div className="space-y-2">
            {c.landed.map((l, n) => (
              <div key={n} className="rounded-xl bg-neutral-900 px-3.5 py-2.5">
                <p className="text-[14px] text-neutral-100">{l.text}</p>
                <p className="mt-0.5 text-[11px] text-neutral-500">{KIND_LABEL[l.kind]} → {l.where}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-neutral-500">Nothing — it was just a conversation, and that’s fine. It’s all here.</p>
        )}
        <button
          onClick={() => toast('Link copied. Paste it into Claude Code and it can read the whole conversation.')}
          className="mt-6 w-full rounded-full border border-neutral-700 py-2.5 text-[13px] text-neutral-200"
        >
          Hand this to Claude Code
        </button>
        <button className="mt-2 w-full rounded-full py-2.5 text-[13px] text-neutral-500">Read the transcript</button>
      </div>
    </div>
  );
}

// ── Sharing in ───────────────────────────────────────────────────────────────

function ShareSheet({ onClose }: { onClose: () => void }) {
  const [read, setRead] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRead(true), 1000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="rounded-t-3xl border-t border-neutral-800 bg-neutral-900 p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-700" />
        <p className="text-[12px] text-emerald-400">Saved</p>
        <p className="mt-1 text-[16px] text-neutral-100">Grok Bot Agents: how to delegate your work in 9 steps</p>
        <p className="text-[12px] text-neutral-500">x.com</p>
        <div className="mt-4 rounded-2xl bg-neutral-950 p-4">
          {read ? (
            <>
              <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-violet-300/80"><KanthinkIcon size={11} /> The short version</p>
              <p className="mt-1.5 text-[14px] leading-snug text-neutral-200">A thread on handing recurring jobs to an agent with a written brief. Your fourth agents post this week — close to how you already hand Work cards to Claude Code.</p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-neutral-500"><KanthinkIcon size={13} className="animate-pulse text-violet-300" /> Reading it…</p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-violet-500 text-[14px] font-medium text-white">Done</button>
          <button onClick={onClose} className="h-11 rounded-full border border-neutral-700 px-4 text-[14px] text-neutral-300">Talk about it</button>
        </div>
        <p className="mt-3 text-center text-[12px] text-neutral-600">No folder to pick. It shows up in “What you saved”.</p>
      </div>
    </div>
  );
}

// ── The phone ────────────────────────────────────────────────────────────────

export function Phone({ overlay, setOverlay, dropped }: { overlay: Overlay; setOverlay: (o: Overlay) => void; dropped: boolean }) {
  const [tab, setTab] = useState<Tab>('home');
  const [apps, setApps] = useState<App[]>(APPS);
  const [dispatches, setDispatches] = useState<Dispatch[]>(DISPATCHES);
  const [standing, setStanding] = useState<Standing[]>(STANDING);
  const [conversations, setConversations] = useState<Conversation[]>(CONVERSATIONS);
  const [appId, setAppId] = useState<string | null>(null);
  const [convoId, setConvoId] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const toast = (s: string) => {
    setToastText(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2800);
  };

  const reply = (id: string, msgId: string, text: string) => {
    setApps((xs) => xs.map((a) => (a.id === id ? { ...a, people_msgs: a.people_msgs?.map((m) => (m.id === msgId ? { ...m, replied: text } : m)) } : a)));
    toast('Sent. They’ll see it next time they open the app.');
  };

  const keep = (kept: Catch[]) => {
    setOverlay(null);
    setTab('home');
    scroller.current?.scrollTo({ top: 0 });
    if (kept.some((c) => c.kind === 'question' && c.where === 'Numbers')) {
      setStanding((xs) => [{ id: 'st-print', sentence: 'Every morning, tell me how print orders did yesterday.', answer: '6 orders · 4,000 pieces · $1,000', when: 'Weekdays 7:00' }, ...xs]);
    }
    if (kept.some((c) => c.where === 'Work · Do these')) {
      setDispatches((xs) => xs.map((d) => (d.id === 'd1' ? { ...d, from: 'reported twice · latest this morning' } : d)));
    }
    setConversations((xs) => [{
      id: `c-${Date.now()}`, when: 'Just now', context: 'Morning', minutes: 1,
      gist: 'A testing day: the Simple Editor on desktop and mobile. Voice cut in again. Maybe charge per logo. Print orders every morning.',
      landed: kept.map((c) => ({ kind: c.kind, text: c.text.split(' — ')[0], where: c.where })),
    }, ...xs]);
    toast(kept.length ? `Kept ${kept.length}. Nothing went anywhere you didn’t see.` : 'Nothing kept. The conversation is still saved.');
  };

  const app = apps.find((a) => a.id === appId);
  const convo = conversations.find((c) => c.id === convoId);

  const tabBtn = (key: Tab, label: string) => (
    <button onClick={() => { setTab(key); setAppId(null); setConvoId(null); scroller.current?.scrollTo({ top: 0 }); }} className={`flex-1 py-2 text-[12px] ${tab === key ? 'text-neutral-50' : 'text-neutral-500'}`}>
      {label}
      <span className={`mx-auto mt-1 block h-0.5 w-5 rounded-full ${tab === key ? 'bg-violet-400' : 'bg-transparent'}`} />
    </button>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-neutral-950">
      <div ref={scroller} className="flex-1 overflow-y-auto pt-9 [scrollbar-width:none]">
        {tab === 'home' && (
          <Home
            apps={apps} dispatches={dispatches} standing={standing} conversations={conversations}
            onApp={setAppId} onConversation={setConvoId} onTalk={() => setOverlay('talk')}
            onReply={reply}
          />
        )}
        {tab === 'apps' && <AppsScreen apps={apps} onApp={setAppId} />}
        {tab === 'library' && <LibraryScreen conversations={conversations} standing={standing} onConversation={setConvoId} toast={toast} />}
      </div>

      <div className="border-t border-neutral-900 bg-neutral-950 px-4 pb-5 pt-3">
        <button onClick={() => setOverlay('talk')} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-500 text-[15px] font-medium text-white shadow-lg shadow-violet-900/40 active:scale-[0.98]">
          <KanthinkIcon size={20} /> Talk to Kan
        </button>
        <div className="mt-1 flex">{tabBtn('home', 'Home')}{tabBtn('apps', 'Apps')}{tabBtn('library', 'Library')}</div>
      </div>

      {app && <AppView app={app} onBack={() => setAppId(null)} onReply={(m, t) => reply(app.id, m, t)} toast={toast} />}
      {convo && <ConversationView c={convo} onBack={() => setConvoId(null)} toast={toast} />}
      {overlay === 'talk' && <TalkSession dropped={dropped} onEnd={() => setOverlay(null)} onKeep={keep} />}
      {overlay === 'share' && <ShareSheet onClose={() => setOverlay(null)} />}

      {toastText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-32 z-[60] flex justify-center px-6">
          <div className="rounded-full bg-neutral-100 px-4 py-2 text-center text-[13px] text-neutral-900 shadow-lg">{toastText}</div>
        </div>
      )}
    </div>
  );
}
