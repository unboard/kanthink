'use client';

// Whisker Wilds — Style Studio: kids design their cat's face shape, ears,
// eyes, mouth, whiskers, tail, and collar, with close-up inspection views
// so they can study every detail up close.

import { useState } from 'react';
import { Game } from './game';
import CatViewer, { type ViewerView } from './CatViewer';
import {
  FACE_SHAPES, EAR_STYLES, EYE_STYLES, MOUTH_STYLES, TAIL_STYLES, WHISKER_STYLES, PAW_STYLES, CLAW_STYLES,
  FACE_LABELS, EAR_LABELS, EYE_LABELS, MOUTH_LABELS, TAIL_LABELS, WHISKER_LABELS, PAW_LABELS, CLAW_LABELS,
  ACCESSORY_LABELS, EYE_COLORS, ACCENT_COLORS,
} from './data';
import type { AccessoryId, CatStyle } from './types';
import { DEFAULT_STYLE } from './types';

const PAPER = '#f6f1e3';
const INK = '#33301f';
const INK_SOFT = '#6b6450';
const CARD = '#fdfaf1';
const LINE = '#dcd3bb';
const GREEN = '#5c7a3f';

interface Tab {
  key: string;
  label: string;
  icon: string;
  view: ViewerView;
}

const TABS: Tab[] = [
  { key: 'face', label: 'Face', icon: '🐱', view: 'face' },
  { key: 'ears', label: 'Ears', icon: '📡', view: 'ears' },
  { key: 'eyes', label: 'Eyes', icon: '👀', view: 'eyes' },
  { key: 'mouth', label: 'Mouth', icon: '😺', view: 'mouth' },
  { key: 'paws', label: 'Paws', icon: '🐾', view: 'paws' },
  { key: 'whiskers', label: 'Whiskers', icon: '〰️', view: 'whiskers' },
  { key: 'tail', label: 'Tail', icon: '🌀', view: 'tail' },
  { key: 'collar', label: 'Collar', icon: '🎀', view: 'full' },
];

function OptionChips<T extends string>({
  options, labels, value, onPick,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          className="rounded-2xl border-2 px-4 py-3 text-sm font-bold active:scale-95"
          style={{
            borderColor: value === o ? GREEN : LINE,
            background: value === o ? '#dbe7c9' : CARD,
            color: INK,
          }}
          onPointerDown={() => onPick(o)}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function ColorSwatches({ colors, value, onPick }: { colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          className="h-11 w-11 rounded-full border-4 active:scale-90"
          style={{ background: c, borderColor: value === c ? INK : 'rgba(0,0,0,0.12)' }}
          aria-label={c}
          onPointerDown={() => onPick(c)}
        />
      ))}
    </div>
  );
}

