'use client';

import { useState } from 'react';

interface Column {
  id: string;
  name: string;
  cardIds: string[];
}

interface Channel {
  id: string;
  name: string;
  description: string;
  columns: Column[];
}

interface Instruction {
  id: string;
  title: string;
  instructions: string;
  action: 'generate' | 'modify' | 'move';
  cardCount: number;
  targetColumnIds: string[];
  contextColumnIds: string[];
  contextAllColumns: boolean;
}

interface PipelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  instruction: Instruction;
}

export function PipelineDrawer({
  isOpen,
  onClose,
  channel,
  instruction: initial,
}: PipelineDrawerProps) {
  const [title, setTitle] = useState(initial.title);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [action, setAction] = useState(initial.action);
  const [cardCount, setCardCount] = useState(initial.cardCount);
  const [targetColumns, setTargetColumns] = useState(initial.targetColumnIds);
  const [contextColumns, setContextColumns] = useState(
    initial.contextAllColumns ? channel.columns.map(c => c.id) : initial.contextColumnIds
  );
  const [contextEnabled, setContextEnabled] = useState(initial.contextColumnIds.length > 0 || initial.contextAllColumns);

  if (!isOpen) return null;

  const toggleTarget = (colId: string) => {
    setTargetColumns(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const toggleContext = (colId: string) => {
    setContextColumns(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  const totalContextCards = channel.columns
    .filter(c => contextColumns.includes(c.id))
    .reduce((sum, c) => sum + c.cardIds.length, 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-4 top-4 bottom-4 w-[460px] bg-neutral-900 rounded-2xl z-50 shadow-2xl flex flex-col overflow-hidden border border-neutral-800">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm">
              {action === 'generate' ? '✨' : action === 'modify' ? '✏️' : '↔️'}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold bg-transparent border-none outline-none text-white placeholder-neutral-500"
              placeholder="Action name..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Run
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Visual Pipeline */}
          <div className="p-5">
            {/* Pipeline Container */}
            <div className="relative">
              {/* Connecting Line */}
              <div className="absolute left-6 top-10 bottom-10 w-0.5 bg-gradient-to-b from-violet-500/50 via-emerald-500/50 to-amber-500/30" />

              {/* Step 1: Action (Process) */}
              <div className="relative pl-14 pb-6">
                <div className="absolute left-3 w-7 h-7 rounded-full bg-violet-500/20 border-2 border-violet-500/50 flex items-center justify-center">
                  <span className="text-xs">⚡</span>
                </div>
                <div className="text-xs font-medium text-violet-400 mb-2">ACTION</div>

                {/* Action type tabs */}
                <div className="flex gap-2 mb-4">
                  {(['generate', 'modify', 'move'] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAction(a)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        action === a
                          ? 'bg-violet-600 text-white'
                          : 'bg-neutral-800/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
                      }`}
                    >
                      {a === 'generate' && '✨ Generate'}
                      {a === 'modify' && '✏️ Modify'}
                      {a === 'move' && '↔️ Move'}
                    </button>
                  ))}
                </div>

                {/* Instructions */}
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Describe what Kan should do..."
                  rows={5}
                  className="w-full bg-neutral-800/30 border border-violet-500/20 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-violet-500/40"
                />

                {/* Card count for generate */}
                {action === 'generate' && (
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-sm text-neutral-400">Create</span>
                    <div className="flex items-center bg-neutral-800/50 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setCardCount(Math.max(1, cardCount - 1))}
                        className="w-8 h-8 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors flex items-center justify-center"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-white font-medium">{cardCount}</span>
                      <button
                        onClick={() => setCardCount(Math.min(20, cardCount + 1))}
                        className="w-8 h-8 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm text-neutral-400">new cards</span>
                  </div>
                )}
              </div>

              {/* Step 2: Output (Destination) */}
              <div className="relative pl-14 pb-6">
                <div className="absolute left-3 w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
                  <span className="text-xs">→</span>
                </div>
                <div className="text-xs font-medium text-emerald-400 mb-2">
                  {action === 'generate' ? 'ADD TO' : action === 'modify' ? 'MODIFY IN' : 'MOVE BETWEEN'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {channel.columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => toggleTarget(col.id)}
                      className={`group relative px-3 py-2 rounded-lg text-sm transition-all ${
                        targetColumns.includes(col.id)
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200'
                          : 'bg-neutral-800/50 border border-neutral-700/50 text-neutral-400 hover:border-neutral-600'
                      }`}
                    >
                      <div className="font-medium">{col.name}</div>
                      {targetColumns.includes(col.id) && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Context (Optional - Learn From) */}
              <div className="relative pl-14">
                <div className={`absolute left-3 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  contextEnabled
                    ? 'bg-amber-500/20 border-2 border-amber-500/50'
                    : 'bg-neutral-800 border-2 border-neutral-700'
                }`}>
                  <span className="text-xs">{contextEnabled ? '👁' : '○'}</span>
                </div>

                {/* Header with toggle */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${contextEnabled ? 'text-amber-400' : 'text-neutral-500'}`}>
                      LEARN FROM
                    </span>
                    <span className="text-[10px] text-neutral-600 bg-neutral-800 px-1.5 py-0.5 rounded">
                      OPTIONAL
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setContextEnabled(!contextEnabled);
                      if (!contextEnabled) {
                        setContextColumns(channel.columns.map(c => c.id));
                      }
                    }}
                    className={`relative w-9 h-5 rounded-full transition-colors ${
                      contextEnabled ? 'bg-amber-500/30' : 'bg-neutral-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                      contextEnabled
                        ? 'left-4 bg-amber-400'
                        : 'left-0.5 bg-neutral-500'
                    }`} />
                  </button>
                </div>

                {contextEnabled ? (
                  <>
                    <p className="text-xs text-neutral-500 mb-3">
                      Reference existing cards to avoid duplicates and stay relevant
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {channel.columns.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => toggleContext(col.id)}
                          className={`group relative px-3 py-2 rounded-lg text-sm transition-all ${
                            contextColumns.includes(col.id)
                              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                              : 'bg-neutral-800/50 border border-neutral-700/50 text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          <div className="font-medium">{col.name}</div>
                          <div className="text-xs opacity-60">{col.cardIds.length} cards</div>
                          {contextColumns.includes(col.id) && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {totalContextCards > 0 && (
                      <div className="mt-2 text-xs text-neutral-500">
                        {totalContextCards} cards available as context
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-neutral-600">
                    Kan won't reference existing cards
                  </p>
                )}
              </div>
            </div>

            {/* Summary Preview */}
            <div className="mt-8 p-4 bg-neutral-800/30 rounded-xl border border-neutral-700/30">
              <div className="text-xs font-medium text-neutral-400 mb-2">PREVIEW</div>
              <p className="text-sm text-neutral-300">
                {action === 'generate' && (
                  <>
                    Generate <span className="text-violet-400 font-medium">{cardCount} cards</span> and add to{' '}
                    <span className="text-emerald-400 font-medium">
                      {targetColumns.length === 0
                        ? '...'
                        : channel.columns.filter(c => targetColumns.includes(c.id)).map(c => c.name).join(', ')}
                    </span>
                    {contextEnabled && contextColumns.length > 0 && (
                      <>, learning from <span className="text-amber-400 font-medium">{totalContextCards} existing cards</span></>
                    )}
                  </>
                )}
                {action === 'modify' && (
                  <>
                    Modify cards in{' '}
                    <span className="text-emerald-400 font-medium">
                      {targetColumns.length === 0
                        ? '...'
                        : channel.columns.filter(c => targetColumns.includes(c.id)).map(c => c.name).join(', ')}
                    </span>
                  </>
                )}
                {action === 'move' && (
                  <>
                    Reorganize cards across{' '}
                    <span className="text-emerald-400 font-medium">
                      {targetColumns.length === 0
                        ? '...'
                        : channel.columns.filter(c => targetColumns.includes(c.id)).map(c => c.name).join(', ')}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Automation - Compact */}
            <div className="mt-4 flex items-center justify-between py-3 px-4 bg-neutral-800/20 rounded-lg border border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-300">Automation</div>
                  <div className="text-xs text-neutral-500">Manual only</div>
                </div>
              </div>
              <button className="text-sm text-violet-400 hover:text-violet-300 transition-colors">
                Configure
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800/50 flex items-center justify-between">
          <div className="flex gap-1">
            <button className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors">
              Duplicate
            </button>
            <button className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors">
              Delete
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
