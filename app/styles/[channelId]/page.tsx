'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, ExternalLink, Loader2, Search, Sparkles, Wand2, X } from 'lucide-react';
import { FORMATS, composePrompt, stageOf, type Aspect, type PrintBrief, type StyleRecord, type StyleStage } from '@/lib/styles/library';

/**
 * The style playground: a channel of prompt cards (the Image Prompt Library, kept by
 * its bot) as a catalog of visual styles. Pick one or a few, say what the print piece
 * is, see and edit the exact prompt, draw it, and compare. A result worth keeping
 * goes back onto the style's card, and the card moves through the channel's testing
 * columns from here. The channel is the data; this is where it gets tried.
 */

type Style = StyleRecord & { columnId: string };
interface Library { channel: { id: string; name: string }; columns: { id: string; name: string }[]; styles: Style[]; canEdit: boolean }
interface Result { id: string; run: number; style: Style; prompt: string; label: string; status: 'drawing' | 'ready' | 'failed'; url?: string; error?: string; model?: string; saved?: boolean }

const STAGES: { id: StyleStage | 'live'; label: string }[] = [
  { id: 'live', label: 'All' }, { id: 'curated', label: 'Curated' }, { id: 'tested', label: 'Tested' },
  { id: 'testing', label: 'To test' }, { id: 'new', label: 'New' }, { id: 'aside', label: 'Set aside' },
];
const STAGE_TONE: Record<StyleStage, string> = {
  curated: 'bg-emerald-400/15 text-emerald-200', tested: 'bg-sky-400/15 text-sky-200', testing: 'bg-amber-400/15 text-amber-200',
  new: 'bg-violet-400/15 text-violet-200', aside: 'bg-neutral-500/20 text-neutral-400',
};
const STAGE_LABEL: Record<StyleStage, string> = { curated: 'Curated', tested: 'Tested', testing: 'To test', new: 'New', aside: 'Set aside' };
const ASPECTS: Aspect[] = ['3:4', '4:3', '1:1', '16:9', '9:16'];
const MAX_PICK = 4;