export default function StyleStudio({ game, catId, onClose }: { game: Game; catId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [zoomed, setZoomed] = useState(true);
  const [rot, setRot] = useState<number | null>(null);
  const [, force] = useState(0);
  const bump = () => force((v) => v + 1);

  const cat = game.save.cats.find((c) => c.id === catId) ?? game.save.cats[0];
  const style: CatStyle = { ...DEFAULT_STYLE, ...cat.style };
  const save = game.save;

  const view: ViewerView = zoomed ? tab.view : 'full';

  return (
    <div className="absolute inset-0 z-50 overflow-auto" style={{ background: PAPER, color: INK }}>
      {/* header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-2.5"
        style={{ background: PAPER, borderColor: LINE }}>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-fraunces)' }}>
          🎨 Style Studio · {cat.name}
        </h1>
        <button className="rounded-full px-5 py-2 text-sm font-bold text-white active:scale-95" style={{ background: INK }}
          onPointerDown={onClose}>
          ✓ Done
        </button>
      </div>

      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:flex-row">
        {/* viewer + inspection controls */}
        <div className="flex shrink-0 flex-col items-center rounded-3xl border p-3 md:w-96" style={{ background: CARD, borderColor: LINE }}>
          <CatViewer spec={cat} size={340} view={view} rotation={rot} />
          <div className="mt-1 flex w-full items-center justify-center gap-2">
            <button
              className="rounded-full border-2 px-4 py-2 text-sm font-bold active:scale-95"
              style={{ borderColor: zoomed ? GREEN : LINE, background: zoomed ? '#dbe7c9' : PAPER }}
              onPointerDown={() => setZoomed(!zoomed)}
            >
              {zoomed ? '🔍 Looking closer!' : '🔍 Look closer'}
            </button>
            <button className="rounded-full border px-3 py-2 text-xs" style={{ borderColor: LINE }}
              onPointerDown={() => setRot(null)}>
              ↺ reset spin
            </button>
          </div>
          <div className="mt-1 flex w-full items-center gap-2 px-2">
            <span className="text-xs" style={{ color: INK_SOFT }}>spin</span>
            <input
              type="range" min={-314} max={314} value={rot === null ? 0 : Math.round(rot * 100)}
              onChange={(e) => setRot(Number(e.target.value) / 100)}
              className="flex-1"
            />
          </div>
          <p className="mt-1 text-center text-[11px]" style={{ color: INK_SOFT }}>
            Pick a part below to zoom right up to it — every detail is yours to choose!
          </p>
        </div>

        {/* tabs + options */}
        <div className="flex-1">
          <div className="flex gap-1.5 overflow-x-auto pb-2" style={{ touchAction: 'pan-x' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className="shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold active:scale-95"
                style={{
                  borderColor: tab.key === t.key ? GREEN : LINE,
                  background: tab.key === t.key ? '#dbe7c9' : CARD,
                }}
                onPointerDown={() => { setTab(t); setZoomed(true); setRot(null); }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl border p-4" style={{ background: CARD, borderColor: LINE }}>
            {tab.key === 'face' && (
              <>
                <StudioTitle text="Face shape" />
                <OptionChips options={FACE_SHAPES} labels={FACE_LABELS} value={style.face}
                  onPick={(v) => { game.setStyle(cat.id, { face: v }); bump(); }} />
              </>
            )}
            {tab.key === 'ears' && (
              <>
                <StudioTitle text="Ear style" />
                <OptionChips options={EAR_STYLES} labels={EAR_LABELS} value={style.ears}
                  onPick={(v) => { game.setStyle(cat.id, { ears: v }); bump(); }} />
              </>
            )}
            {tab.key === 'eyes' && (
              <>
                <StudioTitle text="Eye shape" />
                <OptionChips options={EYE_STYLES} labels={EYE_LABELS} value={style.eyes}
                  onPick={(v) => { game.setStyle(cat.id, { eyes: v }); bump(); }} />
                <StudioTitle text="Eye color" top />
                <ColorSwatches colors={EYE_COLORS} value={cat.coat.eyeColor}
                  onPick={(c) => { game.setEyeColor(cat.id, c); bump(); }} />
              </>
            )}
            {tab.key === 'mouth' && (
              <>
                <StudioTitle text="Mouth" />
                <OptionChips options={MOUTH_STYLES} labels={MOUTH_LABELS} value={style.mouth}
                  onPick={(v) => { game.setStyle(cat.id, { mouth: v }); bump(); }} />
              </>
            )}
            {tab.key === 'paws' && (
              <>
                <StudioTitle text="Paw style" />
                <OptionChips options={PAW_STYLES} labels={PAW_LABELS} value={style.paws}
                  onPick={(v) => { game.setStyle(cat.id, { paws: v }); bump(); }} />
                <StudioTitle text="Claws" top />
                <OptionChips options={CLAW_STYLES} labels={CLAW_LABELS} value={style.claws}
                  onPick={(v) => { game.setStyle(cat.id, { claws: v }); bump(); }} />
              </>
            )}
            {tab.key === 'whiskers' && (
              <>
                <StudioTitle text="Whiskers" />
                <OptionChips options={WHISKER_STYLES} labels={WHISKER_LABELS} value={style.whiskers}
                  onPick={(v) => { game.setStyle(cat.id, { whiskers: v }); bump(); }} />
              </>
            )}
            {tab.key === 'tail' && (
              <>
                <StudioTitle text="Tail" />
                <OptionChips options={TAIL_STYLES} labels={TAIL_LABELS} value={style.tail}
                  onPick={(v) => { game.setStyle(cat.id, { tail: v }); bump(); }} />
              </>
            )}
            {tab.key === 'collar' && (
              <>
                <StudioTitle text="Collars & accessories" />
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(ACCESSORY_LABELS) as AccessoryId[]).map((a) => {
                    const unlocked = a === 'none' || save.unlockedAccessories.includes(a);
                    return (
                      <button key={a} disabled={!unlocked}
                        className="rounded-2xl border-2 px-4 py-3 text-sm font-bold active:scale-95 disabled:opacity-40"
                        style={{
                          borderColor: cat.accessory === a ? GREEN : LINE,
                          background: cat.accessory === a ? '#dbe7c9' : CARD,
                          color: INK,
                        }}
                        onPointerDown={() => { if (unlocked) { game.setAccessory(cat.id, a); bump(); } }}>
                        {unlocked ? ACCESSORY_LABELS[a] : `🔒 ${ACCESSORY_LABELS[a]}`}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px]" style={{ color: INK_SOFT }}>Rank up in the Wilds to unlock the locked ones!</p>
                <StudioTitle text="Accessory color" top />
                <ColorSwatches colors={ACCENT_COLORS} value={cat.coat.accentColor}
                  onPick={(c) => { game.setAccentColor(cat.id, c); bump(); }} />
              </>
            )}
          </div>

          <p className="mt-2 text-center text-xs" style={{ color: INK_SOFT }}>
            Everything saves automatically — your cat wears it in the Wilds right away! 🐾
          </p>
        </div>
      </div>
    </div>
  );
}

function StudioTitle({ text, top = false }: { text: string; top?: boolean }) {
  return (
    <div className={`mb-2 text-sm font-bold ${top ? 'mt-4' : ''}`} style={{ fontFamily: 'var(--font-fraunces)', color: INK }}>
      {text}
    </div>
  );
}
