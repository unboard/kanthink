'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Lock, Mail, Send, Users } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * One person, two conversations.
 *
 * Left: the conversation with the customer — what they wrote in the app, the
 * emails you sent, and what happened to each (delivered, opened, clicked), in
 * the same thread UI the app's Audience pane already uses. Right: a private
 * side conversation with Kan about this person. Kan drafts there; nothing
 * crosses to the left until you press Send. The two never share a colour,
 * a border or a composer, so you can't confuse which one they can see.
 *
 * Styles are lifted from AppAudiencePane (the thread) and LiveVoiceMode (the
 * email draft preview).
 */

type Stage = 'prospect' | 'using' | 'customer';
const STAGE: Record<Stage, { label: string; cls: string; note: string }> = {
  prospect: { label: 'Prospect', cls: 'bg-amber-500/15 text-amber-300', note: 'Reserved on a test page, hasn’t used the app' },
  using: { label: 'Using', cls: 'bg-sky-500/15 text-sky-300', note: 'Proved their email and opened the app' },
  customer: { label: 'Customer', cls: 'bg-emerald-500/15 text-emerald-300', note: 'Has paid' },
};

interface Email { id: string; subject: string; body: string; sentAt: string; opened?: string; clicked?: string; by: 'you' | 'shroom' }
type ThreadItem =
  | { kind: 'event'; text: string; at: string }
  | { kind: 'theirs'; text: string; at: string }
  | { kind: 'email'; email: Email };

const PEOPLE: { id: string; name: string; email: string; app: string; stage: Stage; line: string; thread: ThreadItem[] }[] = [
  {
    id: 'maya', name: 'Maya R.', email: 'maya.r@example.com', app: 'Sub Plan Writer', stage: 'prospect',
    line: 'Reserved Oct 6. Opened your last email.',
    thread: [
      { kind: 'event', text: 'Reserved Sub Plan Writer on the test page, first plan free', at: 'Oct 6' },
      { kind: 'email', email: { id: 'e1', by: 'shroom', subject: 'Your sub plan writer is ready', body: 'You reserved Sub Plan Writer last week. It’s ready, and your first plan is free: [link]', sentAt: 'Oct 13, 8:00 AM', opened: 'Oct 13, 9:12 AM' } },
    ],
  },
  {
    id: 'jordan', name: 'Coach Jordan', email: 'jordan.k@example.com', app: 'Fair Rotations', stage: 'customer',
    line: 'Paid $9. Asked for a print view fix.',
    thread: [
      { kind: 'event', text: 'Reserved Fair Rotations at $9 a season', at: 'Oct 2' },
      { kind: 'email', email: { id: 'e2', by: 'shroom', subject: 'Fair Rotations is ready', body: 'You reserved it, so you get it first, at $9 a season. [link]', sentAt: 'Oct 10, 8:00 AM', opened: 'Oct 10, 7:41 PM', clicked: 'Oct 10, 7:42 PM' } },
      { kind: 'event', text: 'Proved their email in the app. Prospect → Using', at: 'Oct 10' },
      { kind: 'event', text: 'Paid $9. Using → Customer', at: 'Oct 10' },
      { kind: 'theirs', text: 'Love it. The print view cuts off the last inning on my phone though.', at: 'Oct 11, 6:05 PM' },
    ],
  },
  {
    id: 'sam', name: 'Sam T.', email: 'sam.t@example.com', app: 'Sub Plan Writer', stage: 'using',
    line: 'Made 1 free plan. Hasn’t paid.',
    thread: [
      { kind: 'event', text: 'Reserved Sub Plan Writer', at: 'Oct 6' },
      { kind: 'email', email: { id: 'e3', by: 'shroom', subject: 'Your sub plan writer is ready', body: 'It’s ready, and your first plan is free: [link]', sentAt: 'Oct 13, 8:00 AM', opened: 'Oct 13, 8:30 AM', clicked: 'Oct 13, 8:31 AM' } },
      { kind: 'event', text: 'Proved their email and made a plan. Prospect → Using', at: 'Oct 13' },
    ],
  },
];

/** What Kan says on the private side, per person. The first turn is a shroom's draft waiting for you. */
const KAN_OPENING: Record<string, { text: string; draft?: { subject: string; body: string } }> = {
  maya: {
    text: 'Maya opened the launch email but hasn’t made a plan. The Follow-up shroom drafted a nudge. Want to send it?',
    draft: { subject: 'Quick one: your free sub plan', body: 'Hi Maya, no pressure, but your free plan is still waiting. Paste in tomorrow’s schedule and it writes the plan in about a minute: [link]' },
  },
  jordan: {
    text: 'Jordan paid and reported the print bug. The fix shipped this morning. I can tell them it’s fixed if you want.',
  },
  sam: {
    text: 'Sam made a free plan yesterday. Nothing waiting for you.',
  },
};

const CANNED_DRAFT = (name: string) => ({
  subject: 'Thanks for trying it',
  body: `Hi ${name.split(' ')[0]}, thanks for giving it a go. If anything about it got in your way, just reply and tell me. I read every one.`,
});

