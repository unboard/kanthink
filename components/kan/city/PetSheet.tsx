'use client';

import { useEffect, useState } from 'react';
import { Heart, X } from 'lucide-react';
import type { InsidePet } from './inside';

const KIND_WORD: Record<InsidePet['kind'], string> = { cat: 'Cat', kitten: 'Kitten', dog: 'Dog', puppy: 'Puppy', bunny: 'Bunny' };
const FACE: Record<InsidePet['kind'], string> = { cat: '🐱', kitten: '🐱', dog: '🐶', puppy: '🐶', bunny: '🐰' };

/**
 * One of the animals, when you tap it: who they are, what they're up to right now,
 * and the two things kids want to do: pet them and throw the ball.
 */
export function PetSheet({ pet, mood, onPat, onThrow, onClose, children }: {
  pet: InsidePet;
  /** What it's doing now; asked again every moment while the sheet's open. */
  mood: () => string;
  onPat: () => void;
  onThrow?: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [now, setNow] = useState(mood);
  useEffect(() => {
    const t = setInterval(() => setNow(mood()), 600);
    return () => clearInterval(t);
  }, [mood]);
  const rows: [string, string][] = [['Age', pet.age], ['Personality', pet.personality], ['Loves', pet.loves], ['Best trick', pet.trick], ['A secret', pet.secret]];
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-950/95 p-5 text-white shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-[360px] sm:rounded-3xl sm:border">
      <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-neutral-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: pet.color }}>{FACE[pet.kind]}</span>
        <div>
          <h3 className="text-[20px] font-semibold leading-tight">{pet.name}</h3>
          <p className="text-[13px] text-neutral-400">{KIND_WORD[pet.kind]} · {now}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[14px]"><dt className="w-24 flex-shrink-0 text-neutral-500">{k}</dt><dd className="text-neutral-100">{v}</dd></div>
        ))}
      </dl>
      {children}
      <div className="mt-5 flex gap-2">
        <button onClick={onPat} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-pink-500 px-4 py-2.5 text-[14px] font-semibold hover:bg-pink-400 active:scale-95"><Heart className="h-4 w-4" /> Pet {pet.name}</button>
        {onThrow && <button onClick={onThrow} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-lime-400 px-4 py-2.5 text-[14px] font-semibold text-neutral-900 hover:bg-lime-300 active:scale-95">🎾 Throw the ball</button>}
      </div>
    </div>
  );
}

/** The hearts and words that float up off the animals. */
export const PET_CSS = `
.kc-heart { pointer-events: none; color: #f472b6; font-size: 20px; text-shadow: 0 1px 4px rgba(0,0,0,.35); will-change: transform, opacity; }
.kc-heart-word { color: #fff; font-size: 14px; font-weight: 700; background: #ec4899; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
`;
