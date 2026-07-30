'use client';

import { useState } from 'react';
import { StandingOrder } from './StandingOrder';
import { KanSpeaks } from './KanSpeaks';
import { FieldSpecimen } from './FieldSpecimen';
import { Signal } from './Signal';
import { SpecimenSlab } from './SpecimenSlab';
import { SpecimenCompact } from './SpecimenCompact';
import { SpecimenIndex } from './SpecimenIndex';
import { SpecimenPlate } from './SpecimenPlate';
import { SpecimenTag } from './SpecimenTag';
import { SporePrint } from './SporePrint';
import { SpecimenGills } from './SpecimenGills';
import { SpecimenFieldNotes } from './SpecimenFieldNotes';
import { SpecimenCulture } from './SpecimenCulture';
import type { ConceptProps, DemoShroom } from './types';

const SHROOMS: DemoShroom[] = [
  {
    id: 'inbox-analyzer',
    title: 'Inbox Analyzer',
    summary:
      'Reads every bookmark that lands in Inbox and writes a deep analysis onto the card — TL;DR, the insight worth keeping, and where it might apply.',
    firstPerson:
      'I read every bookmark that lands in Inbox and write a deep analysis onto the card — the TL;DR, the insight worth keeping, and where it might apply.',
    action: 'modify',
    state: 'watching',
    trigger: 'Inbox',
    lastRun: '2h ago',
    history: ['ran', 'ran', 'skipped', 'ran', 'ran', 'ran', 'failed', 'ran', 'ran', 'ran'],
    totalRuns: 184,
    learned: 'you keep rejecting marketing landing pages, so it skips them now',
    chainsTo: 'Monday Digest',
  },
  {
    id: 'weekly-digest',
    title: 'Monday Digest',
    summary:
      'Summarises everything that moved last week into a single report card, then emails it before you open the board.',
    firstPerson:
      'Every Monday I summarise what moved last week into one report card, then email it to you before you open the board.',
    action: 'report',
    state: 'scheduled',
    trigger: 'Mondays at 7:00',
    lastRun: '3d ago',
    history: ['ran', 'skipped', 'ran', 'ran', 'ran', 'skipped', 'ran', 'ran'],
    totalRuns: 31,
    learned: 'you cut the "no change" sections, so it leaves them out',
  },
  {
    id: 'long-name',
    // Deliberately overlong — the truncation case, and a name people really do write
    title: 'Deep analyse inbox bookmarks and extract cross-domain insights',
    summary:
      'Pulls the underlying idea out of each saved link and notes where else it could apply.',
    firstPerson:
      'I pull the underlying idea out of each saved link and note where else it could apply.',
    action: 'modify',
    state: 'scheduled',
    trigger: 'Every 4 hours',
    lastRun: '40m ago',
    history: ['ran', 'ran', 'ran', 'skipped', 'ran', 'ran'],
    totalRuns: 96,
    chainsTo: 'Triage new bugs',
  },
  {
    id: 'triage',
    title: 'Triage new bugs',
    summary:
      'Sorts anything in Raw Ideas by urgency and moves the genuinely broken things into Do these.',
    firstPerson:
      'I sort anything sitting in Raw Ideas by urgency and move the genuinely broken things into Do these.',
    action: 'move',
    state: 'manual',
    trigger: null,
    lastRun: null,
    history: ['ran', 'ran', 'failed', 'ran'],
    totalRuns: 4,
  },
];

type Variant = {
  key: string;
  name: string;
  pitch: string;
  component: (p: ConceptProps) => React.ReactElement;
  /** Rows rather than cards — never sit side by side. */
  stacked?: boolean;
};

const CONCEPTS: Variant[] = [
  {
    key: 'specimen',
    name: 'Field Specimen',
    pitch:
      'The original. Hairline frame with corner ticks, specimen number, classification line, and a key of facts.',
    component: FieldSpecimen,
  },
  {
    key: 'standing',
    name: 'Standing Order',
    pitch:
      'No icons at all. A title, a sentence, one status line — and a coloured left rail so you can read a whole column of states without reading a word.',
    component: StandingOrder,
  },
  {
    key: 'kan',
    name: 'Kan Speaks',
    pitch:
      'The description is in Kan’s own voice. A shroom is a standing agent, and first person is the most honest way to say what one does.',
    component: KanSpeaks,
  },
  {
    key: 'signal',
    name: 'Signal',
    pitch:
      'For the board with twelve shrooms. Dense rows, and a pulse of recent runs so a shroom quietly declining to run is the loudest thing on it.',
    component: Signal,
    stacked: true,
  },
];

