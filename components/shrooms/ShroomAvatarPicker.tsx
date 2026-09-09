'use client';

import { useState } from 'react';
import { ShroomAvatar } from './ShroomAvatar';
import {
  CAP_SHAPES,
  STEM_SHAPES,
  PALETTE,
  PATTERNS,
  resolveAvatar,
  serializeAvatar,
  type ShroomAvatarSpec,
} from '@/lib/shrooms/avatar';

interface ShroomAvatarPickerProps {
  shroomId: string;
  value?: string | null;
  onChange: (avatar: string) => void;
}

/**
 * Choosing a shroom's face.
 *
 * Opens closed: every shroom already has a derived face different from its
 * neighbours, so this is a refinement rather than a step anyone has to take. Cap
 * first because the silhouette is what carries at small sizes — colour is the
 * tiebreak, not the identity.
 */
export function ShroomAvatarPicker({ shroomId, value, onChange }: ShroomAvatarPickerProps) {
  const current = resolveAvatar(shroomId, value);
  const [open, setOpen] = useState(false);

  const set = (patch: Partial<ShroomAvatarSpec>) =>
    onChange(serializeAvatar({ ...current, ...patch }));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[12px] text-neutral-600 transition-colors hover:border-violet-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-violet-500/40"
      >
        <ShroomAvatar id={shroomId} avatar={value} size={20} />
        <span>{open ? 'Done' : 'Change face'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <Section label="Cap">
            {CAP_SHAPES.map((cap) => (
              <Swatch
                key={cap}
                active={current.cap === cap}
                onClick={() => set({ cap })}
                title={cap}
              >
                <ShroomAvatar id={shroomId} spec={{ ...current, cap }} size={28} />
              </Swatch>
            ))}
          </Section>

          <Section label="Colour">
            {PALETTE.map((c) => (
              <Swatch
                key={c.key}
                active={current.color === c.key}
                onClick={() => set({ color: c.key })}
                title={c.name}
              >
                <ShroomAvatar id={shroomId} spec={{ ...current, color: c.key }} size={28} />
              </Swatch>
            ))}
          </Section>

          <Section label="Pattern">
            {PATTERNS.map((pattern) => (
              <Swatch
                key={pattern}
                active={current.pattern === pattern}
                onClick={() => set({ pattern })}
                title={pattern}
              >
                <ShroomAvatar id={shroomId} spec={{ ...current, pattern }} size={28} />
              </Swatch>
            ))}
          </Section>

          <Section label="Stem">
            {STEM_SHAPES.map((stem) => (
              <Swatch
                key={stem}
                active={current.stem === stem}
                onClick={() => set({ stem })}
                title={stem}
              >
                <ShroomAvatar id={shroomId} spec={{ ...current, stem }} size={28} />
              </Swatch>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Swatch({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-lg border p-1 transition-colors ${
        active
          ? 'border-violet-500/60 bg-violet-500/[0.12]'
          : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-white/[0.14]'
      }`}
    >
      {children}
    </button>
  );
}
