'use client';

import { useState } from 'react';
import { SporeRail, CapRow, ColumnWatchers, ShroomColumn, KanDock } from './optionsA';
import { HeaderCaps, CardCaps, LivingTicker, SporePalette, Mycelium } from './optionsB';
import { SHROOMS, type DemoShroom, type OptionProps } from './types';

type Cost = 'none' | 'width' | 'height' | 'reach';

const COST_LABEL: Record<Cost, string> = {
  none: 'Takes no space',
  width: 'Takes width',
  height: 'Takes height',
  reach: 'Off screen',
};

const COST_COLOR: Record<Cost, string> = {
  none: '#4ade80',
  width: '#fbbf24',
  height: '#fbbf24',
  reach: '#a1a1aa',
};

interface Option {
  key: string;
  n: number;
  name: string;
  pitch: string;
  cost: Cost;
  component: (p: OptionProps) => React.ReactElement;
}

const OPTIONS: Option[] = [
  {
    key: 'rail',
    n: 1,
    name: 'Spore Rail',
    cost: 'width',
    pitch:
      'A permanent 40px strip on the right edge, one cap per shroom with a state dot. Always visible, never between you and a column, and it expands over the board instead of pushing it. The version that scales past a dozen shrooms.',
    component: SporeRail,
  },
  {
    key: 'row',
    n: 2,
    name: 'Cap Row',
    cost: 'height',
    pitch:
      'The strip under the header — but collapsed to one line by default, so it reads as a status line you can ignore rather than a toolbar you have to. Opening it pushes the whole board down, which is the honest cost of the easiest slot to take.',
    component: CapRow,
  },
  {
    key: 'watchers',
    n: 3,
    name: 'Column Watchers',
    cost: 'none',
    pitch:
      'No global chrome at all. A cap appears above the column a shroom acts on, because that is the only place its behaviour is legible — you learn what Inbox Analyzer does by seeing it sitting on Inbox. Columns nothing watches show a ghost slot instead.',
    component: ColumnWatchers,
  },
  {
    key: 'column',
    n: 4,
    name: 'Shroom Column',
    cost: 'reach',
    pitch:
      'Shrooms become a column. They scroll with the board, use grammar the board already has, and a card can be dragged onto one to run it against that card. Costs nothing on screen because it lives past the last column — which is also why you might never scroll to it.',
    component: ShroomColumn,
  },
  {
    key: 'dock',
    n: 5,
    name: 'Kan Dock',
    cost: 'none',
    pitch:
      'No new furniture. The Ask Kan button already floats on every board; press it and it grows a stalk of shrooms above it. Kan and his shrooms are the same idea, so they get one control instead of competing for two.',
    component: KanDock,
  },
  {
    key: 'caps',
    n: 6,
    name: 'Header Caps',
    cost: 'none',
    pitch:
      'A facepile, but of shrooms — sitting where the members pile already sits. The board has taught this pattern once already, and a shroom is closer to a member of the channel than to a setting on it.',
    component: HeaderCaps,
  },
  {
    key: 'cardcaps',
    n: 7,
    name: 'Card Caps',
    cost: 'none',
    pitch:
      'Nothing on screen until a card is under the cursor, then the shrooms that can act on that card grow along its bottom edge. The most contextual answer and the least discoverable — you have to reach before it tells you anything.',
    component: CardCaps,
  },
  {
    key: 'ticker',
    n: 8,
    name: 'Living Ticker',
    cost: 'height',
    pitch:
      'Not a control surface — a presence. One line saying what the shrooms are actually doing right now, cycling slowly. It answers "are these alive?", which is the question a lost shroom is really failing to answer. Click the line to run what it is describing.',
    component: LivingTicker,
  },
  {
    key: 'palette',
    n: 9,
    name: 'Spore Palette',
    cost: 'none',
    pitch:
      'Zero chrome. Press S and the shrooms come to you. Fastest for anyone who knows and invisible to anyone who does not, so it is really a companion to one of the others rather than an answer on its own.',
    component: SporePalette,
  },
  {
    key: 'mycelium',
    n: 10,
    name: 'Mycelium',
    cost: 'none',
    pitch:
      'Shrooms live in the gutters — the one part of a board that was never carrying anything. Faint threads run down the gaps between columns; each cap sits on a thread. Hover a cap and its actual route lights up across the board: which column it reads, which one it moves cards into.',
    component: Mycelium,
  },
];

export default function ShroomsInChannelPage() {
  const [active, setActive] = useState('mycelium');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const option = OPTIONS.find((o) => o.key === active)!;
  const View = option.component;

  const handleRun = (s: DemoShroom) => {
    setRunningId(s.id);
    setLog(`Running “${s.title}”…`);
    setTimeout(() => {
      setRunningId((cur) => (cur === s.id ? null : cur));
      setLog(`“${s.title}” finished · 3 cards updated`);
    }, 2400);
  };

  return (
    <div className="min-h-screen bg-[#0b0b0d] text-neutral-200">
      <div className="mx-auto max-w-[1080px] px-6 py-12">
        <header className="mb-9">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-600">Prototype</p>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">Shrooms in a channel</h1>
          <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-neutral-400">
            Shrooms today live in a global left-nav panel, so a channel gives no sign they exist —
            you have to already know to go looking. Ten ways to bring them into the board without
            standing in front of it. Same board, same five shrooms in each; the difference is which
            slot the concept takes, and what that slot costs.
          </p>
        </header>

        {/* Picker */}
        <div className="mb-6 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              onClick={() => setActive(o.key)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                active === o.key
                  ? 'border-violet-500/45 bg-violet-500/[0.12] text-neutral-50'
                  : 'border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:border-white/[0.12] hover:text-neutral-200'
              }`}
            >
              <span
                className={`font-mono text-[10px] ${active === o.key ? 'text-violet-300' : 'text-neutral-600'}`}
              >
                {String(o.n).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{o.name}</span>
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ background: COST_COLOR[o.cost] }}
                title={COST_LABEL[o.cost]}
              />
            </button>
          ))}
        </div>

        <div className="mb-5 flex items-start gap-4 border-l-2 border-neutral-800 pl-4">
          <p className="max-w-[68ch] flex-1 text-[13px] leading-relaxed text-neutral-500">{option.pitch}</p>
          <span
            className="flex-shrink-0 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]"
            style={{ background: `${COST_COLOR[option.cost]}18`, color: COST_COLOR[option.cost] }}
          >
            {COST_LABEL[option.cost]}
          </span>
        </div>

        <View shrooms={SHROOMS} runningId={runningId} onRun={handleRun} onOpen={handleRun} />

        <div className="mt-4 h-5 font-mono text-[11px] text-neutral-600" aria-live="polite">
          {log}
        </div>

        <footer className="mt-16 border-t border-neutral-900 pt-6 text-[12.5px] leading-relaxed text-neutral-600">
          <p className="max-w-[68ch]">
            Two of these are not really rivals to the rest. <strong className="text-neutral-500">Spore
            Palette</strong> is a shortcut with no discoverability of its own, and <strong className="text-neutral-500">
            Card Caps</strong> only ever speaks about one card — both want to ride alongside a
            concept that is visible at rest. The genuine fork is whether a shroom is furniture
            (1, 2, 6), part of the board’s own structure (3, 4, 10), or something Kan carries (5, 8).
          </p>
        </footer>
      </div>
    </div>
  );
}
