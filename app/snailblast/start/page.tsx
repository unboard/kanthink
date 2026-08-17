'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp, Check, X, MapPin, Upload, Target, LayoutTemplate,
  Image as ImageIcon, TriangleAlert, CircleCheck, FileText,
} from 'lucide-react';
import './start.css';
import {
  emptyCampaign, campaignSteps, checkListColumns, estimateCost, inHomeWindow,
  mailingGuide, POSTCARD_SIZES,
  type CampaignState, type AudienceMode,
} from '@/lib/snailblast/campaign';
import { OPENING_MESSAGE, OPENING_CHIPS } from '@/lib/snailblast/prompt';

type PanelId = 'map' | 'upload' | 'targeting' | 'templates' | 'artwork';

interface Msg { id: string; role: 'user' | 'assistant'; content: string }

interface Finding { severity: 'blocker' | 'warning' | 'ok'; title: string; detail: string }

function uid() { return Math.random().toString(36).slice(2); }

function Snail({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.2 17.6h12.4" />
      <path d="M2.2 17.6c0-2.4 1.5-3.9 3.4-4.3" />
      <path d="M4.6 13.3 3.3 10.6" /><circle cx="3.1" cy="9.8" r=".95" />
      <path d="M6.9 13 6.7 10.2" /><circle cx="6.6" cy="9.4" r=".95" />
      <circle cx="14.4" cy="12.4" r="5.2" />
      <path d="M14.4 9.2a3.2 3.2 0 1 1-3.2 3.2 2.05 2.05 0 1 0 2.05-2.05" />
    </svg>
  );
}

/* ------------------------------------------------------------------ EDDM map */

interface Route { id: string; name: string; homes: number; businesses: number }

/**
 * Carrier routes for a ZIP. Derived deterministically from the ZIP so the same
 * search always returns the same routes — the live product reads real USPS
 * route data, and this stands in for that call.
 */
function routesForZip(zip: string): Route[] {
  let seed = 0;
  for (const ch of zip) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 0xffffffff; };
  const streets = ['Maple', 'Oakwood', 'Riverbend', 'Kingsley', 'Fairview', 'Highland', 'Brookside', 'Cedar Hollow'];
  const count = 4 + Math.floor(rand() * 4);
  return Array.from({ length: count }, (_, i) => ({
    id: `${zip}-C${String(i + 1).padStart(3, '0')}`,
    name: `${streets[Math.floor(rand() * streets.length)]} — Route C${String(i + 1).padStart(3, '0')}`,
    homes: 280 + Math.floor(rand() * 620),
    businesses: Math.floor(rand() * 45),
  }));
}