const STUDIES: Variant[] = [
  {
    key: 'slab',
    name: 'Slab',
    pitch:
      'The frame removed entirely — rules do the framing. A specimen label was never a box, it was a printed strip. Lightest weight in the set.',
    component: SpecimenSlab,
  },
  {
    key: 'compact',
    name: 'Compact',
    pitch:
      'Same information, about half the height. The version that survives a column with a dozen shrooms in it.',
    component: SpecimenCompact,
  },
  {
    key: 'indexcard',
    name: 'Index Card',
    pitch:
      'The catalogue drawer rather than the specimen jar. Content sits on ruled baselines with a margin rule down the left.',
    component: SpecimenIndex,
  },
  {
    key: 'plate',
    name: 'Plate',
    pitch:
      'The largest. Classification runs vertically down the spine, freeing the full width for the title and description. Tall and unhurried.',
    component: SpecimenPlate,
  },
  {
    key: 'sporeprint',
    name: 'Spore Print',
    pitch:
      'A spore print is how you actually identify a mushroom. Every shroom gets one, drawn from its id — same shroom, same mark; no two alike. An identity you learn by sight.',
    component: SporePrint,
  },
  {
    key: 'gills',
    name: 'Gills',
    pitch:
      'Gills are the working part of a cap, not the decorative one. Here they’re the run history — one blade per run, amber where it quietly skipped.',
    component: SpecimenGills,
  },
  {
    key: 'fieldnotes',
    name: 'Field Notes',
    pitch:
      'A specimen sheet with the collector’s annotation still on it. The annotation is what the shroom learned from your rejections — the thing that makes it more than a button.',
    component: SpecimenFieldNotes,
  },
  {
    key: 'culture',
    name: 'Culture',
    pitch:
      'The visible mushroom is the small part. The background is mycelium spreading from the corner, its density set by lifetime runs — an established shroom looks established.',
    component: SpecimenCulture,
  },
  {
    key: 'tag',
    name: 'Tag',
    pitch:
      'The label as a physical object — eyelet strip, clipped corner where the string passes through. The classification lives in the strip.',
    component: SpecimenTag,
  },
];

const ALL = [...CONCEPTS, ...STUDIES];

type Width = 'column' | 'grid';

export default function ShroomCardsPrototypePage() {
  const [active, setActive] = useState('sporeprint');
  const [width, setWidth] = useState<Width>('column');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const variant = ALL.find((v) => v.key === active)!;
  const Card = variant.component;

  const handleRun = (s: DemoShroom) => {
    setRunningId(s.id);
    setLastAction(`Running “${s.title}”`);
    setTimeout(() => {
      setRunningId((cur) => (cur === s.id ? null : cur));
      setLastAction(`“${s.title}” finished`);
    }, 2600);
  };

  const tab = (v: Variant) => (
    <button
      key={v.key}
      onClick={() => setActive(v.key)}
      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
        active === v.key
          ? 'bg-violet-600 text-white'
          : 'bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-neutral-200'
      }`}
    >
      {v.name}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-neutral-200">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-9">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">
            Prototype
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Shroom cards</h1>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-neutral-400">
            Each carries a title, a generated summary of what the shroom does, and Run and Edit
            without opening the drawer. Five of these are studies on Field Specimen — same
            details, different weight and treatment.
          </p>
        </header>

        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">
              Specimen
            </span>
            {STUDIES.map(tab)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">
              Other
            </span>
            {CONCEPTS.map(tab)}
          </div>
        </div>

        {/* Size is the open question, so make it easy to see at the width that matters */}
        <div className="mb-7 flex flex-wrap items-center gap-2">
          <span className="w-24 flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-600">
            Width
          </span>
          {([
            ['column', 'Board column · 320px'],
            ['grid', 'Full width'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setWidth(key)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                width === key
                  ? 'bg-white/10 text-neutral-100'
                  : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mb-8 max-w-[62ch] border-l-2 border-neutral-800 pl-4 text-[13px] leading-relaxed text-neutral-500">
          {variant.pitch}
        </p>

        {/* The cards. Column mode mimics a real board column so height reads true. */}
        {width === 'column' ? (
          <div className="w-full max-w-[344px] rounded-xl bg-[#100f13] p-3">
            <p className="mb-2.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700">
              Shrooms
            </p>
            <div className="space-y-2.5">
              {SHROOMS.map((s, i) => (
                <Card
                  key={s.id}
                  shroom={s}
                  index={i}
                  isRunning={runningId === s.id}
                  onRun={() => handleRun(s)}
                  onEdit={() => setLastAction(`Edit “${s.title}”`)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={variant.stacked ? 'space-y-2' : 'grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3'}>
            {SHROOMS.map((s, i) => (
              <Card
                key={s.id}
                shroom={s}
                index={i}
                isRunning={runningId === s.id}
                onRun={() => handleRun(s)}
                onEdit={() => setLastAction(`Edit “${s.title}”`)}
              />
            ))}
          </div>
        )}

        <div className="mt-6 h-5 font-mono text-[11px] text-neutral-600" aria-live="polite">
          {lastAction}
        </div>

        <footer className="mt-16 border-t border-neutral-900 pt-6 text-[12.5px] leading-relaxed text-neutral-600">
          <p className="max-w-[62ch]">
            The summary line is the piece that doesn’t exist yet. Cards today print the raw
            instructions field, which is written for the model and reads like configuration.
            Shipping any of these means generating a short description when a shroom is saved.
          </p>
        </footer>
      </div>
    </div>
  );
}
