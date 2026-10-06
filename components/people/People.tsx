'use client';

import { formatAppPrice } from '@/lib/playground/appAccess';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Lock, Mail, Send, Settings, Users } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * People: everyone who reserved, used or bought one of your apps.
 *
 * Open someone and there are two conversations side by side. On the left, theirs:
 * what they wrote in the app, the emails you sent and what happened to each, and the
 * moments their stage changed — the same thread UI as the app's Audience pane. On
 * the right, a private one with Kan, which they never see. Kan and the follow-up
 * crew draft there; nothing reaches them until you press Send.
 */

type Stage = 'prospect' | 'using' | 'customer' | 'lapsed';
const STAGE: Record<Stage, { label: string; cls: string; note: string }> = {
  prospect: { label: 'Prospect', cls: 'bg-amber-500/15 text-amber-300', note: 'Reserved or gave their email, hasn’t used the app yet' },
  using: { label: 'Using', cls: 'bg-sky-500/15 text-sky-300', note: 'Proved their email and is using the app' },
  customer: { label: 'Customer', cls: 'bg-emerald-500/15 text-emerald-300', note: 'Has paid' },
  lapsed: { label: 'Lapsed', cls: 'bg-neutral-700 text-neutral-300', note: 'Refunded or canceled' },
};

interface PersonSummary {
  id: string; name: string | null; email: string; appId: string; appTitle: string; stage: Stage;
  unsubscribed: boolean; draftWaiting: boolean; unread: number; lastActivity: string;
  orders?: { count: number; total: number; currency: string; toFulfil: number } | null;
  lastEmail: { subject: string; status: string; openedAt: string | null; clickedAt: string | null; sentAt: string | null } | null;
}
interface Email {
  id: string; subject: string; body: string; status: 'draft' | 'sent' | 'dropped' | 'failed'; source: 'you' | 'kan' | 'crew';
  reason: string | null; sentAt: string | null; deliveredAt: string | null; openedAt: string | null; clickedAt: string | null; bouncedAt: string | null; createdAt: string;
}
type ThreadItem =
  | { kind: 'event'; at: string; text: string }
  | { kind: 'theirs'; at: string; text: string }
  | { kind: 'reply'; at: string; text: string }
  | { kind: 'email'; at: string; email: Email };