function MapPanel({ onApply }: { onApply: (label: string, pieces: number) => void }) {
  const [zip, setZip] = useState('');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const search = () => {
    if (!/^\d{5}$/.test(zip.trim())) return;
    setRoutes(routesForZip(zip.trim()));
    setPicked(new Set());
  };

  const total = routes.filter((r) => picked.has(r.id)).reduce((n, r) => n + r.homes + r.businesses, 0);

  return (
    <>
      <div className="sbs-panel-body">
        <p className="sbs-panel-note">
          Enter a ZIP to see its carrier routes, then pick the ones you want. EDDM
          mails every address on a route — no list needed.
        </p>
        <div className="sbs-field">
          <input
            className="sbs-text" value={zip} inputMode="numeric" maxLength={5}
            placeholder="ZIP code, e.g. 43215"
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          />
          <button className="sb-btn sb-btn-primary" onClick={search} disabled={zip.length !== 5}>
            Search
          </button>
        </div>

        <div className="sbs-list">
          {routes.map((r) => {
            const on = picked.has(r.id);
            return (
              <button key={r.id} className="sbs-row" data-on={on} onClick={() => {
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                  return next;
                });
              }}>
                <span className="sbs-check">{on && <Check size={13} strokeWidth={3} />}</span>
                <span className="sbs-row-main">
                  <span className="sbs-row-title">{r.name}</span>
                  <span className="sbs-row-sub">
                    {r.homes.toLocaleString()} homes · {r.businesses} businesses
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sbs-panel-foot">
        <span className="sbs-panel-count">{total.toLocaleString()} addresses</span>
        <button
          className="sb-btn sb-btn-primary" style={{ marginLeft: 'auto' }}
          disabled={total === 0}
          onClick={() => onApply(`${picked.size} route${picked.size === 1 ? '' : 's'} in ${zip}`, total)}
        >
          Use these routes
        </button>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- list upload */

/** Split one CSV line, honouring simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function UploadPanel({ onApply }: { onApply: (label: string, pieces: number) => void }) {
  const [file, setFile] = useState<string | null>(null);
  const [check, setCheck] = useState<ReturnType<typeof checkListColumns> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (f: File) => {
    setError(null);
    if (!/\.(csv|txt)$/i.test(f.name)) {
      setError('Upload a .csv for now — .xls and .xlsx are read on the server in the live builder.');
      setFile(f.name);
      setCheck(null);
      return;
    }
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) { setError('That file is empty.'); return; }
    const headers = splitCsvLine(lines[0]);
    setFile(f.name);
    setCheck(checkListColumns(headers, Math.max(0, lines.length - 1)));
  };

  return (
    <>
      <div className="sbs-panel-body">
        <p className="sbs-panel-note">
          Drop in a CSV export from your CRM. I&apos;ll tell you whether it has
          everything the Post Office needs before you pay for anything.
        </p>

        <label className="sbs-drop">
          <FileText size={22} style={{ margin: '0 auto', display: 'block' }} />
          <span className="sbs-drop-title">{file ?? 'Choose a mailing list'}</span>
          <span className="sbs-drop-sub">CSV · name, address, city, state, ZIP</span>
          <input
            type="file" accept=".csv,.txt,text/csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
          />
        </label>

        {error && (
          <div className="sbs-finding" data-sev="warning" style={{ marginTop: '1rem' }}>
            <TriangleAlert size={16} className="sbs-finding-icon" />
            <div><div className="sbs-finding-title">Can&apos;t read that here</div>
              <div className="sbs-finding-detail">{error}</div></div>
          </div>
        )}

        {check && (
          <div style={{ marginTop: '1.25rem' }}>
            <div className="sbs-finding" data-sev={check.missing.length ? 'blocker' : 'ok'}>
              {check.missing.length
                ? <TriangleAlert size={16} className="sbs-finding-icon" />
                : <CircleCheck size={16} className="sbs-finding-icon" />}
              <div>
                <div className="sbs-finding-title">
                  {check.rows.toLocaleString()} {check.rows === 1 ? 'address' : 'addresses'}
                  {check.missing.length ? ' — missing required columns' : ' — ready to mail'}
                </div>
                <div className="sbs-finding-detail">
                  {check.missing.length
                    ? `Add a column for: ${check.missing.join(', ')}.`
                    : 'Every column the Post Office needs is present.'}
                </div>
              </div>
            </div>

            {check.warnings.map((w) => (
              <div key={w} className="sbs-finding" data-sev="warning">
                <TriangleAlert size={16} className="sbs-finding-icon" />
                <div><div className="sbs-finding-detail" style={{ marginTop: 0 }}>{w}</div></div>
              </div>
            ))}

            <ul className="sbs-guide" style={{ marginTop: '0.75rem' }}>
              {Object.entries(check.detected).map(([field, col]) => (
                <li key={field}>{field}: {col ? <strong>{col}</strong> : '—'}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="sbs-panel-foot">
        <span className="sbs-panel-count">
          {check ? `${check.rows.toLocaleString()} ${check.rows === 1 ? 'row' : 'rows'}` : 'No file yet'}
        </span>
        <button
          className="sb-btn sb-btn-primary" style={{ marginLeft: 'auto' }}
          disabled={!check || check.missing.length > 0 || check.rows === 0}
          onClick={() => check && onApply(`${check.rows.toLocaleString()} uploaded addresses`, check.rows)}
        >
          Use this list
        </button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- targeting */

const FILTERS = [
  { id: 'homeowner', label: 'Homeowners only', factor: 0.62 },
  { id: 'income', label: 'Household income $75k+', factor: 0.44 },
  { id: 'age', label: 'Head of household 35–64', factor: 0.51 },
  { id: 'children', label: 'Children in the home', factor: 0.33 },
  { id: 'tenure', label: 'Moved in the last 12 months', factor: 0.09 },
];

function TargetingPanel({ onApply }: { onApply: (label: string, pieces: number) => void }) {
  const [zip, setZip] = useState('');
  const [radius, setRadius] = useState(5);
  const [on, setOn] = useState<Set<string>>(new Set());

  // Base household density scales with radius; filters multiply down from there.
  const base = zip.length === 5 ? Math.round(1400 * radius * 1.35) : 0;
  const count = Math.round(
    FILTERS.reduce((n, f) => (on.has(f.id) ? n * f.factor : n), base)
  );

  return (
    <>
      <div className="sbs-panel-body">
        <p className="sbs-panel-note">
          Build a list from scratch. Start with a radius, then narrow by who
          actually buys from you.
        </p>

        <div className="sbs-field">
          <input className="sbs-text" value={zip} inputMode="numeric" maxLength={5}
            placeholder="Center ZIP" onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
          <select className="sbs-text" value={radius} onChange={(e) => setRadius(Number(e.target.value))}
            style={{ flex: '0 0 8rem' }}>
            {[1, 3, 5, 10, 15, 25].map((r) => <option key={r} value={r}>{r} mile radius</option>)}
          </select>
        </div>

        <div className="sbs-list">
          {FILTERS.map((f) => {
            const active = on.has(f.id);
            return (
              <button key={f.id} className="sbs-row" data-on={active} onClick={() => {
                setOn((prev) => {
                  const next = new Set(prev);
                  if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                  return next;
                });
              }}>
                <span className="sbs-check">{active && <Check size={13} strokeWidth={3} />}</span>
                <span className="sbs-row-main"><span className="sbs-row-title">{f.label}</span></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sbs-panel-foot">
        <span className="sbs-panel-count">~{count.toLocaleString()} households</span>
        <button className="sb-btn sb-btn-primary" style={{ marginLeft: 'auto' }}
          disabled={count < 25}
          onClick={() => onApply(`${count.toLocaleString()} targeted households near ${zip}`, count)}>
          Use this list
        </button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- templates */

const TEMPLATES = [
  { id: 't1', name: 'Bold offer', bg: '#ffba55', line: 'SPRING\n20% OFF' },
  { id: 't2', name: 'Photo hero', bg: '#7ca8c4', line: 'BEFORE\n& AFTER' },
  { id: 't3', name: 'Neighborly', bg: '#f36f98', line: 'HELLO\nNEIGHBOR' },
  { id: 't4', name: 'Clean list', bg: '#fff7ec', line: 'WHAT WE\nDO' },
  { id: 't5', name: 'Urgent', bg: '#ff8100', line: 'BOOK\nBY FRIDAY' },
  { id: 't6', name: 'Trust badge', bg: '#ddcbbc', line: 'LICENSED\n& INSURED' },
];

function TemplatesPanel({
  sizeId, onSize, onApply,
}: { sizeId: string | null; onSize: (id: string) => void; onApply: (tplName: string) => void }) {
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <div className="sbs-panel-body">
        <p className="sbs-panel-note">Pick a size, then a starting point. You customise it in the editor.</p>

        <div className="sbs-list" style={{ marginBottom: '1.25rem' }}>
          {POSTCARD_SIZES.map((s) => (
            <button key={s.id} className="sbs-row" data-on={sizeId === s.id} onClick={() => onSize(s.id)}>
              <span className="sbs-check">{sizeId === s.id && <Check size={13} strokeWidth={3} />}</span>
              <span className="sbs-row-main">
                <span className="sbs-row-title">{s.label}</span>
                <span className="sbs-row-sub">
                  {s.eddm ? 'EDDM eligible' : 'Addressed mail'}{s.note ? ` · ${s.note}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="sbs-tpl-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="sbs-tpl" data-on={picked === t.id} onClick={() => setPicked(t.id)}>
              <span className="sbs-tpl-art" style={{ background: t.bg, whiteSpace: 'pre-line' }}>{t.line}</span>
              <span className="sbs-tpl-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sbs-panel-foot">
        <span className="sbs-panel-count">{sizeId ?? 'pick a size'}</span>
        <button className="sb-btn sb-btn-primary" style={{ marginLeft: 'auto' }}
          disabled={!picked || !sizeId}
          onClick={() => { const t = TEMPLATES.find((x) => x.id === picked); if (t) onApply(t.name); }}>
          Customise it
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- artwork */

function ArtworkPanel({
  mode, sizeId, onReviewed,
}: { mode: AudienceMode | null; sizeId: string | null; onReviewed: (summary: string) => void }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [preview, setPreview] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const guide = mailingGuide(mode ?? 'eddm');

  const review = async (dataUrl: string) => {
    setBusy(true); setFindings(null); setNote(null);
    try {
      const res = await fetch('/api/snailblast/artwork-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl, side, mode: mode ?? 'eddm', sizeId: sizeId ?? '9x6.5' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed');
      setFindings(data.findings ?? []);
      if (data.note) setNote(data.note);
      const blockers = (data.findings ?? []).filter((f: Finding) => f.severity === 'blocker').length;
      onReviewed(blockers
        ? `I reviewed the ${side}. ${blockers} thing${blockers === 1 ? '' : 's'} would stop it at the dock.`
        : `I reviewed the ${side} and it looks mailable.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Review failed');
    } finally { setBusy(false); }
  };

  const handle = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPreview(url);
      review(url);
    };
    reader.readAsDataURL(f);
  };

  return (
    <>
      <div className="sbs-panel-body">
        <div className="sbs-field">
          {(['front', 'back'] as const).map((s) => (
            <button key={s} className="sb-btn sb-btn-ghost" style={{ flex: 1 }}
              data-on={side === s}
              onClick={() => { setSide(s); setFindings(null); setPreview(null); }}>
              {s === 'front' ? 'Front' : 'Address side'}
            </button>
          ))}
        </div>

        {side === 'back' && (
          <>
            <p className="sbs-panel-note" style={{ marginBottom: '0.5rem' }}><strong>{guide.title}</strong></p>
            <ul className="sbs-guide" style={{ marginBottom: '1.25rem' }}>
              {guide.rules.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </>
        )}

        <label className="sbs-drop">
          {preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={preview} alt={`${side} artwork`} style={{ maxWidth: '100%', borderRadius: '0.5rem' }} />
            : <>
                <ImageIcon size={22} style={{ margin: '0 auto', display: 'block' }} />
                <span className="sbs-drop-title">Upload your {side === 'front' ? 'front' : 'address side'}</span>
                <span className="sbs-drop-sub">PNG or JPG · I&apos;ll check it against the mailing rules</span>
              </>}
          <input type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
        </label>

        {busy && <p className="sbs-panel-note" style={{ marginTop: '1rem' }}>Checking it over…</p>}

        {findings && (
          <div style={{ marginTop: '1.25rem' }}>
            {findings.length === 0 && <p className="sbs-panel-note">Nothing flagged.</p>}
            {findings.map((f, i) => (
              <div key={i} className="sbs-finding" data-sev={f.severity}>
                {f.severity === 'ok'
                  ? <CircleCheck size={16} className="sbs-finding-icon" />
                  : <TriangleAlert size={16} className="sbs-finding-icon" />}
                <div>
                  <div className="sbs-finding-title">{f.title}</div>
                  <div className="sbs-finding-detail">{f.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {note && <p className="sbs-panel-note" style={{ marginTop: '1rem' }}>{note}</p>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- page */

const PANEL_META: Record<PanelId, { title: string; icon: React.ReactNode }> = {
  map: { title: 'Choose your areas', icon: <MapPin size={16} /> },
  upload: { title: 'Upload a mailing list', icon: <Upload size={16} /> },
  targeting: { title: 'Build a targeted list', icon: <Target size={16} /> },
  templates: { title: 'Size & template', icon: <LayoutTemplate size={16} /> },
  artwork: { title: 'Artwork review', icon: <ImageIcon size={16} /> },
};

export default function SnailBlastStartPage() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: uid(), role: 'assistant', content: OPENING_MESSAGE },
  ]);
  const [chips, setChips] = useState<string[]>(OPENING_CHIPS);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<CampaignState>(emptyCampaign());
  const [panel, setPanel] = useState<PanelId | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const say = useCallback((content: string) => {
    setMessages((m) => [...m, { id: uid(), role: 'assistant', content }]);
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: Msg[] = [...messages, { id: uid(), role: 'user' as const, content: trimmed }];
    setMessages(next);
    setInput('');
    setChips([]);
    setBusy(true);

    try {
      const res = await fetch('/api/snailblast/campaign-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          state,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      say(data.reply);
      setChips(Array.isArray(data.chips) ? data.chips : []);

      if (data.updates) {
        setState((prev) => ({
          ...prev,
          ...(data.updates.industry ? { industry: data.updates.industry } : {}),
          ...(data.updates.goal ? { goal: data.updates.goal } : {}),
          audience: { ...prev.audience, ...(data.updates.audience ?? {}) },
          artwork: { ...prev.artwork, ...(data.updates.artwork ?? {}) },
          schedule: { ...prev.schedule, ...(data.updates.schedule ?? {}) },
        }));
      }
      if (data.panel) setPanel(data.panel as PanelId);
    } catch (e) {
      say(e instanceof Error ? `I hit a snag: ${e.message}` : 'I hit a snag. Try that again?');
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }, [busy, messages, state, say]);

  const applyAudience = (mode: AudienceMode, label: string, pieces: number) => {
    setState((p) => ({ ...p, audience: { mode, label, pieces } }));
    setPanel(null);
    const cost = estimateCost(mode, pieces);
    const win = inHomeWindow(mode);
    say(
      `Locked in: ${label}. That's about $${cost.totalLow.toLocaleString()}–$${cost.totalHigh.toLocaleString()} ` +
      `all in (print, postage and mailing), landing between ${win.earliest} and ${win.latest}. ` +
      `Next up is artwork — do you have a design, or should we start from a template?`
    );
    setChips(['Start from a template', 'I have artwork', 'Design it for me']);
  };

  const steps = campaignSteps(state);

  return (
    <div className="sb-root">
      <div className="sbs-shell">
        <header className="sbs-top">
          <Link href="/snailblast" className="sbs-back">
            <Snail className="sbs-back-glyph" />
            SnailBlast
          </Link>
          <div className="sbs-top-spacer" />
          <div className="sbs-steps">
            {steps.map((s) => (
              <span key={s.id} className="sbs-step" data-done={s.done}>
                <span className="sbs-step-dot" />
                {s.label}
                {s.detail && <span className="sbs-step-detail">{s.detail}</span>}
              </span>
            ))}
          </div>
        </header>

        <div className="sbs-body" data-panel={panel ? 'true' : 'false'}>
          <section className="sbs-chat">
            <div className="sbs-log" ref={logRef}>
              <div className="sbs-log-inner">
                {messages.map((m) => (
                  <div key={m.id} className="sbs-msg" data-role={m.role}>
                    {m.role === 'assistant' && (
                      <span className="sbs-avatar"><Snail style={{ width: 15, height: 15 }} /></span>
                    )}
                    <div className="sbs-bubble">{m.content}</div>
                  </div>
                ))}
                {busy && (
                  <div className="sbs-msg" data-role="assistant">
                    <span className="sbs-avatar"><Snail style={{ width: 15, height: 15 }} /></span>
                    <div className="sbs-bubble">
                      <span className="sbs-typing"><span /><span /><span /></span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sbs-foot">
              <div className="sbs-foot-inner">
                {chips.length > 0 && !busy && (
                  <div className="sbs-chips">
                    {chips.map((c) => (
                      <button key={c} className="sbs-chip" onClick={() => send(c)}>{c}</button>
                    ))}
                  </div>
                )}
                <div className="sbs-composer">
                  <textarea
                    ref={taRef} className="sbs-input" rows={1} value={input}
                    placeholder="Tell me about your business…"
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                    }}
                  />
                  <button className="sbs-send" onClick={() => send(input)}
                    disabled={busy || !input.trim()} aria-label="Send">
                    <ArrowUp size={16} strokeWidth={2.6} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {panel && (
            <aside className="sbs-panel">
              <div className="sbs-panel-top">
                {PANEL_META[panel].icon}
                <span className="sbs-panel-title">{PANEL_META[panel].title}</span>
                <button className="sbs-panel-close" onClick={() => setPanel(null)} aria-label="Close">
                  <X size={14} />
                </button>
              </div>

              {panel === 'map' && <MapPanel onApply={(l, n) => applyAudience('eddm', l, n)} />}
              {panel === 'upload' && <UploadPanel onApply={(l, n) => applyAudience('upload', l, n)} />}
              {panel === 'targeting' && <TargetingPanel onApply={(l, n) => applyAudience('targeted', l, n)} />}
              {panel === 'templates' && (
                <TemplatesPanel
                  sizeId={state.artwork.sizeId}
                  onSize={(id) => setState((p) => ({ ...p, artwork: { ...p.artwork, sizeId: id } }))}
                  onApply={(name) => {
                    setState((p) => ({ ...p, artwork: { ...p.artwork, mode: 'template' } }));
                    setPanel(null);
                    say(`Nice — "${name}" it is. Upload or tweak the artwork whenever you're ready and I'll check it against the mailing rules before it goes anywhere.`);
                    setChips(['Check my artwork', 'When would it land?']);
                  }}
                />
              )}
              {panel === 'artwork' && (
                <ArtworkPanel
                  mode={state.audience.mode} sizeId={state.artwork.sizeId}
                  onReviewed={(summary) => {
                    setState((p) => ({ ...p, artwork: { ...p.artwork, mode: p.artwork.mode ?? 'upload', reviewed: true } }));
                    say(summary);
                  }}
                />
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
