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

interface ExpandedCardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  instruction: Instruction;
}

export function ExpandedCardDrawer({
  isOpen,
  onClose,
  channel,
  instruction: initial,
}: ExpandedCardDrawerProps) {
  const [title, setTitle] = useState(initial.title);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [action, setAction] = useState(initial.action);
  const [cardCount, setCardCount] = useState(initial.cardCount);
  const [targetColumns, setTargetColumns] = useState(initial.targetColumnIds);
  const [contextColumns, setContextColumns] = useState(
    initial.contextAllColumns ? channel.columns.map(c => c.id) : initial.contextColumnIds
  );
  const [editingField, setEditingField] = useState<string | null>(null);

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

  const actionConfig = {
    generate: { color: 'emerald', label: 'Generate', icon: '●' },
    modify: { color: 'amber', label: 'Modify', icon: '●' },
    move: { color: 'blue', label: 'Move', icon: '●' },
  };

  const currentAction = actionConfig[action];
  const targetColumnNames = channel.columns
    .filter(c => targetColumns.includes(c.id))
    .map(c => c.name);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Drawer - styled like an expanded version of the shroom card */}
      <div className="fixed right-4 top-4 bottom-4 w-[440px] bg-neutral-900 rounded-2xl z-50 shadow-2xl flex flex-col overflow-hidden border border-neutral-800">
        {/* Close button - floating */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-neutral-800 rounded-lg transition-colors text-neutral-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Card-like header section - mirrors the shroom card layout */}
          <div className="p-6 pb-4">
            {/* Action type badge + selector */}
            <div className="flex items-center gap-2 mb-3">
              {(['generate', 'modify', 'move'] as const).map((a) => {
                const config = actionConfig[a];
                const isActive = action === a;
                return (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? config.color === 'emerald'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : config.color === 'amber'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    <span className={isActive ? '' : 'opacity-0'}>{config.icon}</span>
                    {config.label}
                  </button>
                );
              })}
            </div>

            {/* Title - inline editable */}
            <div className="group mb-3">
              {editingField === 'title' ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                  autoFocus
                  className="w-full text-xl font-bold bg-transparent border-none outline-none text-white -ml-1 pl-1 rounded focus:bg-neutral-800/50"
                />
              ) : (
                <h2
                  onClick={() => setEditingField('title')}
                  className="text-xl font-bold text-white cursor-text hover:bg-neutral-800/30 -ml-1 pl-1 rounded transition-colors"
                >
                  {title || 'Untitled action'}
                </h2>
              )}
            </div>

            {/* Instructions - inline editable, looks like text until clicked */}
            <div className="mb-4">
              {editingField === 'instructions' ? (
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  autoFocus
                  rows={6}
                  className="w-full text-[15px] leading-relaxed bg-neutral-800/50 border border-neutral-700/50 rounded-lg px-3 py-2 text-neutral-300 resize-none outline-none focus:border-violet-500/50"
                  placeholder="Describe what Kan should do..."
                />
              ) : (
                <p
                  onClick={() => setEditingField('instructions')}
                  className="text-[15px] leading-relaxed text-neutral-400 cursor-text hover:bg-neutral-800/30 -ml-1 pl-1 pr-2 py-1 rounded transition-colors min-h-[80px]"
                >
                  {instructions || <span className="text-neutral-500 italic">Click to add instructions...</span>}
                </p>
              )}
            </div>

            {/* Output row - mirrors the card's "→ Column • 5 cards" line */}
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span className="text-neutral-500">→</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {channel.columns.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => toggleTarget(col.id)}
                    className={`px-2 py-0.5 rounded text-sm transition-all ${
                      targetColumns.includes(col.id)
                        ? 'bg-neutral-700 text-white'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {col.name}
                  </button>
                ))}
              </div>
              {action === 'generate' && (
                <>
                  <span className="text-neutral-600">•</span>
                  <button
                    onClick={() => setEditingField(editingField === 'count' ? null : 'count')}
                    className="flex items-center gap-1 hover:text-neutral-200 transition-colors"
                  >
                    {cardCount} cards
                  </button>
                </>
              )}
            </div>

            {/* Card count inline editor */}
            {editingField === 'count' && action === 'generate' && (
              <div className="mt-3 flex items-center gap-2 pl-5">
                <button
                  onClick={() => setCardCount(Math.max(1, cardCount - 1))}
                  className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                >
                  −
                </button>
                <span className="w-8 text-center text-white font-medium">{cardCount}</span>
                <button
                  onClick={() => setCardCount(Math.min(20, cardCount + 1))}
                  className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                >
                  +
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  className="ml-2 text-xs text-neutral-500 hover:text-neutral-300"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {/* Run button - prominent like in the card */}
          <div className="px-6 pb-6">
            <button className="w-full py-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/30 rounded-xl text-emerald-400 font-medium flex items-center justify-center gap-2 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Run Now
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-neutral-800" />

          {/* Additional settings - expandable sections */}
          <div className="p-6 space-y-4">
            {/* Context section */}
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <span className="text-sm">👁</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-300">Context</div>
                    <div className="text-xs text-neutral-500">
                      {contextColumns.length === channel.columns.length
                        ? 'All columns'
                        : contextColumns.length === 0
                          ? 'No context'
                          : `${contextColumns.length} columns`}
                    </div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-neutral-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-3 pl-11">
                <p className="text-xs text-neutral-500 mb-3">
                  Which cards should Kan reference when running this action?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setContextColumns(
                      contextColumns.length === channel.columns.length
                        ? []
                        : channel.columns.map(c => c.id)
                    )}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      contextColumns.length === channel.columns.length
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    All
                  </button>
                  {channel.columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => toggleContext(col.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                        contextColumns.includes(col.id)
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {col.name}
                      <span className="ml-1 text-xs opacity-50">{col.cardIds.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>

            {/* Automation section */}
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-300">Automation</div>
                    <div className="text-xs text-neutral-500">Manual only</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-neutral-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-3 pl-11">
                <p className="text-xs text-neutral-500 mb-3">
                  Configure triggers to run this action automatically.
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg cursor-pointer hover:bg-neutral-800 transition-colors">
                    <input type="checkbox" className="w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0" />
                    <div>
                      <div className="text-sm text-neutral-300">On schedule</div>
                      <div className="text-xs text-neutral-500">Run daily, weekly, etc.</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded-lg cursor-pointer hover:bg-neutral-800 transition-colors">
                    <input type="checkbox" className="w-4 h-4 rounded border-neutral-600 bg-neutral-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-0" />
                    <div>
                      <div className="text-sm text-neutral-300">When cards move</div>
                      <div className="text-xs text-neutral-500">Trigger when cards enter a column</div>
                    </div>
                  </label>
                </div>
              </div>
            </details>

            {/* History section */}
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-700/50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-300">History</div>
                    <div className="text-xs text-neutral-500">Last run 2 hours ago</div>
                  </div>
                </div>
                <svg className="w-5 h-5 text-neutral-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-3 pl-11 space-y-2">
                <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-neutral-800/50">
                  <div>
                    <div className="text-neutral-300">Created 5 cards</div>
                    <div className="text-xs text-neutral-500">2 hours ago</div>
                  </div>
                  <button className="text-xs text-violet-400 hover:text-violet-300">Undo</button>
                </div>
                <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-neutral-800/50 opacity-50">
                  <div>
                    <div className="text-neutral-300">Created 5 cards</div>
                    <div className="text-xs text-neutral-500">Yesterday</div>
                  </div>
                  <span className="text-xs text-neutral-500">Undone</span>
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-800 flex items-center justify-between bg-neutral-900/80 backdrop-blur">
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
