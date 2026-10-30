'use client';

import { useId, type ReactNode } from 'react';
import { botLook, type BotPattern } from './look';

type Status = 'working' | 'needs' | 'paused' | 'idle' | 'off';

/** The cap's outline: a wide dome with a soft rounded rim. */
const CAP = 'M5 33 C5 15 18 5 32 5 C46 5 59 15 59 33 Q59 38 54 38 L10 38 Q5 38 5 33 Z';

function heart(x: number, y: number, s: number) {
  return `M${x} ${y + s * 0.9} C${x - s * 1.6} ${y - s * 0.1} ${x - s * 0.9} ${y - s * 1.3} ${x} ${y - s * 0.45} C${x + s * 0.9} ${y - s * 1.3} ${x + s * 1.6} ${y - s * 0.1} ${x} ${y + s * 0.9} Z`;
}

function star(x: number, y: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)} ${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function Pattern({ kind, color }: { kind: BotPattern; color: string }): ReactNode {
  switch (kind) {
    case 'spots':
      return (
        <g fill={color}>
          <circle cx="20" cy="18" r="5" />
          <circle cx="37" cy="12" r="4" />
          <circle cx="47" cy="25" r="5.5" />
          <circle cx="29" cy="29" r="3.6" />
          <circle cx="12" cy="30" r="3" />
        </g>
      );
    case 'stripes':
      return (
        <g stroke={color} strokeWidth="5" fill="none" strokeLinecap="round">
          <path d="M14 40 Q16 18 26 4" />
          <path d="M32 40 L32 2" />
          <path d="M50 40 Q48 18 38 4" />
        </g>
      );
    case 'rings':
      return (
        <g stroke={color} strokeWidth="3.6" fill="none">
          <ellipse cx="32" cy="40" rx="13" ry="12" />
          <ellipse cx="32" cy="40" rx="23" ry="22" />
        </g>
      );
    case 'freckles':
      return (
        <g fill={color}>
          {[[16, 22], [22, 14], [30, 10], [38, 15], [45, 12], [48, 22], [40, 25], [31, 21], [23, 28], [14, 31], [52, 30], [36, 31]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 ? 1.9 : 2.4} />
          ))}
        </g>
      );
    case 'band':
      return <path fill={color} d="M0 20 Q8 17 16 20 T32 20 T48 20 T64 20 L64 28 Q56 31 48 28 T32 28 T16 28 T0 28 Z" />;
    case 'hearts':
      return (
        <g fill={color}>
          <path d={heart(19, 21, 4.6)} />
          <path d={heart(36, 13, 3.8)} />
          <path d={heart(46, 27, 4.4)} />
        </g>
      );
    case 'stars':
      return (
        <g fill={color}>
          <path d={star(19, 21, 6)} />
          <path d={star(37, 12, 4.6)} />
          <path d={star(46, 27, 5.4)} />
        </g>
      );
    case 'swirl':
      return <path fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" d="M32 21 a2.5 2.5 0 1 1 -2.5 -3 a6 6 0 1 1 -4 8.5 a10.5 10.5 0 1 1 18 -9" />;
  }
}

/**
 * A bot, as an icon: a patterned mushroom cap on a little clay stump with fins.
 * The same look (look.ts) as its figure in the city.
 */
export function ShroomBot({ seed, size = 32, status, className }: { seed: number; size?: number; status?: Status; className?: string }) {
  const id = useId().replace(/:/g, '');
  const look = botLook(seed);
  const off = status === 'off';
  const needs = status === 'needs';
  const eyeRy = status === 'working' ? 2.6 : 3.3;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={off ? { filter: 'grayscale(0.85)', opacity: 0.6 } : undefined}
      aria-hidden
    >
      <defs>
        <clipPath id={`cap-${id}`}>
          <path d={CAP} />
        </clipPath>
        <linearGradient id={`shade-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      <ellipse cx="32" cy="60.5" rx="15" ry="2.6" fill="#000" opacity="0.14" />

      {/* Fins, then the stump over them. */}
      <ellipse cx="15.5" cy={needs ? 42 : 48} rx="6.4" ry="3.8" fill={look.fin} transform={`rotate(${needs ? 35 : -22} 15.5 ${needs ? 42 : 48})`} />
      <ellipse cx="48.5" cy="48" rx="6.4" ry="3.8" fill={look.fin} transform="rotate(22 48.5 48)" />
      <rect x="19" y="32" width="26" height="27" rx="10" fill={look.stump} />
      <rect x="19" y="32" width="26" height="27" rx="10" fill={`url(#shade-${id})`} />

      {/* Face. */}
      {status === 'paused' ? (
        <g stroke="#3a2418" strokeWidth="1.8" fill="none" strokeLinecap="round">
          <path d="M24.5 45.5 Q27 47.5 29.5 45.5" />
          <path d="M34.5 45.5 Q37 47.5 39.5 45.5" />
        </g>
      ) : (
        <g>
          <ellipse cx="27" cy="45" rx="2.5" ry={eyeRy} fill="#3a2418" />
          <ellipse cx="37" cy="45" rx="2.5" ry={eyeRy} fill="#3a2418" />
          <circle cx="27.9" cy={45 - eyeRy * 0.4} r="0.95" fill="#fff" />
          <circle cx="37.9" cy={45 - eyeRy * 0.4} r="0.95" fill="#fff" />
        </g>
      )}
      {needs && (
        <g stroke="#3a2418" strokeWidth="1.3" fill="none" strokeLinecap="round">
          <path d="M24.5 40.2 Q27 38.8 29.5 40.2" />
          <path d="M34.5 40.2 Q37 38.8 39.5 40.2" />
        </g>
      )}
      <ellipse cx="23" cy="50" rx="2.4" ry="1.6" fill={look.cheek} opacity="0.65" />
      <ellipse cx="41" cy="50" rx="2.4" ry="1.6" fill={look.cheek} opacity="0.65" />
      {needs ? <ellipse cx="32" cy="52" rx="1.6" ry="1.9" fill="#3a2418" /> : <path d="M29.3 50.8 Q32 53.8 34.7 50.8" stroke="#3a2418" strokeWidth="1.5" fill="none" strokeLinecap="round" />}

      {/* The cap. */}
      <path d="M9 36 Q32 42 55 36 L55 38 Q32 44 9 38 Z" fill={look.capDark} />
      <path d={CAP} fill={look.cap} />
      <g clipPath={`url(#cap-${id})`}>
        <Pattern kind={look.pattern} color={look.patternColor} />
        <path d="M0 34 Q32 40 64 34 L64 40 L0 40 Z" fill={look.capDark} opacity="0.55" />
      </g>
      <ellipse cx="20" cy="13" rx="6.5" ry="3" fill="#fff" opacity="0.35" transform="rotate(-28 20 13)" />
    </svg>
  );
}
