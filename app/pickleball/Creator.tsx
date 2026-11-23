'use client';

// Pickleball: the character creator. A turntable on the left, big choices on the right,
// fast enough for a 7-year-old: pick a starting look, type a name, tap what's you.

import { useEffect, useRef, useState } from 'react';
import { FigurePreview } from './render';
import type { FigureProp } from './figure';
import {
  ACCESSORY_LABEL, FACE_LABEL, FACIAL_LABEL, HAIR_COLORS, HAIR_LABEL, HEIGHT_LABEL, OUTFIT_COLORS, OUTFIT_LABEL,
  PADDLE_COLORS, PRESETS, SKINS, STYLE_LABEL, VICTORY_LABEL, randomCharacter, victoryOf, type Character,
} from './characters';
import { Label, Options, Portrait, Swatches, btnGhost, btnPrimary, chip, panel } from './ui';

type Tab = 'look' | 'outfit' | 'play';

export function Creator({ initial, isNew, onSave, onCancel, onDelete, prop = 'paddle' }: {
  prop?: FigureProp;
  initial: Character;
  isNew: boolean;
  onSave: (c: Character) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [c, setC] = useState<Character>(initial);
  const [tab, setTab] = useState<Tab>('look');
  const stage = useRef<HTMLDivElement>(null);
  const preview = useRef<FigurePreview | null>(null);
  const set = <K extends keyof Character>(k: K, v: Character[K]) => setC((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!stage.current) return;
    try {
      preview.current = new FigurePreview(stage.current, prop);
    } catch {
      preview.current = null; // no WebGL: the portrait still shows the look
    }
    return () => { preview.current?.dispose(); preview.current = null; };
  }, [prop]);
  const key = JSON.stringify({ ...c, name: '' });
  useEffect(() => { preview.current?.show(c); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`${panel} flex max-h-[calc(100dvh-24px)] w-[min(1040px,calc(100vw-24px))] flex-col overflow-hidden md:flex-row`}>
      <div className="relative h-[min(260px,30dvh)] shrink-0 bg-gradient-to-b from-[#1b3352] to-[#0b1424] md:h-auto md:w-[44%]">
        <div ref={stage} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-5 top-5 flex items-center gap-3">
          <Portrait c={c} size={52} ring="#dcff3d" />
          <div>
            <div className="text-[22px] font-black leading-none tracking-tight">{c.name || 'Player'}</div>
            <div className="mt-1 text-[12px] font-semibold text-[#dcff3d]">{STYLE_LABEL[c.style].name}</div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-[12px] text-white/40">Drag to spin</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col [@media(max-height:520px)]:overflow-y-auto">
        <div className="border-b border-white/10 p-5 pb-4 [@media(max-height:520px)]:p-3">
          {isNew && (
            <>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">Start from</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => setC((x) => ({ ...x, ...p.c }))} className="flex items-center gap-2 rounded-2xl bg-white/[0.06] py-1.5 pl-1.5 pr-3 text-[13px] font-semibold hover:bg-white/15">
                    <Portrait c={{ ...p.c, id: 'p', name: p.label }} size={30} />
                    {p.label}
                  </button>
                ))}
                <button type="button" onClick={() => setC((x) => ({ ...randomCharacter(x.name), id: x.id }))} className="rounded-2xl bg-white/[0.06] px-3 py-1.5 text-[13px] font-semibold hover:bg-white/15">🎲 Surprise me</button>
              </div>
            </>
          )}
          <input
            value={c.name}
            onChange={(e) => set('name', e.target.value.slice(0, 12))}
            placeholder="Your name"
            className="w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-[20px] font-bold text-white outline-none placeholder:text-white/25 focus:border-[#dcff3d]/70"
          />
          <div className="mt-3 flex gap-1.5">
            {(['look', 'outfit', 'play'] as Tab[]).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={chip(tab === t)}>
                {t === 'look' ? 'Look' : t === 'outfit' ? (prop === 'paddle' ? 'Outfit & paddle' : 'Outfit') : 'How you play'}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 [@media(max-height:520px)]:flex-none [@media(max-height:520px)]:overflow-visible">
          {tab === 'look' && (
            <>
              <Label>Size</Label>
              <Options value={c.height} options={HEIGHT_LABEL} onChange={(v) => set('height', v)} />
              <Label>Skin</Label>
              <Swatches colors={SKINS} value={c.skin} onChange={(v) => set('skin', v)} />
              <Label>Hair</Label>
              <Options value={c.hair} options={HAIR_LABEL} onChange={(v) => set('hair', v)} />
              <div className="mt-3"><Swatches colors={HAIR_COLORS} value={c.hairColor} onChange={(v) => set('hairColor', v)} /></div>
              <Label>Face</Label>
              <Options value={c.face} options={FACE_LABEL} onChange={(v) => set('face', v)} />
              <Label>Facial hair</Label>
              <Options value={c.facialHair} options={FACIAL_LABEL} onChange={(v) => set('facialHair', v)} />
              <Label>Extras</Label>
              <Options value={c.accessory} options={ACCESSORY_LABEL} onChange={(v) => set('accessory', v)} />
            </>
          )}
          {tab === 'outfit' && (
            <>
              <Label>Outfit</Label>
              <Options value={c.outfit} options={OUTFIT_LABEL} onChange={(v) => set('outfit', v)} />
              <Label>Main color</Label>
              <Swatches colors={OUTFIT_COLORS} value={c.primary} onChange={(v) => set('primary', v)} />
              <Label>Accent color</Label>
              <Swatches colors={OUTFIT_COLORS} value={c.accent} onChange={(v) => set('accent', v)} />
              <Label>Jersey number</Label>
              <input
                type="number" min={0} max={99} value={c.number}
                onChange={(e) => set('number', Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))))}
                className="w-24 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-[18px] font-bold text-white outline-none focus:border-[#dcff3d]/70"
              />
              {prop === 'paddle' && (
                <>
                  <Label>Paddle</Label>
                  <Swatches colors={PADDLE_COLORS} value={c.paddle} onChange={(v) => set('paddle', v)} round={false} />
                </>
              )}
            </>
          )}
          {tab === 'play' && (
            <>
              <p className="mb-4 text-[14px] leading-relaxed text-white/65">
                Everyone plays by the same rules. These change how much the game helps your shots, so a first-timer and a regular can play a real game together.
              </p>
              <div className="flex flex-col gap-2.5">
                {(Object.keys(STYLE_LABEL) as Array<keyof typeof STYLE_LABEL>).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set('style', k)}
                    className={`rounded-2xl border-2 p-4 text-left transition ${c.style === k ? 'border-[#dcff3d] bg-[#dcff3d]/10' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08]'}`}
                  >
                    <div className="text-[17px] font-black">{STYLE_LABEL[k].name}</div>
                    <div className="mt-0.5 text-[13.5px] text-white/65">{STYLE_LABEL[k].blurb}</div>
                  </button>
                ))}
              </div>
              <Label>Victory move</Label>
              <Options value={victoryOf(c)} options={VICTORY_LABEL} onChange={(v) => { set('victory', v); setTimeout(() => preview.current?.cheer(), 60); }} />
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 border-t border-white/10 p-4 [@media(max-height:520px)]:sticky [@media(max-height:520px)]:bottom-0 [@media(max-height:520px)]:bg-[#0b1424] [@media(max-height:520px)]:p-2.5">
          <button type="button" className={btnPrimary} disabled={!c.name.trim()} onClick={() => onSave({ ...c, name: c.name.trim() })}>
            {isNew ? 'Save player' : 'Save changes'}
          </button>
          <button type="button" className={btnGhost} onClick={onCancel}>Cancel</button>
          {onDelete && <button type="button" onClick={onDelete} className="ml-auto text-[13px] font-semibold text-white/40 hover:text-[#ff8a7a]">Delete</button>}
        </div>
      </div>
    </div>
  );
}
