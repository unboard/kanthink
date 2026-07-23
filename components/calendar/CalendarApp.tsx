'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Idea, Asset, Business, MarketingChannel } from '@/lib/calendar/types';
import { CHANNELS, OWNERS, channelMeta, statusMeta } from '@/lib/calendar/types';
import {
  MONTHS, WEEKDAYS_SHORT, WEEKDAYS_MIN, monthGrid, weekDays, todayIso, isToday, isPast,
  sameMonth, parseIso, addDays, formatShortDate, weekKey, weekLabel, isoToDate,
} from './dateUtils';
import { ChatPanel, type ChatMsg } from './ChatPanel';
import { IdeaDetail } from './IdeaDetail';
import { SourcesView } from './SourcesView';

type View = 'month' | 'week' | 'list' | 'sources';

function useHideKanChrome() {
  useEffect(() => {
    document.body.setAttribute('data-mcs-page', 'true');
    document.documentElement.style.colorScheme = 'light';
    const style = document.createElement('style');
    style.id = 'cal-hide-chrome';
    style.textContent = `
      body[data-mcs-page] .relative.z-10.flex.h-screen > *:not(div:last-of-type) { display: none !important; }
      body[data-mcs-page] .relative.z-10.flex.h-screen { display: block !important; height: auto !important; }
      body[data-mcs-page] .relative.z-10.flex.h-screen > div { margin-left: 0 !important; display: block !important; }
      body[data-mcs-page], body[data-mcs-page] html { background: #f6f7f9 !important; color: #171717 !important; }
      body[data-mcs-page] canvas { display: none !important; }
      .cal-md p { margin: 0 0 0.5em; } .cal-md p:last-child { margin-bottom: 0; }
      .cal-md ul { margin: 0.25em 0 0.5em; padding-left: 1.1em; list-style: disc; }
      .cal-md ol { margin: 0.25em 0 0.5em; padding-left: 1.2em; list-style: decimal; }
      .cal-md li { margin: 0.15em 0; } .cal-md strong { font-weight: 600; }
      .cal-md a { color: #2563eb; text-decoration: underline; }
      .cal-md h1,.cal-md h2,.cal-md h3 { font-weight: 600; margin: 0.4em 0 0.3em; }
    `;
    document.head.appendChild(style);
    return () => { document.body.removeAttribute('data-mcs-page'); document.documentElement.style.colorScheme = ''; style.remove(); };
  }, []);
}

