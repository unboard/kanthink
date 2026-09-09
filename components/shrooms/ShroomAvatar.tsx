'use client';

import { useId } from 'react';
import {
  capPath,
  stemPath,
  PALETTE,
  STEM_COLOR,
  resolveAvatar,
  type ShroomAvatarSpec,
} from '@/lib/shrooms/avatar';

interface ShroomAvatarProps {
  /** The shroom's id — used to derive a face when none was chosen. */
  id: string;
  /** The stored "cap:stem:pattern:colour", if the shroom has one. */
  avatar?: string | null;
  /** Draw this exact face instead of resolving from id/avatar. Used by the picker. */
  spec?: ShroomAvatarSpec;
  size?: number;
  className?: string;
}

/**
 * A shroom, drawn flat.
 *
 * Solid colour, no gradients, no shading, no shadow — the cap shape, the stem shape
 * and the marking do the work. Stem first, cap over it, pattern clipped to the cap.
 *
 * The clip id is per-instance: several of these render in one row and SVG defs are
 * document-global, so a shared id means the first one on the page wins and every
 * other shroom quietly borrows its clip.
 */
export function ShroomAvatar({ id, avatar, spec, size = 16, className = '' }: ShroomAvatarProps) {
  const uid = useId().replace(/:/g, '');
  const a = spec ?? resolveAvatar(id, avatar);
  const c = PALETTE.find((p) => p.key === a.color) ?? PALETTE[0];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={`kc-${uid}`}>
          <path d={capPath(a.cap)} />
        </clipPath>
      </defs>

      <path d={stemPath(a.stem)} fill={STEM_COLOR} />
      <path d={capPath(a.cap)} fill={c.cap} />

      <g clipPath={`url(#kc-${uid})`} fill={c.mark}>
        {a.pattern === 'dots' && (
          <>
            <circle cx="14" cy="17" r="3.4" />
            <circle cx="31" cy="14" r="2.7" />
            <circle cx="23" cy="22.5" r="2.4" />
            <circle cx="36.5" cy="22" r="2.1" />
            <circle cx="8.5" cy="23.5" r="1.9" />
            <circle cx="24" cy="10.5" r="2" />
          </>
        )}
        {a.pattern === 'speckle' && (
          <>
            {[
              [11, 20], [17, 13], [24, 19], [30, 12], [36, 20], [21, 25], [33, 26], [14, 26],
            ].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />
            ))}
          </>
        )}
        {a.pattern === 'wave' && (
          <g fill="none" stroke={c.mark} strokeWidth="2.6" strokeLinecap="round">
            {[13, 20, 27].map((y) => (
              <path key={y} d={`M2 ${y}q6-3.2 12 0t12 0 12 0 12 0`} />
            ))}
          </g>
        )}
        {a.pattern === 'stripes' && (
          <>
            {[7, 16, 25, 34, 43].map((x) => (
              <rect key={x} x={x - 2.2} y="2" width="4.4" height="30" />
            ))}
          </>
        )}
        {a.pattern === 'sprinkles' && (
          <g stroke={c.mark} strokeWidth="2.2" strokeLinecap="round">
            {[
              [10, 20, 26], [17, 13, -34], [24, 21, 18], [31, 14, 50],
              [37, 22, -20], [20, 26, 62], [33, 27, -48],
            ].map(([x, y, deg]) => (
              <line
                key={`${x}-${y}`}
                x1={x}
                y1={y}
                x2={x + 3.4}
                y2={y}
                transform={`rotate(${deg} ${x} ${y})`}
              />
            ))}
          </g>
        )}
        {a.pattern === 'stars' && (
          <>
            {[
              [14, 18, 4], [29, 13, 3.2], [23, 24, 2.8], [36, 23, 2.6],
            ].map(([cx, cy, r]) => (
              <path key={`${cx}-${cy}`} d={starPath(cx, cy, r)} />
            ))}
          </>
        )}
        {a.pattern === 'hearts' && (
          <>
            {[
              [14, 18, 3.4], [29, 14, 2.9], [23, 24.5, 2.5], [36.5, 23, 2.3],
            ].map(([cx, cy, r]) => (
              <path key={`${cx}-${cy}`} d={heartPath(cx, cy, r)} />
            ))}
          </>
        )}
        {a.pattern === 'cow' && (
          <>
            <path d="M9 14c4-3 9-1 10 2s-2 6-6 6-8-5-4-8z" />
            <path d="M27 10c5-2 9 1 8 5s-6 5-9 2-3-6 1-7z" />
            <path d="M33 22c4-1 7 1 6 4s-5 4-7 2-2-5 1-6z" />
            <path d="M15 25c3-1 5 1 4 3s-4 3-6 1-1-3 2-4z" />
          </>
        )}
        {a.pattern === 'leopard' && (
          <>
            {[
              [12, 17, 3.2, 2.4], [22, 12, 2.6, 2], [31, 18, 3, 2.3],
              [17, 25, 2.4, 1.9], [28, 25.5, 2.2, 1.7], [38, 24, 2, 1.6],
            ].map(([cx, cy, rx, ry]) => (
              <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} />
            ))}
          </>
        )}
      </g>
    </svg>
  );
}

/** A chunky five-point star, drawn from its centre. */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** A small heart, drawn from its centre. */
function heartPath(cx: number, cy: number, r: number): string {
  const n = (v: number) => v.toFixed(2);
  return [
    `M${n(cx)} ${n(cy + r * 0.9)}`,
    `C${n(cx - r * 1.6)} ${n(cy - r * 0.1)} ${n(cx - r * 0.85)} ${n(cy - r * 1.15)} ${n(cx)} ${n(cy - r * 0.3)}`,
    `C${n(cx + r * 0.85)} ${n(cy - r * 1.15)} ${n(cx + r * 1.6)} ${n(cy - r * 0.1)} ${n(cx)} ${n(cy + r * 0.9)}`,
    'Z',
  ].join('');
}
