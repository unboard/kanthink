'use client';

import { useEffect, useMemo, useState } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import {
  AGENTS, LANES, PROPOSALS, DAY, OUTCOMES, STARTING_RULES, DECLINE_REASONS, TRUST_LABEL,
  type Agent, type Evidence, type Proposal, type Trust,
} from './data';

/**
 * The desk: the crew down the left, what's waiting on you in the middle, what
 * happened while you worked on the right. "Run the day" plays Thursday from
 * 8:15 to 6pm so proposals arrive and approvals have consequences.
 */

const START = 495; // 8:15am — the two real buyers are already waiting
const END = 1080; // 6pm
const SECONDS_PER_DECISION = 15;

interface FeedItem { at: number; agent: string; text: string; evidence: Evidence; cost: number; earn?: number }
interface Decision { state: 'sent' | 'edited' | 'declined' | 'trusted'; reason?: string }

const agentById = (id: string) => AGENTS.find((a) => a.id === id)!;
const laneOf = (agentId: string) => LANES.find((l) => l.id === agentById(agentId).lane)!;

function clockLabel(m: number) {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h > 12 ? h - 12 : h}:${mm}${h >= 12 ? 'pm' : 'am'}`;
}

function Badge({ evidence }: { evidence: Evidence }) {
  return evidence === 'real' ? (
    <span className="rounded-full bg-neutral-800 px-1.5 py-px text-[10px] text-neutral-400">from your account</span>
  ) : (
    <span className="rounded-full border border-dashed border-neutral-700 px-1.5 py-px text-[10px] text-neutral-500">example</span>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-neutral-800/80 bg-neutral-900/40 px-3 py-2.5">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight ${tone ?? 'text-neutral-100'}`}>{value}</p>
      {sub && <p className="truncate text-[10px] text-neutral-600">{sub}</p>}
    </div>
  );
}