export function CalendarApp({ business }: { business: Business }) {
  useHideKanChrome();
  const slug = business.slug;

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<string>(todayIso());
  const [selected, setSelected] = useState<Idea | 'new' | null>(null);

  const [channelFilter, setChannelFilter] = useState<Set<MarketingChannel>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [focusAudience, setFocusAudience] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [iRes, aRes] = await Promise.all([
          fetch(`/api/calendar/ideas?business=${slug}`),
          fetch(`/api/calendar/assets?business=${slug}`),
        ]);
        const iData = await iRes.json();
        const aData = await aRes.json();
        setIdeas(iData.ideas || []);
        setAssets(aData.assets || []);
      } catch { showToast('Failed to load calendar'); }
      finally { setLoading(false); }
    })();
  }, [slug, showToast]);

  const audiences = useMemo(() => assets.filter((a) => a.kind === 'audience').map((a) => a.name), [assets]);

  const visibleIdeas = useMemo(() => ideas.filter((i) => {
    if (channelFilter.size > 0 && !channelFilter.has(i.channel)) return false;
    if (ownerFilter !== 'all' && i.owner !== ownerFilter) return false;
    if (focusAudience && !i.audience.toLowerCase().includes(focusAudience.toLowerCase())) return false;
    return true;
  }), [ideas, channelFilter, ownerFilter, focusAudience]);

  const byDate = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const i of visibleIdeas) {
      if (!i.date) continue;
      const arr = map.get(i.date) || [];
      arr.push(i);
      map.set(i.date, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.position - b.position);
    return map;
  }, [visibleIdeas]);

  // ---- Mutations ----
  const saveIdea = useCallback(async (idea: Idea) => {
    const res = await fetch('/api/calendar/ideas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business: slug, idea }),
    });
    const data = await res.json();
    if (data.idea) {
      setIdeas((prev) => {
        const exists = prev.some((p) => p.id === data.idea.id);
        return exists ? prev.map((p) => (p.id === data.idea.id ? data.idea : p)) : [...prev, data.idea];
      });
    }
  }, [slug]);

  const deleteIdea = useCallback(async (id: string) => {
    setIdeas((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
    await fetch(`/api/calendar/ideas?business=${slug}&id=${id}`, { method: 'DELETE' });
  }, [slug]);

  const rescheduleIdea = useCallback(async (idea: Idea, date: string) => {
    setIdeas((prev) => prev.map((p) => (p.id === idea.id ? { ...p, date } : p)));
    await saveIdea({ ...idea, date });
  }, [saveIdea]);

  const saveAsset = useCallback(async (asset: Asset) => {
    const res = await fetch('/api/calendar/assets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business: slug, asset }),
    });
    const data = await res.json();
    if (data.asset) {
      setAssets((prev) => {
        const exists = prev.some((p) => p.id === data.asset.id);
        return exists ? prev.map((p) => (p.id === data.asset.id ? data.asset : p)) : [...prev, data.asset];
      });
    }
  }, [slug]);

  const deleteAsset = useCallback(async (id: string) => {
    setAssets((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/calendar/assets?business=${slug}&id=${id}`, { method: 'DELETE' });
  }, [slug]);

  // ---- Chat ----
  const sendChat = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || chatLoading) return;
    const next = [...chatMessages, { role: 'user' as const, content: t }];
    setChatMessages(next);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/calendar/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: slug, messages: next, focusAudience }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      setChatMessages([...next, { role: 'assistant', content: data.message || '…' }]);
      if (Array.isArray(data.ideas)) setIdeas(data.ideas);
      if (data.changed > 0) showToast(`Kan updated the calendar (${data.changed} change${data.changed > 1 ? 's' : ''})`);
    } catch (e) {
      setChatMessages([...next, { role: 'assistant', content: `Sorry — ${e instanceof Error ? e.message : 'something went wrong'}.` }]);
    } finally { setChatLoading(false); }
  }, [chatMessages, chatLoading, slug, focusAudience, showToast]);

  const openChatFocused = useCallback((audience: string) => {
    setFocusAudience(audience);
    setView('month');
    setChatOpen(true);
    setChatInput(`Generate a few ideas focused on ${audience} and add them to the calendar.`);
  }, []);

  const { y: curY, m: curM } = parseIso(cursor);
  const monthIndex = curM - 1;

  // Stats for the objective banner
  const stats = useMemo(() => {
    const thisMonth = ideas.filter((i) => i.date && sameMonth(i.date, curY, monthIndex));
    return {
      done: ideas.filter((i) => i.status === 'done').length,
      inProgress: ideas.filter((i) => i.status === 'in_progress').length,
      upcoming: ideas.filter((i) => i.date && !isPast(i.date) && i.status !== 'done').length,
      monthCount: thisMonth.length,
    };
  }, [ideas, curY, monthIndex]);

  return (
    <div className="flex h-screen flex-col bg-[#f6f7f9] text-neutral-900">
      {/* ---------- Top bar ---------- */}
      <header className="z-20 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/calendar" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: business.accent }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>
            </span>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold text-neutral-900">{business.name}</h1>
              <span className="hidden rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 sm:inline">Marketing Calendar</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { setChatOpen(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:brightness-105">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" /></svg>
              <span className="hidden sm:inline">Ask Kan</span>
            </button>
          </div>
        </div>

        {/* Objective + view tabs */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2.5 sm:px-6">
          <p className="text-[12.5px] text-neutral-500">
            <span className="font-medium text-neutral-700">Grow revenue.</span> Keep moving on the ideas that drive it.
          </p>
          <div className="hidden items-center gap-3 text-[11.5px] text-neutral-400 md:flex">
            <Stat label="in progress" value={stats.inProgress} color="#d97706" />
            <Stat label="upcoming" value={stats.upcoming} color="#2563eb" />
            <Stat label="done" value={stats.done} color="#059669" />
          </div>
          <div className="ml-auto flex items-center rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
            {(['month', 'week', 'list', 'sources'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium capitalize transition-colors ${view === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>
                {v === 'sources' ? 'Knowledge' : v}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---------- Body ---------- */}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">Loading calendar…</div>
          ) : view === 'sources' ? (
            <SourcesView assets={assets} onSave={saveAsset} onDelete={deleteAsset} onFocusAudience={openChatFocused} />
          ) : (
            <div className="px-3 py-3 sm:px-6 sm:py-4">
              {/* Controls row */}
              {view !== 'list' && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <NavBtn dir="prev" onClick={() => setCursor(view === 'month' ? addMonths(cursor, -1) : addDays(cursor, -7))} />
                    <button onClick={() => setCursor(todayIso())} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-neutral-600 hover:bg-neutral-50">Today</button>
                    <NavBtn dir="next" onClick={() => setCursor(view === 'month' ? addMonths(cursor, 1) : addDays(cursor, 7))} />
                  </div>
                  <h2 className="text-[15px] font-semibold text-neutral-800">
                    {view === 'month' ? `${MONTHS[monthIndex]} ${curY}` : weekLabel(cursor)}
                  </h2>
                  <div className="ml-auto flex items-center gap-2">
                    <FilterControls
                      channelFilter={channelFilter} setChannelFilter={setChannelFilter}
                      ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter}
                    />
                  </div>
                </div>
              )}

              {/* Focus chip */}
              {focusAudience && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-[12.5px] font-medium text-violet-700">
                    Focused on {focusAudience}
                    <button onClick={() => setFocusAudience(null)} aria-label="Clear focus" className="text-violet-400 hover:text-violet-700">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </span>
                  <button onClick={() => openChatFocused(focusAudience)} className="text-[12.5px] font-medium text-blue-600 hover:text-blue-700">Ask Kan for {focusAudience} ideas →</button>
                </div>
              )}

              {view === 'month' && <MonthView year={curY} monthIndex={monthIndex} byDate={byDate} onOpen={setSelected} onReschedule={rescheduleIdea} onAddDay={(d) => setSelected(newIdeaForDay(d))} />}
              {view === 'week' && <WeekView cursor={cursor} byDate={byDate} onOpen={setSelected} onReschedule={rescheduleIdea} onAddDay={(d) => setSelected(newIdeaForDay(d))} />}
              {view === 'list' && (
                <ListView
                  ideas={visibleIdeas} onOpen={setSelected}
                  channelFilter={channelFilter} setChannelFilter={setChannelFilter}
                  ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter}
                  focusAudience={focusAudience} onClearFocus={() => setFocusAudience(null)}
                />
              )}

              <Legend />
            </div>
          )}
        </main>

        {/* Chat side panel (desktop) */}
        {chatOpen && (
          <aside className="hidden w-[380px] flex-shrink-0 border-l border-neutral-200 lg:block">
            <ChatPanel messages={chatMessages} loading={chatLoading} input={chatInput} onInput={setChatInput} onSend={sendChat} onClose={() => setChatOpen(false)} />
          </aside>
        )}
      </div>

      {/* Chat sheet (mobile) */}
      {chatOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/30" onClick={() => setChatOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 top-14 overflow-hidden rounded-t-2xl bg-white shadow-2xl">
            <ChatPanel messages={chatMessages} loading={chatLoading} input={chatInput} onInput={setChatInput} onSend={sendChat} onClose={() => setChatOpen(false)} />
          </div>
        </div>
      )}

      {/* Floating add button */}
      {view !== 'sources' && (
        <button onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex h-13 items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-[13px] font-semibold text-white shadow-lg hover:bg-neutral-800 lg:hidden">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add via Kan
        </button>
      )}

      {/* Detail drawer */}
      <IdeaDetail idea={selected} audiences={audiences} onSave={saveIdea} onDelete={deleteIdea} onClose={() => setSelected(null)} />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------- helpers ----------------
function addMonths(iso: string, n: number): string {
  const { y, m } = parseIso(iso);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function blankIdea(): Idea {
  return { id: '', business: '', title: '', date: null, channel: 'email', audience: '', objective: '', justification: '', metric: '', owner: 'Dustin', collaborators: [], tools: [], effort: 'M', status: 'planned', notes: '', position: 0 };
}
function newIdeaForDay(d: string): Idea {
  return { ...blankIdea(), date: d };
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="font-semibold text-neutral-700">{value}</span> {label}
    </span>
  );
}

function NavBtn({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-neutral-200 bg-white p-1.5 text-neutral-500 hover:bg-neutral-50" aria-label={dir}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'prev' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}

// ---------------- Month ----------------
function MonthView({ year, monthIndex, byDate, onOpen, onReschedule, onAddDay }: {
  year: number; monthIndex: number; byDate: Map<string, Idea[]>;
  onOpen: (i: Idea) => void; onReschedule: (i: Idea, date: string) => void; onAddDay: (d: string) => void;
}) {
  const grid = monthGrid(year, monthIndex);
  const [dragOver, setDragOver] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
        {WEEKDAYS_SHORT.map((d, i) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            <span className="hidden sm:inline">{d}</span><span className="sm:hidden">{WEEKDAYS_MIN[i]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((iso) => {
          const inMonth = sameMonth(iso, year, monthIndex);
          const items = byDate.get(iso) || [];
          const today = isToday(iso);
          return (
            <div
              key={iso}
              onDragOver={(e) => { e.preventDefault(); setDragOver(iso); }}
              onDragLeave={() => setDragOver((v) => (v === iso ? null : v))}
              onDrop={(e) => {
                setDragOver(null);
                const id = e.dataTransfer.getData('text/plain');
                const idea = items.find((x) => x.id === id) || findAcross(byDate, id);
                if (idea && idea.date !== iso) onReschedule(idea, iso);
              }}
              className={`group relative min-h-[92px] border-b border-r border-neutral-100 p-1.5 sm:min-h-[116px] ${inMonth ? 'bg-white' : 'bg-neutral-50/60'} ${dragOver === iso ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11.5px] font-medium ${today ? 'bg-blue-600 text-white' : inMonth ? 'text-neutral-600' : 'text-neutral-300'}`}>
                  {parseIso(iso).d}
                </span>
                <button onClick={() => onAddDay(iso)} className="hidden text-neutral-300 hover:text-blue-600 group-hover:block" aria-label="Add idea">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
              <div className="space-y-1">
                {items.slice(0, 4).map((i) => <MonthChip key={i.id} idea={i} onOpen={onOpen} />)}
                {items.length > 4 && <button onClick={() => onOpen(items[4])} className="pl-1 text-[10.5px] font-medium text-neutral-400 hover:text-neutral-700">+{items.length - 4} more</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function findAcross(byDate: Map<string, Idea[]>, id: string): Idea | undefined {
  for (const arr of byDate.values()) { const f = arr.find((x) => x.id === id); if (f) return f; }
  return undefined;
}

function MonthChip({ idea, onOpen }: { idea: Idea; onOpen: (i: Idea) => void }) {
  const cm = channelMeta(idea.channel);
  const dim = idea.status === 'done' || idea.status === 'skipped';
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', idea.id)}
      onClick={() => onOpen(idea)}
      title={idea.title}
      className={`flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-opacity hover:brightness-95 ${dim ? 'opacity-55' : ''}`}
      style={{ background: cm.bg, color: cm.text }}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: cm.color }} />
      <span className={`truncate ${idea.status === 'done' ? 'line-through decoration-1' : ''}`}>{idea.title}</span>
    </button>
  );
}

// ---------------- Week ----------------
function WeekView({ cursor, byDate, onOpen, onReschedule, onAddDay }: {
  cursor: string; byDate: Map<string, Idea[]>;
  onOpen: (i: Idea) => void; onReschedule: (i: Idea, date: string) => void; onAddDay: (d: string) => void;
}) {
  const days = weekDays(cursor);
  const [dragOver, setDragOver] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((iso) => {
        const items = byDate.get(iso) || [];
        const today = isToday(iso);
        return (
          <div key={iso}
            onDragOver={(e) => { e.preventDefault(); setDragOver(iso); }}
            onDragLeave={() => setDragOver((v) => (v === iso ? null : v))}
            onDrop={(e) => { setDragOver(null); const id = e.dataTransfer.getData('text/plain'); const idea = findAcross(byDate, id); if (idea && idea.date !== iso) onReschedule(idea, iso); }}
            className={`min-h-[120px] rounded-xl border bg-white p-2 ${today ? 'border-blue-300 ring-1 ring-blue-100' : 'border-neutral-200'} ${dragOver === iso ? 'ring-2 ring-blue-300' : ''}`}>
            <div className="mb-2 flex items-center justify-between px-0.5">
              <div className={`text-[12px] font-semibold ${today ? 'text-blue-600' : 'text-neutral-600'}`}>
                {WEEKDAYS_SHORT[isoToDate(iso).getDay()]} {parseIso(iso).d}
              </div>
              <button onClick={() => onAddDay(iso)} className="text-neutral-300 hover:text-blue-600" aria-label="Add idea">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            </div>
            <div className="space-y-1.5">
              {items.length === 0 && <div className="px-1 py-2 text-[11px] text-neutral-300">—</div>}
              {items.map((i) => <WeekCard key={i.id} idea={i} onOpen={onOpen} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekCard({ idea, onOpen }: { idea: Idea; onOpen: (i: Idea) => void }) {
  const cm = channelMeta(idea.channel);
  const sm = statusMeta(idea.status);
  return (
    <button draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', idea.id)} onClick={() => onOpen(idea)}
      className="w-full rounded-lg border border-neutral-200 bg-white p-2 text-left hover:border-neutral-300 hover:shadow-sm">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide" style={{ background: cm.bg, color: cm.text }}>{cm.label}</span>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.color }} title={sm.label} />
      </div>
      <div className="line-clamp-2 text-[12px] font-medium leading-snug text-neutral-800">{idea.title}</div>
      {idea.audience && <div className="mt-1 truncate text-[10.5px] text-neutral-400">{idea.audience} · {idea.owner}</div>}
    </button>
  );
}

// ---------------- List ----------------
function ListView({ ideas, onOpen, channelFilter, setChannelFilter, ownerFilter, setOwnerFilter, focusAudience, onClearFocus }: {
  ideas: Idea[]; onOpen: (i: Idea) => void;
  channelFilter: Set<MarketingChannel>; setChannelFilter: (s: Set<MarketingChannel>) => void;
  ownerFilter: string; setOwnerFilter: (v: string) => void;
  focusAudience: string | null; onClearFocus: () => void;
}) {
  const dated = ideas.filter((i) => i.date).sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : a.position - b.position));
  const backlog = ideas.filter((i) => !i.date);
  const groups = useMemo(() => {
    const m = new Map<string, Idea[]>();
    for (const i of dated) { const k = weekKey(i.date!); (m.get(k) || m.set(k, []).get(k)!).push(i); }
    return Array.from(m.entries());
  }, [dated]);
  const today = todayIso();

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
        <FilterControls channelFilter={channelFilter} setChannelFilter={setChannelFilter} ownerFilter={ownerFilter} setOwnerFilter={setOwnerFilter} />
        {focusAudience && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[12px] font-medium text-violet-700">
            {focusAudience}
            <button onClick={onClearFocus} aria-label="Clear"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
          </span>
        )}
        <span className="ml-auto text-[12px] text-neutral-400">{ideas.length} ideas</span>
      </div>

      <div className="divide-y divide-neutral-100">
        {groups.map(([wk, items]) => {
          const isCurrentWeek = weekKey(today) === wk;
          return (
            <div key={wk}>
              <div className={`sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide ${isCurrentWeek ? 'bg-blue-50 text-blue-700' : 'bg-neutral-50 text-neutral-500'}`}>
                {weekLabel(items[0].date!)} {isCurrentWeek && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] text-white">THIS WEEK</span>}
              </div>
              {items.map((i) => <ListRow key={i.id} idea={i} onOpen={onOpen} past={i.date! < today} />)}
            </div>
          );
        })}
        {backlog.length > 0 && (
          <div>
            <div className="bg-neutral-50 px-4 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-neutral-500">Backlog (no date)</div>
            {backlog.map((i) => <ListRow key={i.id} idea={i} onOpen={onOpen} past={false} />)}
          </div>
        )}
        {ideas.length === 0 && <div className="px-4 py-10 text-center text-sm text-neutral-400">No ideas match your filters.</div>}
      </div>
    </div>
  );
}

function ListRow({ idea, onOpen, past }: { idea: Idea; onOpen: (i: Idea) => void; past: boolean }) {
  const cm = channelMeta(idea.channel);
  const sm = statusMeta(idea.status);
  return (
    <button onClick={() => onOpen(idea)} className={`flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 ${past ? 'opacity-70' : ''}`}>
      <div className="w-12 flex-shrink-0 pt-0.5 text-[11.5px] font-medium text-neutral-400">{idea.date ? formatShortDate(idea.date) : '—'}</div>
      <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: cm.color }} />
      <div className="min-w-0 flex-1">
        <div className={`text-[13.5px] font-medium text-neutral-800 ${idea.status === 'done' ? 'line-through decoration-neutral-300' : ''}`}>{idea.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-neutral-400">
          <span className="font-medium" style={{ color: cm.text }}>{cm.label}</span>
          {idea.audience && <span>· {idea.audience}</span>}
          {idea.objective && <span className="hidden truncate sm:inline">· {idea.objective}</span>}
        </div>
      </div>
      <div className="hidden flex-shrink-0 items-center gap-2 pt-0.5 sm:flex">
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10.5px] font-medium text-neutral-500">{idea.owner}</span>
        <span className="inline-flex items-center gap-1 text-[10.5px] text-neutral-400"><span className="h-1.5 w-1.5 rounded-full" style={{ background: sm.color }} />{sm.label}</span>
      </div>
    </button>
  );
}

// ---------------- Filters + Legend ----------------
function FilterControls({ channelFilter, setChannelFilter, ownerFilter, setOwnerFilter }: {
  channelFilter: Set<MarketingChannel>; setChannelFilter: (s: Set<MarketingChannel>) => void;
  ownerFilter: string; setOwnerFilter: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = channelFilter.size > 0 || ownerFilter !== 'all';
  function toggle(k: MarketingChannel) {
    const next = new Set(channelFilter);
    if (next.has(k)) next.delete(k); else next.add(k);
    setChannelFilter(next);
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium ${active ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        Filter{active ? ` · ${channelFilter.size + (ownerFilter !== 'all' ? 1 : 0)}` : ''}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-56 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Channel</div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => (
                <button key={c.key} onClick={() => toggle(c.key)}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${channelFilter.has(c.key) ? '' : 'opacity-45'}`}
                  style={{ background: c.bg, color: c.text }}>{c.label}</button>
              ))}
            </div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Owner</div>
            <div className="flex flex-wrap gap-1.5">
              {['all', ...OWNERS.map((o) => o.key)].map((o) => (
                <button key={o} onClick={() => setOwnerFilter(o)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${ownerFilter === o ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                  {o === 'all' ? 'Everyone' : o}
                </button>
              ))}
            </div>
            {(active) && <button onClick={() => { setChannelFilter(new Set()); setOwnerFilter('all'); }} className="mt-3 text-[12px] font-medium text-blue-600 hover:text-blue-700">Clear filters</button>}
          </div>
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[11px] text-neutral-400">
      {CHANNELS.filter((c) => c.key !== 'other').map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.label}
        </span>
      ))}
    </div>
  );
}