function hue(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

export default function StylePlayground({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  const [lib, setLib] = useState<Library | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<StyleStage | 'live'>('live');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [brief, setBrief] = useState<PrintBrief>({ format: 'flyer', subject: '', message: '', audience: '', constraints: '' });
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Result[]>([]);
  const [run, setRun] = useState(0);
  const [tab, setTab] = useState<'styles' | 'make'>('styles');
  const [toast, setToast] = useState<string | null>(null);

  const say = (t: string) => { setToast(t); setTimeout(() => setToast((x) => (x === t ? null : x)), 2600); };

  useEffect(() => {
    let gone = false;
    fetch(`/api/styles/${channelId}`)
      .then(async (r) => { if (gone) return; if (!r.ok) setErr(r.status === 401 ? 'Sign in to open the playground.' : 'This library didn’t open.'); else setLib(await r.json()); })
      .catch(() => { if (!gone) setErr('This library didn’t open.'); });
    return () => { gone = true; };
  }, [channelId]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    return (lib?.styles ?? []).filter((s) => (stage === 'live' ? s.stage !== 'aside' : s.stage === stage))
      .filter((s) => !words || `${s.name} ${s.tags.join(' ')} ${s.uses.join(' ')}`.toLowerCase().includes(words))
      .sort((a, b) => order(a.stage) - order(b.stage));
  }, [lib, stage, q]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { live: 0 };
    for (const s of lib?.styles ?? []) { c[s.stage] = (c[s.stage] ?? 0) + 1; if (s.stage !== 'aside') c.live++; }
    return c;
  }, [lib]);

  const pickedStyles = picked.map((id) => lib?.styles.find((s) => s.cardId === id)).filter((s): s is Style => Boolean(s));
  const promptFor = (s: Style) => edited[s.cardId] ?? composePrompt(s, brief);
  const fmt = FORMATS.find((f) => f.id === brief.format)!;
  const aspect = brief.aspect ?? fmt.aspect;
  const label = `${brief.format === 'custom' ? brief.custom || 'Custom' : fmt.label}: ${brief.subject.trim() || 'untitled'}`;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_PICK ? [...p.slice(1), id] : [...p, id]));
  // The brief changed: prompts follow it again, unless you're mid-edit on one.
  const setB = (patch: Partial<PrintBrief>) => { setBrief((b) => ({ ...b, ...patch })); setEdited({}); };

  const generate = async () => {
    if (!pickedStyles.length) return;
    const n = run + 1;
    setRun(n);
    const jobs: Result[] = pickedStyles.map((s) => ({ id: `${n}-${s.cardId}`, run: n, style: s, prompt: promptFor(s), label, status: 'drawing' }));
    setResults((r) => [...jobs, ...r]);
    setTab('make');
    await Promise.all(jobs.map(async (j) => {
      try {
        const r = await fetch('/api/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: j.prompt, aspectRatio: aspect, quality: 'high' }) });
        const d = await r.json().catch(() => ({}));
        setResults((all) => all.map((x) => (x.id === j.id ? (r.ok && d.url ? { ...x, status: 'ready', url: d.url, model: d.model } : { ...x, status: 'failed', error: d.error || 'It didn’t draw' }) : x)));
      } catch {
        setResults((all) => all.map((x) => (x.id === j.id ? { ...x, status: 'failed', error: 'It didn’t draw' } : x)));
      }
    }));
  };

  const keep = async (r: Result) => {
    if (!r.url) return;
    const res = await fetch(`/api/styles/${channelId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId: r.style.cardId, imageUrl: r.url, prompt: r.prompt, label: r.label }) }).catch(() => null);
    if (!res?.ok) return say('That didn’t save');
    setResults((all) => all.map((x) => (x.id === r.id ? { ...x, saved: true } : x)));
    setLib((l) => l && ({ ...l, styles: l.styles.map((s) => (s.cardId === r.style.cardId && !s.imageUrl ? { ...s, imageUrl: r.url! } : s)) }));
    say(`Kept on “${r.style.name}”`);
  };

  // Through the channel's own testing columns, by what each column means.
  const moveTo = async (s: Style, to: StyleStage) => {
    const col = lib?.columns.find((c) => stageOf(c.name) === to);
    if (!col) return say('This channel has no column for that');
    const res = await fetch(`/api/channels/${channelId}/cards/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cardId: s.cardId, toColumnId: col.id, toPosition: 0 }) }).catch(() => null);
    if (!res?.ok) return say('That move didn’t stick');
    setLib((l) => l && ({ ...l, styles: l.styles.map((x) => (x.cardId === s.cardId ? { ...x, stage: to, columnId: col.id, columnName: col.name } : x)) }));
    if (to === 'aside') setPicked((p) => p.filter((x) => x !== s.cardId));
    say(`${s.name} → ${col.name}`);
  };

  const infoStyle = info ? lib?.styles.find((s) => s.cardId === info) : null;
  const runs = [...new Set(results.map((r) => r.run))];

  if (err) return <Shell><p className="p-8 text-center text-neutral-400">{err}</p></Shell>;
  if (!lib) return <Shell><p className="flex items-center justify-center gap-2 p-16 text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" /> Opening the library…</p></Shell>;

  return (
    <Shell>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-neutral-950/90 px-4 py-3 backdrop-blur-xl">
        <Link href="/prototypes/kan/city" className="rounded-full p-1.5 text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Back to Kan City"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold">Style playground</h1>
          <p className="truncate text-[12px] text-neutral-500">{lib.styles.length} styles from <Link href={`/channel/${channelId}`} className="text-neutral-400 hover:text-neutral-200">{lib.channel.name}</Link>, kept by its bot</p>
        </div>
        <Link href={`/channel/${channelId}`} className="hidden items-center gap-1 rounded-full px-2.5 py-1 text-[12px] text-neutral-500 hover:text-neutral-200 sm:flex">Channel <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </header>

      <div className="flex gap-1 border-b border-white/5 px-4 py-2 lg:hidden">
        {(['styles', 'make'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3.5 py-1.5 text-[13px] ${tab === t ? 'bg-white/10 text-white' : 'text-neutral-400'}`}>
            {t === 'styles' ? `Styles${picked.length ? ` · ${picked.length} picked` : ''}` : `Make${results.length ? ` · ${results.length}` : ''}`}
          </button>
        ))}
      </div>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* The catalog */}
        <section className={tab === 'styles' ? '' : 'max-lg:hidden'}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {STAGES.map((s) => (
                <button key={s.id} onClick={() => setStage(s.id)} className={`flex-shrink-0 rounded-full border px-3 py-1 text-[12.5px] ${stage === s.id ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-neutral-400 hover:text-neutral-200'}`}>
                  {s.label} <span className="text-neutral-500">{counts[s.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <label className="flex min-w-[160px] flex-1 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
              <Search className="h-3.5 w-3.5 text-neutral-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a style or tag" className="w-full bg-transparent text-[13px] placeholder:text-neutral-600 focus:outline-none" />
            </label>
          </div>
          <p className="mb-3 text-[12px] text-neutral-500">Pick up to {MAX_PICK} to try side by side.</p>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-[13px] text-neutral-500">
              {lib.styles.length ? 'Nothing here. Try another column.' : 'No prompt cards yet. The library’s bot adds them as it finds them.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shown.map((s) => {
                const on = picked.includes(s.cardId);
                const h = hue(s.name);
                return (
                  <div key={s.cardId} className={`group relative overflow-hidden rounded-2xl border transition ${on ? 'border-violet-400 ring-2 ring-violet-400/40' : 'border-white/10 hover:border-white/25'}`}>
                    <button onClick={() => toggle(s.cardId)} className="block w-full text-left" aria-pressed={on}>
                      <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(${h} 45% 22%), hsl(${(h + 60) % 360} 50% 12%))` }}>
                        {s.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={s.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          : <div className="flex h-full flex-col justify-end gap-1 p-3"><span className="text-[11px] uppercase tracking-wider text-white/50">Not drawn yet</span><span className="line-clamp-2 text-[11.5px] text-white/70">{s.tags.slice(0, 4).join(' · ')}</span></div>}
                        <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10.5px] font-medium backdrop-blur ${STAGE_TONE[s.stage]}`}>{STAGE_LABEL[s.stage]}</span>
                        {on && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-white"><Check className="h-3.5 w-3.5" /></span>}
                      </div>
                      <p className="line-clamp-2 px-3 pb-0.5 pt-2 text-[13px] font-medium leading-snug">{s.name}</p>
                    </button>
                    <button onClick={() => setInfo(s.cardId)} className="px-3 pb-2.5 text-[11.5px] text-neutral-500 hover:text-neutral-200">About this style</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* The brief, the prompt, the results */}
        <section className={`space-y-4 ${tab === 'make' ? '' : 'max-lg:hidden'}`}>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">The piece</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <button key={f.id} onClick={() => setB({ format: f.id, aspect: undefined })} className={`rounded-full border px-3 py-1 text-[13px] ${brief.format === f.id ? 'border-violet-400/60 bg-violet-500/15 text-white' : 'border-white/10 text-neutral-300 hover:border-white/25'}`}>{f.label}</button>
              ))}
            </div>
            {brief.format === 'custom' && <Field label="What it is" value={brief.custom ?? ''} onChange={(v) => setB({ custom: v })} placeholder="A trifold menu cover, a door hanger…" />}
            <Field label="Subject" value={brief.subject} onChange={(v) => setB({ subject: v })} placeholder="A spring plant sale at a family greenhouse" />
            <Field label="Message" value={brief.message ?? ''} onChange={(v) => setB({ message: v })} placeholder="Fresh starts, local roots" />
            <div className="grid gap-x-3 sm:grid-cols-2">
              <Field label="For" value={brief.audience ?? ''} onChange={(v) => setB({ audience: v })} placeholder="Neighbors who garden" />
              <Field label="Must" value={brief.constraints ?? ''} onChange={(v) => setB({ constraints: v })} placeholder="Greens and terracotta, no people" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[12px] text-neutral-500">Shape</span>
              {ASPECTS.map((a) => <button key={a} onClick={() => setB({ aspect: a })} className={`rounded-md px-2 py-0.5 text-[12px] ${aspect === a ? 'bg-white/15 text-white' : 'text-neutral-500 hover:text-neutral-200'}`}>{a}</button>)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">What gets sent</p>
            {pickedStyles.length === 0 ? (
              <p className="text-[13px] text-neutral-500">Pick a style to see its prompt. <button onClick={() => setTab('styles')} className="text-violet-300 lg:hidden">Pick one</button></p>
            ) : pickedStyles.map((s) => (
              <div key={s.cardId} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</span>
                  {edited[s.cardId] !== undefined && <button onClick={() => setEdited((m) => { const next = { ...m }; delete next[s.cardId]; return next; })} className="text-[11.5px] text-neutral-500 hover:text-neutral-200">Reset</button>}
                  <button onClick={() => toggle(s.cardId)} aria-label={`Drop ${s.name}`} className="text-neutral-500 hover:text-neutral-200"><X className="h-3.5 w-3.5" /></button>
                </div>
                <textarea value={promptFor(s)} onChange={(e) => setEdited((m) => ({ ...m, [s.cardId]: e.target.value }))} rows={pickedStyles.length > 1 ? 4 : 9} className="w-full resize-y rounded-xl bg-black/30 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-neutral-300 focus:outline-none focus:ring-1 focus:ring-violet-400/60" />
              </div>
            ))}
            <button onClick={() => void generate()} disabled={!pickedStyles.length} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 py-2.5 text-[14px] font-medium text-white hover:bg-violet-500 disabled:opacity-40">
              <Wand2 className="h-4 w-4" /> {pickedStyles.length > 1 ? `Draw it in ${pickedStyles.length} styles` : 'Draw it'}
            </button>
          </div>

          {runs.map((n) => {
            const rs = results.filter((r) => r.run === n);
            return (
              <div key={n}>
                <p className="mb-2 flex items-center gap-1.5 text-[12px] text-neutral-500"><Sparkles className="h-3.5 w-3.5" /> {rs[0].label}</p>
                <div className={`grid gap-3 ${rs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {rs.map((r) => (
                    <figure key={r.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                      <div className="flex min-h-[160px] items-center justify-center bg-black/30">
                        {r.status === 'drawing' && <Loader2 className="h-5 w-5 animate-spin text-violet-300" />}
                        {r.status === 'failed' && <p className="p-4 text-center text-[12.5px] text-rose-300">{r.error}</p>}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.url && <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt={r.style.name} className="w-full" /></a>}
                      </div>
                      <figcaption className="space-y-1.5 p-2.5">
                        <p className="truncate text-[12.5px] font-medium">{r.style.name}</p>
                        <div className="flex flex-wrap gap-1">
                          {r.url && lib.canEdit && (r.saved
                            ? <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11.5px] text-emerald-200"><Check className="h-3 w-3" /> On the card</span>
                            : <Chip onClick={() => void keep(r)}>Keep on card</Chip>)}
                          {lib.canEdit && <StageChips style={lib.styles.find((s) => s.cardId === r.style.cardId) ?? r.style} onMove={moveTo} />}
                          <Link href={`/channel/${channelId}/card/${r.style.cardId}`} className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] text-neutral-500 hover:text-neutral-200">Card <ExternalLink className="h-3 w-3" /></Link>
                        </div>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {infoStyle && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setInfo(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-h-[86dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-5 sm:rounded-3xl">
            <div className="mb-3 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STAGE_TONE[infoStyle.stage]}`}>{infoStyle.columnName}</span>
                <h2 className="mt-1.5 text-[17px] font-semibold">{infoStyle.name}</h2>
              </div>
              <button onClick={() => setInfo(null)} aria-label="Close" className="rounded-full p-1.5 text-neutral-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            {infoStyle.outcome && <p className="mb-3 text-[13.5px] leading-relaxed text-neutral-300">{infoStyle.outcome}</p>}
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Template</p>
            <p className="mb-3 rounded-xl bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-neutral-300">{infoStyle.template}</p>
            {infoStyle.uses.length > 0 && <><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Good for</p><ul className="mb-3 list-disc pl-5 text-[13px] text-neutral-300">{infoStyle.uses.map((u) => <li key={u}>{u}</li>)}</ul></>}
            {infoStyle.variables.length > 0 && <><p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Slots</p><dl className="mb-3 space-y-1 text-[12.5px]">{infoStyle.variables.map((v) => <div key={v.name}><dt className="inline text-neutral-200">{v.name}: </dt><dd className="inline text-neutral-400">{v.examples}</dd></div>)}</dl></>}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => { if (!picked.includes(infoStyle.cardId)) toggle(infoStyle.cardId); setInfo(null); }} className="rounded-full bg-violet-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-violet-500">{picked.includes(infoStyle.cardId) ? 'Picked' : 'Use this style'}</button>
              {lib.canEdit && <StageChips style={infoStyle} onMove={moveTo} />}
              <Link href={`/channel/${channelId}/card/${infoStyle.cardId}`} className="flex items-center gap-1 text-[12.5px] text-neutral-400 hover:text-neutral-200">Open card <ExternalLink className="h-3.5 w-3.5" /></Link>
              {infoStyle.sourceUrl && <a href={infoStyle.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12.5px] text-neutral-400 hover:text-neutral-200">Source <ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          </div>
        </div>
      )}

      {toast && <p className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-neutral-800 px-4 py-2 text-[13px] text-neutral-100 shadow-xl">{toast}</p>}
    </Shell>
  );
}

function order(s: StyleStage) { return { curated: 0, tested: 1, testing: 2, new: 3, aside: 4 }[s]; }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100">
      {children}
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange(v: string): void; placeholder?: string }) {
  return (
    <label className="mb-2.5 block">
      <span className="mb-0.5 block text-[12px] text-neutral-500">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[14px] placeholder:text-neutral-600 focus:border-violet-400/60 focus:outline-none" />
    </label>
  );
}

function Chip({ onClick, children }: { onClick(): void; children: React.ReactNode }) {
  return <button onClick={onClick} className="rounded-full border border-white/15 px-2 py-0.5 text-[11.5px] text-neutral-200 hover:border-violet-400/60">{children}</button>;
}

/** Move the style's card on through the channel's testing columns. */
function StageChips({ style, onMove }: { style: Style; onMove(s: Style, to: StyleStage): void }) {
  const next: { to: StyleStage; label: string }[] = [];
  if (style.stage === 'new' || style.stage === 'testing') next.push({ to: 'tested', label: 'Mark tested' });
  if (style.stage !== 'curated') next.push({ to: 'curated', label: 'Curate' });
  if (style.stage !== 'aside') next.push({ to: 'aside', label: 'Set aside' });
  return <>{next.map((n) => <Chip key={n.to} onClick={() => onMove(style, n.to)}>{n.label}</Chip>)}</>;
}
