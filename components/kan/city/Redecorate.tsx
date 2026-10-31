'use client';

import { useMemo, useState } from 'react';
import { ArrowUp, Loader2, Send, Sparkles, Undo2 } from 'lucide-react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import {
  DEFAULT_FEATURES, FEATURES, FLOORS, INTERIOR_PLANS, LIGHTS, planInterior, ROOM_COLORS, ROOM_DISPLAYS, roomKey,
  type Feature, type InteriorStyle, type RoomDisplay,
} from '@/lib/kan/city/interior';

/**
 * Rearranging a building from the inside. The floor plan is a blueprint you can tap:
 * pick a room and choose how it shows its cards, its color, or bring it to the front.
 * The rest are one-tap choices, and anything else you can just tell Kan. Every change
 * lands at once, and the rooms rebuild around you while you watch.
 */

const PLAN_LABEL: Record<keyof typeof INTERIOR_PLANS, string> = { hallway: 'Hallway', open: 'Open hall', atrium: 'Courtyard' };
const DISPLAY_LABEL: Record<RoomDisplay, string> = { board: '📌 Cork board', shelves: '📚 Library', gallery: '🖼️ Gallery' };
const FLOOR_LABEL: Record<keyof typeof FLOORS, string> = { wood: 'Wood', tile: 'Tile', carpet: 'Carpet', marble: 'Marble', grass: 'Grass', checker: 'Checker' };
const LIGHT_LABEL: Record<keyof typeof LIGHTS, string> = { warm: '☀️ Warm', daylight: '🌤️ Daylight', cozy: '🕯️ Cozy', party: '🪩 Party' };
const FEATURE_LABEL: Record<Feature, string> = { fireplace: '🔥 Fireplace', plants: '🪴 Plants', fountain: '⛲ Fountain', piano: '🎹 Piano', aquarium: '🐠 Fish tank', sofa: '🛋️ Sofa', lamps: '💡 Lamps', disco: '🪩 Disco ball' };

const IDEAS = ['Make it cozy with a fireplace', 'Turn the done room into a library', 'Party time!', 'Make it feel like a museum'];