function EmailBubble({ email }: { email: Email }) {
  return (
    <div className="pl-8">
      <div className="overflow-hidden rounded-xl bg-violet-600 text-white">
        <div className="flex items-center gap-1.5 border-b border-white/15 px-3 py-1.5 text-[11px] text-violet-100">
          <Mail className="h-3 w-3" /> Email: {email.subject}
        </div>
        <p className="whitespace-pre-wrap break-words px-3 py-2 text-sm">{email.body}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-400">
        <span>{email.by === 'shroom' ? 'Sent by a shroom, approved by you' : 'You'}, {email.sentAt}</span>
        <span className="inline-flex items-center gap-1 text-neutral-400"><Check className="h-2.5 w-2.5" />Delivered</span>
        {email.opened && <span className="inline-flex items-center gap-1 text-sky-400"><Check className="h-2.5 w-2.5" />Opened {email.opened.split(', ')[1] ?? ''}</span>}
        {email.clicked && <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-2.5 w-2.5" />Clicked</span>}
      </div>
    </div>
  );
}

function CustomerThread({ person, items }: { person: (typeof PEOPLE)[number]; items: ThreadItem[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((it, n) => {
        if (it.kind === 'event') {
          return <p key={n} className="py-1 text-center text-[11px] text-neutral-500">{it.text}<span className="text-neutral-600">, {it.at}</span></p>;
        }
        if (it.kind === 'email') return <EmailBubble key={n} email={it.email} />;
        return (
          <div key={n} className="pr-8">
            <div className="whitespace-pre-wrap break-words rounded-xl bg-neutral-800 px-3 py-2 text-sm text-neutral-100">{it.text}</div>
            <p className="mt-1 text-[10px] text-neutral-400">{person.name}, in the app, {it.at}</p>
          </div>
        );
      })}
    </div>
  );
}

interface KanTurn { who: 'kan' | 'you'; text: string; draft?: { subject: string; body: string; status: 'draft' | 'sent' | 'dropped' } }

function PrivateKan({ person, onSend }: { person: (typeof PEOPLE)[number]; onSend: (d: { subject: string; body: string }) => void }) {
  const opening = KAN_OPENING[person.id];
  const [turns, setTurns] = useState<KanTurn[]>(() => [{ who: 'kan', text: opening.text, draft: opening.draft ? { ...opening.draft, status: 'draft' } : undefined }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns, thinking]);

  const setDraft = (i: number, status: 'sent' | 'dropped') => setTurns((t) => t.map((x, n) => (n === i && x.draft ? { ...x, draft: { ...x.draft, status } } : x)));

  const ask = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setTurns((t) => [...t, { who: 'you', text }]);
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setTurns((t) => [...t, { who: 'kan', text: 'Here’s a draft. Nothing goes to them until you press Send.', draft: { ...CANNED_DRAFT(person.name), status: 'draft' } }]);
    }, 1100);
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-dashed border-violet-500/40 bg-violet-950/20">
      <div className="flex items-center gap-2 border-b border-dashed border-violet-500/30 px-4 py-3">
        <Lock className="h-3.5 w-3.5 text-violet-300" />
        <p className="text-sm font-medium text-violet-100">Just you and Kan</p>
        <p className="ml-auto text-[11px] text-violet-300/70">{person.name.split(' ')[0]} never sees this</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t, i) => (
          <div key={i} className={t.who === 'you' ? 'flex justify-end' : 'flex gap-2.5'}>
            {t.who === 'kan' && <KanthinkIcon size={18} className="mt-0.5 flex-shrink-0 text-violet-400" />}
            <div className={t.who === 'you' ? 'max-w-[85%] rounded-2xl bg-neutral-800 px-3.5 py-2 text-sm text-neutral-100' : 'min-w-0 flex-1'}>
              {t.who === 'kan' ? <p className="text-sm text-neutral-200">{t.text}</p> : t.text}
              {t.draft && (
                <div className="mt-2.5 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/90">
                  <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
                    <span className="flex items-center gap-2 text-xs text-neutral-400"><Mail className="h-3.5 w-3.5 text-violet-400" />To: <span className="text-neutral-200">{person.email}</span></span>
                    {t.draft.status === 'sent' && <span className="text-xs text-green-400">Sent</span>}
                    {t.draft.status === 'dropped' && <span className="text-xs text-neutral-500">Not sent</span>}
                    {t.draft.status === 'draft' && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">Preview</span>}
                  </div>
                  <div className="px-4 py-3">
                    <p className="mb-1 text-sm font-medium text-white">{t.draft.subject}</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{t.draft.body}</p>
                  </div>
                  {t.draft.status === 'draft' && (
                    <div className="flex gap-2 border-t border-neutral-800 px-4 py-3">
                      <button onClick={() => { setDraft(i, 'sent'); onSend(t.draft!); }} className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700">Send email</button>
                      <button onClick={() => setDraft(i, 'dropped')} className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700">Don’t send</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && <div className="flex gap-2.5"><KanthinkIcon size={18} className="mt-0.5 text-violet-400" /><p className="text-sm text-neutral-500">Kan is writing…</p></div>}
        <div ref={end} />
      </div>

      <div className="p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            rows={2}
            placeholder={`Ask Kan, e.g. “write ${person.name.split(' ')[0]} a thank-you”`}
            className="flex-1 resize-none rounded-xl border border-violet-500/30 bg-neutral-900 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-violet-400"
          />
          <button onClick={ask} disabled={!input.trim()} className="flex-shrink-0 rounded-xl bg-neutral-800 p-2.5 text-violet-300 transition-colors hover:bg-neutral-700 disabled:opacity-40" title="Ask Kan">
            <KanthinkIcon size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-violet-300/60">Kan only drafts here. Anything for {person.name.split(' ')[0]} shows as a preview first.</p>
      </div>
    </div>
  );
}

function PersonView({ person, onBack }: { person: (typeof PEOPLE)[number]; onBack: () => void }) {
  const [items, setItems] = useState<ThreadItem[]>(person.thread);
  const [reply, setReply] = useState('');

  const addEmail = (d: { subject: string; body: string }, by: 'you' | 'shroom') => {
    const id = `x${Date.now()}`;
    setItems((it) => [...it, { kind: 'email', email: { id, by, subject: d.subject, body: d.body, sentAt: 'Just now' } }]);
    // Customer.IO reports opens back; here one arrives a few seconds later.
    setTimeout(() => setItems((it) => it.map((x) => (x.kind === 'email' && x.email.id === id ? { ...x, email: { ...x.email, opened: 'Just now, a moment ago' } } : x))), 4000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200"><ArrowLeft className="h-3.5 w-3.5" />Everyone</button>
        <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">{person.name}</p>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STAGE[person.stage].cls}`}>{STAGE[person.stage].label}</span>
          </div>
          <p className="text-xs text-neutral-400">{person.email}, {person.app}</p>
          <p className="mt-1 text-xs text-neutral-500">{STAGE[person.stage].note}</p>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Their conversation: exactly the Audience pane thread */}
        <div className="flex min-h-[420px] flex-col">
          <p className="mb-2 text-xs font-medium text-neutral-400">Conversation with {person.name.split(' ')[0]}</p>
          <div className="min-h-0 flex-1 overflow-y-auto"><CustomerThread person={person} items={items} /></div>
          <div className="mt-4 flex items-end gap-2">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder={`Reply to ${person.name.split(' ')[0]}`} className="flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-400" />
            <button onClick={() => { if (reply.trim()) { addEmail({ subject: `Re: ${person.app}`, body: reply.trim() }, 'you'); setReply(''); } }} disabled={!reply.trim()} className="flex-shrink-0 rounded-xl bg-violet-600 p-2.5 text-white transition-colors hover:bg-violet-500 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-neutral-400">Goes to {person.email} and shows in the app’s message box.</p>
        </div>

        {/* The private side: Kan only, never the customer */}
        <div className="min-h-[420px]"><PrivateKan person={person} onSend={(d) => addEmail(d, 'shroom')} /></div>
      </div>
    </div>
  );
}

export default function PeoplePrototype() {
  const [open, setOpen] = useState<string | null>(null);
  const person = PEOPLE.find((p) => p.id === open);
  const counts = { prospect: 0, using: 0, customer: 0 } as Record<Stage, number>;
  PEOPLE.forEach((p) => { counts[p.stage] += 1; });

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[rgb(10,10,10)] text-neutral-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-neutral-800 px-4 py-2.5">
        <Link href="/prototypes" className="text-xs text-neutral-500 hover:text-neutral-300">Prototypes</Link>
        <p className="text-xs text-neutral-500">People across your apps. Open someone to see their conversation, and a private one with Kan beside it.</p>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
        {person ? (
          <PersonView key={person.id} person={person} onBack={() => setOpen(null)} />
        ) : (
          <div className="overflow-y-auto px-4 py-4">
            <div className="mb-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-400" />
              <h1 className="text-[15px] font-semibold text-white">People</h1>
            </div>
            <p className="mb-4 text-xs text-neutral-500">Everyone who reserved, used or bought one of your apps.</p>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(Object.keys(STAGE) as Stage[]).map((s) => (
                <div key={s} className="rounded-xl border border-neutral-800 px-3 py-2.5 text-center">
                  <p className="text-base font-semibold text-white">{counts[s]}</p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">{STAGE[s].label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {PEOPLE.map((p) => (
                <button key={p.id} onClick={() => setOpen(p.id)} className="group flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-800/40 px-3 py-2.5 text-left transition-colors hover:border-violet-400/60">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold text-neutral-300">{p.name.charAt(0)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white group-hover:text-violet-400">{p.name} <span className="text-neutral-500">· {p.app}</span></p>
                    <p className="truncate text-xs text-neutral-400">{p.line}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STAGE[p.stage].cls}`}>{STAGE[p.stage].label}</span>
                  {KAN_OPENING[p.id].draft && <span className="flex-shrink-0 rounded-md bg-violet-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Draft waiting</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
