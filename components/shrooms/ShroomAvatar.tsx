'use client';

import { useId } from 'react';
import { capPath, hasStem, PALETTE, resolveAvatar, type ShroomAvatarSpec } from '@/lib/shrooms/avatar';

interface ShroomAvatarProps {
  /** The shroom's id — used to derive a face when none was chosen. */
  id: string;
  /** The stored "shape:pattern:colour", if the shroom has one. */
  avatar?: string | null;
  /** Draw this exact face instead of resolving from id/avatar. Used by the picker. */
  spec?: ShroomAvatarSpec;
  size?: number;
  className?: string;
}

/**
 * A shroom's face.
 *
 * Gradient and clip ids are per-instance: several of these render in one row, and
 * SVG defs are document-global, so a shared id means the first one on the page wins
 * and every other shroom quietly borrows its colour.
 */
export function ShroomAvatar({ id, avatar, spec, size = 16, className = '' }: ShroomAvatarProps) {
  const uid = useId().replace(/:/g, '');
  const a = spec ?? resolveAvatar(id, avatar);
  const c = PALETTE.find((p) => p.key === a.color) ?? PALETTE[0];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <clipPath id={`kc-${uid}`}>
          <path d={capPath(a.shape)} />
        </clipPath>
        <linearGradient id={`kg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.cap} />
          <stop offset="100%" stopColor={c.deep} />
        </linearGradient>
      </defs>

      {hasStem(a.shape) && (
        <path
          d="M13 19h6c0 4.5.6 6.5 1.2 8.2.2.6-.2 1.1-.9 1.1h-6.6c-.7 0-1.1-.5-.9-1.1.6-1.7 1.2-3.7 1.2-8.2z"
          fill={c.stem}
        />
      )}

      <path d={capPath(a.shape)} fill={`url(#kg-${uid})`} />

      <g clipPath={`url(#kc-${uid})`}>
        {a.pattern === 'spots' && (
          <>
            <circle cx="11" cy="12" r="2.1" fill="#fff" opacity="0.85" />
            <circle cx="20" cy="10.5" r="1.6" fill="#fff" opacity="0.85" />
            <circle cx="16.5" cy="15.5" r="1.3" fill="#fff" opacity="0.7" />
            <circle cx="24" cy="15" r="1.1" fill="#fff" opacity="0.6" />
          </>
        )}
        {a.pattern === 'gills' && (
          <g stroke="#000" strokeOpacity="0.22" strokeWidth="1">
            {[6, 9, 12, 15, 18, 21, 24, 27].map((x) => (
              <line key={x} x1={x} y1="4" x2={x} y2="21" />
            ))}
          </g>
        )}
        {a.pattern === 'rings' && (
          <g fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.6">
            <ellipse cx="16" cy="19" rx="5" ry="4" />
            <ellipse cx="16" cy="19" rx="9.5" ry="7.5" />
          </g>
        )}
      </g>
    </svg>
  );
}