interface SideItem { id: string; role: 'you' | 'kan'; at: string; content: string; email: Email | null }
interface Detail {
  person: { id: string; name: string | null; email: string; stage: Stage; unsubscribed: boolean; appId: string; appTitle: string; appUrl: string | null; live: boolean; priceLabel: string | null; orders?: { id: string; number: number; item: string; quantity: number; amount: string; status: string; paidAt: string | null }[] };
  thread: ThreadItem[];
  side: SideItem[];
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const first = (name: string | null, email: string) => (name || '').trim().split(/\s+/)[0] || email.split('@')[0];

function StagePill({ stage }: { stage: Stage }) {
  return <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STAGE[stage].cls}`}>{STAGE[stage].label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────

export function People() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('p');
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [studio, setStudio] = useState<{ followUpMode: 'ask' | 'auto'; sparkEmail: boolean } | null | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(params.get('settings') === '1');
  const [error, setError] = useState<string | null>(null);

  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    Promise.all([fetch('/api/people'), fetch('/api/studio')])
      .then(async ([p, s]) => {
        if (!live) return;
        if (p.status === 404) { setError('People isn’t available on this account yet.'); setPeople([]); return; }
        if (!p.ok) { setError(p.status === 401 ? 'Sign in to see your people.' : 'Couldn’t load your people.'); setPeople([]); setStudio(undefined); return; }
        const list = (await p.json()).people ?? [];
        const st = s.ok ? (await s.json()).studio : null;
        if (!live) return;
        setPeople(list);
        setStudio(st);
      })
      .catch(() => { if (live) { setError('Couldn’t load your people.'); setPeople([]); } });
    return () => { live = false; };
  }, [reloads]);

  const open = (id: string | null) => router.push(id ? `/people?p=${id}` : '/people');

  if (openId) return <PersonView id={openId} onBack={() => { open(null); load(); }} />;

  const counts: Record<Stage, number> = { prospect: 0, using: 0, customer: 0, lapsed: 0 };
  (people ?? []).forEach((p) => { counts[p.stage] += 1; });
  const drafts = (people ?? []).filter((p) => p.draftWaiting).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Users className="h-4 w-4 text-neutral-400" />
        <h1 className="text-[15px] font-semibold text-white">People</h1>
        {studio && (
          <button onClick={() => setShowSettings(!showSettings)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200">
            <Settings className="h-3.5 w-3.5" />Follow-ups
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-neutral-500">
        Everyone who reserved, used or bought one of your apps.{drafts > 0 ? ` ${drafts} ${drafts === 1 ? 'draft is' : 'drafts are'} waiting for you.` : ''}
      </p>

      {showSettings && studio && <FollowUpSettings studio={studio} onChange={(s) => setStudio(s)} />}

      {studio === null && <StudioSetup onDone={load} />}

      {people === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" />Loading</div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-neutral-500">{error}</p>
      ) : people.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-800"><Users className="h-5 w-5 text-neutral-400" /></div>
          <p className="text-sm text-neutral-400">Nobody yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">People show up here when they reserve one of your test pages, sign in to one of your apps, or buy one.</p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {(['prospect', 'using', 'customer'] as Stage[]).map((s) => (
              <div key={s} className="rounded-xl border border-neutral-800 px-3 py-2.5 text-center">
                <p className="text-base font-semibold text-white">{counts[s]}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-400">{STAGE[s].label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            {people.map((p) => (
              <button key={p.id} onClick={() => open(p.id)} className="group flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-800/40 px-3 py-2.5 text-left transition-colors hover:border-violet-400/60">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold text-neutral-300">{first(p.name, p.email).charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white group-hover:text-violet-400">{p.name || p.email} <span className="text-neutral-500">· {p.appTitle}</span></p>
                  <p className="truncate text-xs text-neutral-400">
                    {p.orders ? `${p.orders.count} order${p.orders.count === 1 ? '' : 's'} · ${formatAppPrice(p.orders.total, p.orders.currency, null)}${p.orders.toFulfil ? ` · ${p.orders.toFulfil} to fulfill` : ''} · ` : ''}
                    {p.unsubscribed ? 'Unsubscribed' : p.lastEmail ? `${p.lastEmail.subject}: ${p.lastEmail.clickedAt ? 'clicked' : p.lastEmail.openedAt ? 'opened' : 'sent'} ${when(p.lastEmail.clickedAt || p.lastEmail.openedAt || p.lastEmail.sentAt)}` : p.email}
                  </p>
                </div>
                <StagePill stage={p.stage} />
                {p.unread > 0 && <span className="flex-shrink-0 rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{p.unread} new</span>}
                {p.draftWaiting && <span className="flex-shrink-0 rounded-md bg-violet-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">Draft waiting</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FollowUpSettings({ studio, onChange }: { studio: { followUpMode: 'ask' | 'auto'; sparkEmail: boolean }; onChange: (s: { followUpMode: 'ask' | 'auto'; sparkEmail: boolean }) => void }) {
  const save = async (next: { followUpMode: 'ask' | 'auto'; sparkEmail: boolean }) => {
    onChange(next);
    await fetch('/api/studio', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }).catch(() => {});
  };
  return (
    <div className="mb-5 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-sm font-medium text-white">Follow-up emails</p>
      <p className="mt-0.5 text-xs text-neutral-500">The crew writes to people who reserved once an app is live, and nudges once if they never clicked. Nothing else.</p>
      <div className="mt-3 flex gap-1.5">
        {([['ask', 'Ask me first'], ['auto', 'Send, and tell me']] as const).map(([id, label]) => (
          <button key={id} onClick={() => save({ ...studio, followUpMode: id })} className={`rounded-md px-3 py-1.5 text-xs ${studio.followUpMode === id ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40' : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'}`}>{label}</button>
        ))}
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-xs text-neutral-300">
        <input type="checkbox" checked={studio.sparkEmail} onChange={(e) => save({ ...studio, sparkEmail: e.target.checked })} className="h-4 w-4 accent-violet-500" />
        Email me the morning spark too (it’s always waiting on Home)
      </label>
    </div>
  );
}

function StudioSetup({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    const res = await fetch('/api/studio', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.channelId) { setDone(data.channelId); onDone(); }
  };
  return (
    <div className="mb-5 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <p className="text-sm font-medium text-white">Start a Studio</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-400">A channel where a scout reads the web each morning for problems people would pay a few dollars to solve, and brings you one as a spark on Home. Say yes and it gets a test page with a Reserve button. People who reserve show up here.</p>
      {done ? (
        <Link href={`/channel/${done}`} className="mt-3 inline-block text-xs text-violet-400 hover:underline">Open your Studio channel</Link>
      ) : (
        <button onClick={go} disabled={busy} className="mt-3 flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Set it up
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EmailBubble({ email }: { email: Email }) {
  const by = email.source === 'you' ? 'You' : email.source === 'kan' ? 'Drafted by Kan, sent by you' : 'Drafted by the follow-up crew, sent by you';
  return (
    <div className="pl-8">
      <div className={`overflow-hidden rounded-xl text-white ${email.status === 'failed' ? 'bg-red-900/60' : 'bg-violet-600'}`}>
        <div className="flex items-center gap-1.5 border-b border-white/15 px-3 py-1.5 text-[11px] text-violet-100">
          <Mail className="h-3 w-3" />Email: {email.subject}
        </div>
        <p className="whitespace-pre-wrap break-words px-3 py-2 text-sm">{email.body}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-400">
        <span>{by}, {when(email.sentAt || email.createdAt)}</span>
        {email.status === 'failed' && <span className="text-red-400">Didn’t send</span>}
        {email.deliveredAt && <span className="inline-flex items-center gap-1"><Check className="h-2.5 w-2.5" />Delivered</span>}
        {email.openedAt && <span className="inline-flex items-center gap-1 text-sky-400"><Check className="h-2.5 w-2.5" />Opened {when(email.openedAt)}</span>}
        {email.clickedAt && <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-2.5 w-2.5" />Clicked</span>}
        {email.bouncedAt && <span className="text-red-400">Bounced</span>}
      </div>
    </div>
  );
}

function DraftCard({ email, to, disabled, onSend, onDrop }: { email: Email; to: string; disabled?: string | null; onSend: (e: { subject: string; body: string }) => Promise<void>; onDrop: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2.5 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/90">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-xs text-neutral-400"><Mail className="h-3.5 w-3.5 flex-shrink-0 text-violet-400" />To: <span className="truncate text-neutral-200">{to}</span></span>
        {email.status === 'sent' && <span className="text-xs text-green-400">Sent</span>}
        {email.status === 'dropped' && <span className="text-xs text-neutral-500">Not sent</span>}
        {email.status === 'failed' && <span className="text-xs text-red-400">Didn’t send</span>}
        {email.status === 'draft' && <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">Preview</span>}
      </div>
      {editing ? (
        <div className="space-y-2 px-4 py-3">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-400" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-2 text-xs leading-relaxed text-neutral-200 outline-none focus:border-violet-400" />
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="mb-1 text-sm font-medium text-white">{subject}</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-400">{body}</p>
        </div>
      )}
      {email.status === 'draft' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 px-4 py-3">
          <button
            disabled={busy || !!disabled}
            onClick={async () => { setBusy(true); await onSend({ subject, body }); setBusy(false); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Send email
          </button>
          <button onClick={() => setEditing(!editing)} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700">{editing ? 'Done' : 'Edit'}</button>
          <button disabled={busy} onClick={async () => { setBusy(true); await onDrop(); setBusy(false); }} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700">Don’t send</button>
          {disabled && <p className="w-full text-[11px] text-amber-300">{disabled}</p>}
        </div>
      )}
    </div>
  );
}

function PersonView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState<'reply' | 'kan' | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const sideEnd = useRef<HTMLDivElement>(null);

  const apply = useCallback(async (res: Response) => {
    const data = await res.json().catch(() => ({}));
    if (data.person) setDetail(data as Detail);
    setError(res.ok ? null : data.error || 'Something went wrong.');
  }, []);

  useEffect(() => { fetch(`/api/people/${id}`).then(apply).catch(() => setError('Couldn’t load this person.')); }, [id, apply]);
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'nearest' }); sideEnd.current?.scrollIntoView({ block: 'nearest' }); }, [detail]);

  const post = (payload: Record<string, unknown>) =>
    fetch(`/api/people/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(apply);

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200"><ArrowLeft className="h-3.5 w-3.5" />Everyone</button>
        {error ? <p className="text-sm text-neutral-500">{error}</p> : <div className="flex items-center gap-2 py-10 text-sm text-neutral-400"><Loader2 className="h-4 w-4 animate-spin" />Loading</div>}
      </div>
    );
  }

  const p = detail.person;
  const name = first(p.name, p.email);
  const blocked = p.unsubscribed ? `${name} asked not to be emailed about ${p.appTitle}.` : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-4">
      <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-200"><ArrowLeft className="h-3.5 w-3.5" />Everyone</button>
      <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-800/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white">{p.name || p.email}</p>
          <StagePill stage={p.stage} />
          {p.unsubscribed && <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">Unsubscribed</span>}
        </div>
        <p className="text-xs text-neutral-400">{p.email}, {p.appUrl ? <a href={p.appUrl} target="_blank" rel="noreferrer" className="hover:text-violet-400">{p.appTitle}</a> : p.appTitle}{p.live ? '' : ' (test page)'}{p.priceLabel ? `, ${p.priceLabel}` : ''}</p>
        <p className="mt-1 text-xs text-neutral-500">{STAGE[p.stage].note}</p>
        {p.orders && p.orders.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-neutral-800 pt-2">
            {p.orders.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-xs">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${o.status === 'paid' ? 'bg-amber-400' : o.status === 'fulfilled' ? 'bg-emerald-500' : 'bg-neutral-500'}`} />
                <span className="tabular-nums text-neutral-500">#{o.number}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-200">{o.quantity > 1 ? `${o.quantity} × ` : ''}{o.item}</span>
                <span className="tabular-nums text-neutral-400">{o.amount}</span>
                <span className="text-neutral-500">{o.status === 'paid' ? 'To fulfill' : o.status === 'fulfilled' ? 'Fulfilled' : 'Refunded'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Their conversation */}
        <div className="flex min-h-[460px] flex-col">
          <p className="mb-2 text-xs font-medium text-neutral-400">Conversation with {name}</p>
          <div className="max-h-[60vh] min-h-0 flex-1 space-y-2.5 overflow-y-auto">
            {detail.thread.length === 0 && <p className="py-6 text-center text-xs text-neutral-500">Nothing yet.</p>}
            {detail.thread.map((t, n) => {
              if (t.kind === 'event') return <p key={n} className="py-1 text-center text-[11px] text-neutral-500">{t.text}<span className="text-neutral-600">, {when(t.at)}</span></p>;
              if (t.kind === 'email') return <EmailBubble key={n} email={t.email} />;
              if (t.kind === 'reply') {
                return (
                  <div key={n} className="pl-8">
                    <div className="whitespace-pre-wrap break-words rounded-xl bg-violet-600 px-3 py-2 text-sm text-white">{t.text}</div>
                    <p className="mt-1 text-[10px] text-neutral-400">You, in the app, {when(t.at)}</p>
                  </div>
                );
              }
              return (
                <div key={n} className="pr-8">
                  <div className="whitespace-pre-wrap break-words rounded-xl bg-neutral-800 px-3 py-2 text-sm text-neutral-100">{t.text}</div>
                  <p className="mt-1 text-[10px] text-neutral-400">{name}, in the app, {when(t.at)}</p>
                </div>
              );
            })}
            <div ref={threadEnd} />
          </div>
          <div className="mt-4 flex items-end gap-2">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} disabled={!!blocked} placeholder={blocked ? 'Unsubscribed' : `Email ${name}`} className="flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-violet-400 disabled:opacity-50" />
            <button
              onClick={async () => { if (!reply.trim()) return; setBusy('reply'); await post({ action: 'direct', subject: `About ${p.appTitle}`, body: reply }); setReply(''); setBusy(null); }}
              disabled={!reply.trim() || busy === 'reply' || !!blocked}
              className="flex-shrink-0 rounded-xl bg-violet-600 p-2.5 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
            >
              {busy === 'reply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-neutral-400">Sends straight to {p.email}. To have Kan write it, ask on the right.</p>
        </div>

        {/* The private side: you and Kan, never them */}
        <div className="flex min-h-[460px] flex-col rounded-2xl border border-dashed border-violet-500/40 bg-violet-950/20">
          <div className="flex items-center gap-2 border-b border-dashed border-violet-500/30 px-4 py-3">
            <Lock className="h-3.5 w-3.5 text-violet-300" />
            <p className="text-sm font-medium text-violet-100">Just you and Kan</p>
            <p className="ml-auto text-[11px] text-violet-300/70">{name} never sees this</p>
          </div>
          <div className="max-h-[56vh] min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {detail.side.length === 0 && <p className="text-xs leading-relaxed text-neutral-500">Ask Kan anything about {name}, or to write them something. Drafts show here as a preview first.</p>}
            {detail.side.map((s) => (
              <div key={s.id} className={s.role === 'you' ? 'flex justify-end' : 'flex gap-2.5'}>
                {s.role === 'kan' && <KanthinkIcon size={18} className="mt-0.5 flex-shrink-0 text-violet-400" />}
                <div className={s.role === 'you' ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-neutral-800 px-3.5 py-2 text-sm text-neutral-100' : 'min-w-0 flex-1'}>
                  {s.role === 'kan' ? <p className="whitespace-pre-wrap text-sm text-neutral-200">{s.content}</p> : s.content}
                  {s.email && (
                    <DraftCard
                      key={`${s.email.id}-${s.email.status}`}
                      email={s.email}
                      to={p.email}
                      disabled={blocked}
                      onSend={(edits) => post({ action: 'send', emailId: s.email!.id, ...edits })}
                      onDrop={() => post({ action: 'drop', emailId: s.email!.id })}
                    />
                  )}
                </div>
              </div>
            ))}
            {busy === 'kan' && <div className="flex gap-2.5"><KanthinkIcon size={18} className="mt-0.5 text-violet-400" /><p className="text-sm text-neutral-500">Kan is writing…</p></div>}
            <div ref={sideEnd} />
          </div>
          <div className="p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={async (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!ask.trim() || busy) return; const m = ask; setAsk(''); setBusy('kan'); await post({ action: 'kan', message: m }); setBusy(null); } }}
                rows={2}
                placeholder={`Ask Kan, e.g. “write ${name} a thank-you”`}
                className="flex-1 resize-none rounded-xl border border-violet-500/30 bg-neutral-900 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-violet-400"
              />
              <button
                onClick={async () => { if (!ask.trim() || busy) return; const m = ask; setAsk(''); setBusy('kan'); await post({ action: 'kan', message: m }); setBusy(null); }}
                disabled={!ask.trim() || !!busy}
                className="flex-shrink-0 rounded-xl bg-neutral-800 p-2.5 text-violet-300 transition-colors hover:bg-neutral-700 disabled:opacity-40"
                title="Ask Kan"
              >
                {busy === 'kan' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KanthinkIcon size={16} />}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-violet-300/60">Kan only drafts here. Anything for {name} shows as a preview first.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