export function Redecorate({ name, columns, apps, style, canEdit, busy, onSave, onAsk }: {
  name: string;
  columns: { id: string; name: string; cards: number }[];
  apps: number;
  style: InteriorStyle;
  canEdit: boolean;
  busy: boolean;
  onSave(style: InteriorStyle): void;
  onAsk(text: string): void;
}) {
  const [room, setRoom] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const plan = useMemo(() => planInterior({ columns, apps, style }), [columns, apps, style]);
  const b = plan.bounds;
  const pad = 1.2;
  const view = `${b.x0 - pad} ${b.z0 - pad} ${b.x1 - b.x0 + pad * 2} ${b.z1 - b.z0 + pad * 2 + 1.5}`;
  const picked = plan.rooms.find((r) => r.id === room && r.kind === 'column') ?? null;
  const features = style.features ?? DEFAULT_FEATURES;

  const setRoomStyle = (colName: string, patch: { display?: RoomDisplay; color?: string }) => {
    const k = roomKey(colName);
    onSave({ ...style, rooms: { ...(style.rooms ?? {}), [k]: { ...(style.rooms?.[k] ?? {}), ...patch } } });
  };
  const toFront = (colName: string) => {
    const order = [roomKey(colName), ...columns.map((c) => roomKey(c.name)).filter((k) => k !== roomKey(colName))];
    onSave({ ...style, order });
  };
  const send = () => { const t = ask.trim(); if (!t) return; onAsk(t); setAsk(''); };

  return (
    <div>
      <p className="pr-8 text-[11px] uppercase tracking-wider text-violet-300">Redecorate</p>
      <h3 className="mt-0.5 pr-8 text-[19px] font-semibold leading-tight text-neutral-50">Inside {name}</h3>
      {!canEdit && <p className="mt-1.5 text-[13px] text-neutral-400">This building is shared with you, so only its owner can rearrange it.</p>}

      {/* Ask Kan: the easy way. */}
      {canEdit && (
        <div className="mt-3 rounded-2xl border border-violet-400/30 bg-violet-500/[0.07] p-2.5">
          <div className="flex items-center gap-2">
            <KanthinkIcon size={16} className="flex-shrink-0 text-violet-300" />
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
              disabled={busy}
              placeholder="Tell Kan how to change it…"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
            <button onClick={send} disabled={busy || !ask.trim()} className="flex-shrink-0 rounded-full bg-violet-600 p-1.5 text-white hover:bg-violet-500 disabled:opacity-40">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button key={i} disabled={busy} onClick={() => onAsk(i)} className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[12px] text-neutral-300 hover:bg-white/10 disabled:opacity-40">
                <Sparkles className="h-3 w-3 text-violet-300" /> {i}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The blueprint. Tap a room. */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-sky-300/20 bg-[#0d2240]">
        <svg viewBox={view} className="block max-h-[300px] w-full" style={{ backgroundImage: 'linear-gradient(rgba(125,211,252,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.08) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
          {plan.rooms.map((r) => {
            const tappable = r.kind === 'column' && canEdit;
            const sel = r.id === room;
            return (
              <g key={r.id} onClick={() => tappable && setRoom(sel ? null : r.id)} style={{ cursor: tappable ? 'pointer' : 'default' }}>
                <rect
                  x={r.rect.x0} y={r.rect.z0} width={r.rect.x1 - r.rect.x0} height={r.rect.z1 - r.rect.z0}
                  fill={r.kind === 'column' || r.kind === 'arcade' ? r.color : r.kind === 'court' ? '#3f8a3c' : '#7dd3fc'}
                  fillOpacity={sel ? 0.55 : r.kind === 'column' || r.kind === 'arcade' ? 0.25 : 0.08}
                  stroke={sel ? '#ffffff' : 'none'} strokeWidth={0.15}
                />
                {(r.kind === 'column' || r.kind === 'arcade' || r.kind === 'lobby') && (
                  <>
                    <text x={(r.rect.x0 + r.rect.x1) / 2} y={(r.rect.z0 + r.rect.z1) / 2} textAnchor="middle" fontSize={Math.min(1.1, (r.rect.x1 - r.rect.x0) / Math.max(4, r.name.length * 0.62))} fill="#e0f2fe" fontWeight={700}>{r.kind === 'lobby' ? 'Lobby' : r.name}</text>
                    {r.kind !== 'lobby' && (
                      <text x={(r.rect.x0 + r.rect.x1) / 2} y={(r.rect.z0 + r.rect.z1) / 2 + 1.1} textAnchor="middle" fontSize={0.7} fill="#bae6fd" fillOpacity={0.8}>
                        {r.kind === 'arcade' ? `🕹️ ${r.count}` : `${DISPLAY_LABEL[r.display ?? 'board'].split(' ')[0]} ${r.count}`}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
          {plan.walls.map((w, i) => <line key={i} x1={w.x0} y1={w.z0} x2={w.x1} y2={w.z1} stroke="#e0f2fe" strokeWidth={0.22} strokeLinecap="square" />)}
          {plan.dividers.map((w, i) => <line key={`d${i}`} x1={w.x0} y1={w.z0} x2={w.x1} y2={w.z1} stroke="#e0f2fe" strokeWidth={0.14} strokeDasharray="0.3 0.25" />)}
          <text x={plan.entrance.x} y={plan.entrance.z + 1.1} textAnchor="middle" fontSize={0.7} fill="#86efac" fontWeight={700}>▲ way in</text>
        </svg>
        {picked ? (
          <div className="border-t border-sky-300/15 p-2.5">
            <p className="text-[12px] font-medium text-sky-100">{picked.name} <span className="text-sky-200/60">· {picked.count} card{picked.count === 1 ? '' : 's'}</span></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(Object.keys(ROOM_DISPLAYS) as RoomDisplay[]).map((d) => (
                <Opt key={d} on={(picked.display ?? 'board') === d} disabled={busy} onClick={() => setRoomStyle(picked.name, { display: d })}>{DISPLAY_LABEL[d]}</Opt>
              ))}
              <Opt on={false} disabled={busy} onClick={() => toFront(picked.name)}><ArrowUp className="h-3 w-3" /> First</Opt>
            </div>
            <div className="mt-2 flex gap-1.5">
              {ROOM_COLORS.map((c) => (
                <button key={c} disabled={busy} onClick={() => setRoomStyle(picked.name, { color: c })} className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-[#0d2240] ${picked.color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} aria-label={c} />
              ))}
            </div>
          </div>
        ) : canEdit ? (
          <p className="border-t border-sky-300/15 px-3 py-2 text-[12px] text-sky-100/70">Tap a room to change how it shows its cards.</p>
        ) : null}
      </div>

      {canEdit && (
        <>
          <Row label="Floor plan">
            {(Object.keys(INTERIOR_PLANS) as (keyof typeof INTERIOR_PLANS)[]).map((k) => (
              <Opt key={k} on={(style.plan ?? 'hallway') === k} disabled={busy} onClick={() => onSave({ ...style, plan: k })}>{PLAN_LABEL[k]}</Opt>
            ))}
          </Row>
          <Row label="Lights">
            {(Object.keys(LIGHTS) as (keyof typeof LIGHTS)[]).map((k) => (
              <Opt key={k} on={style.light === k} disabled={busy} onClick={() => onSave({ ...style, light: k })}>{LIGHT_LABEL[k]}</Opt>
            ))}
          </Row>
          <Row label="Floor">
            {(Object.keys(FLOORS) as (keyof typeof FLOORS)[]).map((k) => (
              <Opt key={k} on={style.floor === k} disabled={busy} onClick={() => onSave({ ...style, floor: k })}>{FLOOR_LABEL[k]}</Opt>
            ))}
          </Row>
          <Row label="In the lobby">
            {(Object.keys(FEATURES) as Feature[]).map((k) => {
              const on = features.includes(k);
              return <Opt key={k} on={on} disabled={busy} onClick={() => onSave({ ...style, features: on ? features.filter((f) => f !== k) : [...features, k] })}>{FEATURE_LABEL[k]}</Opt>;
            })}
          </Row>
          {Object.keys(style).length > 0 && (
            <button disabled={busy} onClick={() => onSave({})} className="mt-4 flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-neutral-200 disabled:opacity-40">
              <Undo2 className="h-3.5 w-3.5" /> Back to how it started
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Opt({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] disabled:opacity-40 ${on ? 'bg-violet-500 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}