export function Desk() {
  const [clock, setClock] = useState(START);
  const [running, setRunning] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [trust, setTrust] = useState<Record<string, Trust>>(() => Object.fromEntries(AGENTS.map((a) => [a.id, a.trust])));
  const [streak, setStreak] = useState<Record<string, number>>({});
  const [offer, setOffer] = useState<string | null>(null);
  const [offered, setOffered] = useState<string[]>([]);
  const [later, setLater] = useState<FeedItem[]>([]);
  const [rules, setRules] = useState<string[]>(STARTING_RULES);
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setClock((c) => {
        if (c + 3 >= END) { setRunning(false); return END; }
        return c + 3;
      });
    }, 90);
    return () => clearInterval(t);
  }, [running]);

  const feed = useMemo<FeedItem[]>(
    // Once the day is over, what you set in motion still plays out into the evening.
    () => [...DAY, ...later].filter((e) => e.at <= clock || clock >= END).sort((a, b) => b.at - a.at),
    [clock, later],
  );
  const earned = feed.reduce((s, e) => s + (e.earn ?? 0), 0);
  const spent = feed.reduce((s, e) => s + e.cost, 0);
  const decided = Object.values(decisions).filter((d) => d.state !== 'trusted').length;
  const waiting = PROPOSALS.filter((p) => p.at <= clock && !decisions[p.id]);
  const done = PROPOSALS.filter((p) => decisions[p.id]);

  const status = (a: Agent) => {
    const last = feed.find((e) => e.agent === a.id && clock - e.at < 45);
    return last ? last.text : a.idle;
  };

  const schedule = (items: FeedItem[]) => setLater((l) => [...l, ...items]);

  const approve = (p: Proposal) => {
    const draft = drafts[p.id] ?? p.draft;
    const edited = draft.trim() !== p.draft.trim();
    setDecisions((d) => ({ ...d, [p.id]: { state: edited ? 'edited' : 'sent' } }));
    schedule((OUTCOMES[p.id] ?? []).map((o) => ({ at: clock + o.after, agent: o.agent, text: o.text, earn: o.earn, evidence: 'example', cost: 0.01 })));

    if (edited) {
      setStreak((s) => ({ ...s, [p.agent]: 0 }));
      schedule([{ at: clock + 1, agent: 'taste', evidence: 'example', cost: 0.01, text: `Kept your rewrite of ${agentById(p.agent).name}’s draft. Its next draft starts from how you wrote it.` }]);
      return;
    }
    const n = (streak[p.agent] ?? 0) + 1;
    setStreak((s) => ({ ...s, [p.agent]: n }));
    if (n >= 2 && trust[p.agent] !== 'auto' && !offered.includes(p.agent)) {
      setOffer(p.agent);
      setOffered((o) => [...o, p.agent]);
    }
  };

  const decline = (p: Proposal, reason: string) => {
    setDecisions((d) => ({ ...d, [p.id]: { state: 'declined', reason } }));
    setDeclining(null);
    setStreak((s) => ({ ...s, [p.agent]: 0 }));
    const rule = `${agentById(p.agent).name}: “${reason.toLowerCase()}” — ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}`;
    setRules((r) => [...r, rule]);
    schedule([{ at: clock + 1, agent: 'taste', evidence: 'example', cost: 0.01, text: `New rule from your decline: ${rule}.` }]);
  };

  // An agent you trust for this kind of thing doesn't wait for you: it acts and tells you.
  useEffect(() => {
    const trusted = waiting.filter((p) => trust[p.agent] === 'auto');
    if (!trusted.length) return;
    setDecisions((d) => ({ ...d, ...Object.fromEntries(trusted.map((p) => [p.id, { state: 'trusted' as const }])) }));
    schedule(trusted.flatMap((p) => [
      { at: clock, agent: p.agent, evidence: 'example' as const, cost: 0.01, text: `Did it without asking, because you trust ${agentById(p.agent).name} for this: ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)}.` },
      ...(OUTCOMES[p.id] ?? []).map((o) => ({ at: clock + o.after, agent: o.agent, text: o.text, earn: o.earn, evidence: 'example' as const, cost: 0.01 })),
    ]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, trust]);

  const reset = () => {
    setClock(START); setRunning(false); setDecisions({}); setDrafts({}); setLater([]);
    setTrust(Object.fromEntries(AGENTS.map((a) => [a.id, a.trust]))); setStreak({});
    setOffer(null); setOffered([]); setRules(STARTING_RULES); setOpenAgent(null); setDeclining(null);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#0e0e0e] shadow-2xl shadow-black">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <KanthinkIcon size={20} className="text-violet-400" />
          <span className="text-[14px] font-semibold">Desk</span>
          <span className="text-[12px] text-neutral-500">Thursday · <span className="tabular-nums text-neutral-300">{clockLabel(clock)}</span></span>
          {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {clock < END && (
            <button onClick={() => setRunning((r) => !r)} className="rounded-full bg-violet-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-violet-400">
              {running ? 'Pause' : clock === START ? 'Run the day' : 'Keep going'}
            </button>
          )}
          {clock < END && (
            <button onClick={() => { setRunning(false); setClock(END); }} className="rounded-full border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-300 hover:border-neutral-600">
              Skip to 6pm
            </button>
          )}
          <button onClick={reset} className="rounded-full border border-neutral-800 px-3 py-1.5 text-[12px] text-neutral-400 hover:border-neutral-600">Reset</button>
        </div>
      </div>

      {/* Ledger */}
      <div className="grid grid-cols-2 gap-2 border-b border-neutral-800 p-3 sm:grid-cols-4">
        <Stat label="Earned today" value={`$${earned}`} sub={earned ? 'simulated sales' : 'lifetime app sales: $0'} tone={earned ? 'text-emerald-300' : undefined} />
        <Stat label="Agents spent" value={`$${spent.toFixed(2)}`} sub="model spend, inside weekly budgets" />
        <Stat label="Your time" value={decided ? `${Math.floor((decided * SECONDS_PER_DECISION) / 60)}m ${(decided * SECONDS_PER_DECISION) % 60}s` : '0s'} sub={`${decided} decision${decided === 1 ? '' : 's'}`} />
        <Stat label="Waiting on you" value={String(waiting.length)} sub={waiting.length ? 'each one is a yes or no' : 'nothing'} tone={waiting.length ? 'text-violet-300' : undefined} />
      </div>

      <div className="grid lg:h-[680px] lg:grid-cols-[250px_minmax(0,1fr)_290px]">
        {/* Crew */}
        <aside className="order-3 border-t border-neutral-800 lg:order-1 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Crew</p>
          {LANES.map((lane) => (
            <div key={lane.id} className="px-2 pb-2">
              <p className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium ${lane.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${lane.dot}`} />{lane.name}
              </p>
              {AGENTS.filter((a) => a.lane === lane.id).map((a) => {
                const open = openAgent === a.id;
                const busy = feed.some((e) => e.agent === a.id && clock - e.at < 45);
                return (
                  <div key={a.id} className={`rounded-lg ${open ? 'bg-neutral-900' : ''}`}>
                    <button onClick={() => setOpenAgent(open ? null : a.id)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-neutral-900">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] text-neutral-200">{a.name}</span>
                        {busy && <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${lane.dot}`} />}
                        <span className={`ml-auto text-[10px] ${trust[a.id] === 'auto' ? 'text-neutral-500' : trust[a.id] === 'new' ? 'text-neutral-400' : 'text-violet-300'}`}>
                          {trust[a.id] === 'auto' ? 'acts' : trust[a.id] === 'new' ? 'asks new' : 'asks'}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500">{status(a)}</p>
                    </button>
                    {open && (
                      <div className="space-y-2 px-2 pb-3 pt-1 text-[11.5px] leading-snug">
                        {([['Watches', a.watches], ['Makes', a.makes], ['Does alone', a.alone], ['Needs your yes', a.needsYes], ['Built from', a.builtFrom]] as const).map(([k, v]) => (
                          <div key={k}><span className="text-neutral-500">{k}</span><p className="text-neutral-300">{v}</p></div>
                        ))}
                        <div>
                          <span className="text-neutral-500">Budget</span>
                          <p className="text-neutral-300">{a.budget ? `$${a.budget}/week, then it stops itself` : 'Runs on your Claude Code plan'}</p>
                        </div>
                        <div>
                          <span className="text-neutral-500">Trust</span>
                          <div className="mt-1 grid grid-cols-3 gap-1">
                            {(['ask', 'new', 'auto'] as Trust[]).map((t) => (
                              <button
                                key={t}
                                onClick={() => setTrust((s) => ({ ...s, [a.id]: t }))}
                                className={`rounded-md px-1 py-1 text-[10px] leading-tight ${trust[a.id] === t ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40' : 'bg-neutral-800/60 text-neutral-400 hover:text-neutral-200'}`}
                              >
                                {TRUST_LABEL[t]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="mx-4 mb-4 mt-1 border-t border-neutral-800 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Rules everyone follows</p>
            <ul className="mt-2 space-y-1.5 text-[11.5px] text-neutral-400">
              {rules.map((r, n) => <li key={r} className={n >= STARTING_RULES.length ? 'text-amber-200' : ''}>· {r}</li>)}
            </ul>
          </div>
        </aside>

        {/* Waiting on you */}
        <section className="order-1 min-w-0 lg:order-2 lg:overflow-y-auto">
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Waiting on you</p>
          <div className="space-y-3 p-3">
            {offer && (
              <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4">
                <p className="text-[13px] font-medium text-violet-100">{agentById(offer).name} is two for two, unchanged.</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-violet-200/80">
                  {offer === 'closer'
                    ? 'Let it send payment links without asking? Only to people who asked to pay, only at the price you set, and it still tells you every time.'
                    : `Let ${agentById(offer).name} do this kind of thing without asking? It still tells you every time.`}{' '}
                  One decline puts it back to asking.
                </p>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setTrust((s) => ({ ...s, [offer]: 'auto' })); setOffer(null); }} className="rounded-full bg-violet-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-violet-400">Yes, for this kind</button>
                  <button onClick={() => setOffer(null)} className="rounded-full border border-violet-500/30 px-3 py-1.5 text-[12px] text-violet-200 hover:border-violet-400">Keep asking</button>
                </div>
              </div>
            )}

            {waiting.length === 0 && !offer && (
              <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-10 text-center">
                <p className="text-[13px] text-neutral-400">{clock >= END ? 'That’s the day.' : 'Nothing waiting. The crew is working.'}</p>
                <p className="mt-1 text-[12px] text-neutral-600">{clock >= END ? 'Reset to play it again with different calls.' : 'Run the day to see what reaches you.'}</p>
              </div>
            )}

            {waiting.map((p) => {
              const a = agentById(p.agent);
              const lane = laneOf(p.agent);
              const draft = drafts[p.id] ?? p.draft;
              return (
                <article key={p.id} className={`rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 ring-1 ${lane.ring}`}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`flex items-center gap-1.5 ${lane.text}`}><span className={`h-1.5 w-1.5 rounded-full ${lane.dot}`} />{a.name}</span>
                    {p.from && <span className="text-neutral-500">from {agentById(p.from).name}</span>}
                    <Badge evidence={p.evidence} />
                    <span className="ml-auto text-neutral-500">{p.outward ? 'goes outside' : 'stays in Kanthink'}</span>
                  </div>
                  <h3 className="mt-2 text-[15px] font-medium leading-snug text-neutral-100">{p.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-400">{p.why}</p>

                  <label className="mt-3 block text-[11px] text-neutral-500">{p.draftLabel}</label>
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-[13px] leading-relaxed text-neutral-200 focus:border-neutral-600 focus:outline-none"
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
                    {p.value > 0 && <span>Worth about <span className="text-emerald-300">${p.value}</span></span>}
                    <span className="flex items-center gap-1.5">
                      Jev: {Math.round(p.confidence * 100)}% likely to land
                      <span className="inline-block h-1 w-14 overflow-hidden rounded-full bg-neutral-800"><span className="block h-full bg-neutral-400" style={{ width: `${p.confidence * 100}%` }} /></span>
                    </span>
                    {draft.trim() !== p.draft.trim() && <span className="text-amber-300">edited</span>}
                  </div>

                  {declining === p.id ? (
                    <div className="mt-3">
                      <p className="text-[11px] text-neutral-500">Why not? It becomes a rule.</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {DECLINE_REASONS.map((r) => (
                          <button key={r} onClick={() => decline(p, r)} className="rounded-full border border-neutral-700 px-2.5 py-1 text-[12px] text-neutral-300 hover:border-amber-400 hover:text-amber-200">{r}</button>
                        ))}
                        <button onClick={() => setDeclining(null)} className="px-2 text-[12px] text-neutral-500 hover:text-neutral-300">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => approve(p)} className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-[12px] font-medium text-neutral-900 hover:bg-white">{p.approveLabel}</button>
                      <button onClick={() => setDeclining(p.id)} className="rounded-full border border-neutral-700 px-3.5 py-1.5 text-[12px] text-neutral-300 hover:border-neutral-500">Not this</button>
                    </div>
                  )}
                </article>
              );
            })}

            {done.length > 0 && (
              <div className="pt-2">
                <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">Decided today</p>
                {done.map((p) => {
                  const d = decisions[p.id];
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-1 py-1.5 text-[12px]">
                      <span className={d.state === 'declined' ? 'text-neutral-600' : 'text-emerald-400'}>{d.state === 'declined' ? '×' : '✓'}</span>
                      <span className={`truncate ${d.state === 'declined' ? 'text-neutral-600 line-through' : 'text-neutral-300'}`}>{p.title}</span>
                      <span className="ml-auto flex-shrink-0 text-[11px] text-neutral-600">{d.state === 'declined' ? d.reason : d.state === 'edited' ? 'your words' : d.state === 'trusted' ? 'without asking' : 'as drafted'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* While you worked */}
        <aside className="order-2 border-t border-neutral-800 lg:order-3 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">While you worked</p>
          <ol className="px-4 pb-4">
            {feed.map((e, n) => {
              const lane = laneOf(e.agent);
              return (
                <li key={`${e.at}-${e.agent}-${n}`} className="relative border-l border-neutral-800 py-2 pl-4">
                  <span className={`absolute -left-[4px] top-3.5 h-[7px] w-[7px] rounded-full ${lane.dot}`} />
                  <div className="flex items-center gap-2 text-[10.5px] text-neutral-500">
                    <span className="tabular-nums">{clockLabel(e.at)}</span>
                    <span className={lane.text}>{agentById(e.agent).name}</span>
                    {e.evidence === 'example' && <span className="text-neutral-600">· example</span>}
                  </div>
                  <p className={`mt-0.5 text-[12px] leading-snug ${e.earn ? 'font-medium text-emerald-300' : 'text-neutral-300'}`}>{e.text}</p>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
