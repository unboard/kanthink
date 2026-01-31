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

interface ConversationalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel;
  instruction: Instruction;
}

export function ConversationalDrawer({
  isOpen,
  onClose,
  channel,
  instruction: initial,
}: ConversationalDrawerProps) {
  const [title, setTitle] = useState(initial.title);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [action, setAction] = useState(initial.action);
  const [cardCount, setCardCount] = useState(initial.cardCount);
  const [targetColumns, setTargetColumns] = useState(initial.targetColumnIds);
  const [contextColumns, setContextColumns] = useState(initial.contextColumnIds);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const actionLabels = {
    generate: { label: 'Generate', icon: '✨', desc: 'Create new cards' },
    modify: { label: 'Modify', icon: '✏️', desc: 'Update existing cards' },
    move: { label: 'Move', icon: '↔️', desc: 'Reorganize cards' },
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-4 top-4 bottom-4 w-[420px] bg-neutral-900 rounded-2xl z-50 shadow-2xl flex flex-col overflow-hidden border border-neutral-800">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/50">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none text-white placeholder-neutral-500 flex-1"
            placeholder="Action name..."
          />
          <div className="flex items-center gap-2 ml-3">
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
          <div className="p-5 space-y-5">
            {/* Action Type - Compact segmented control */}
            <div className="flex gap-1 p-1 bg-neutral-800/50 rounded-lg">
              {(['generate', 'modify', 'move'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    action === a
                      ? 'bg-neutral-700 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <span className="mr-1.5">{actionLabels[a].icon}</span>
                  {actionLabels[a].label}
                </button>
              ))}
            </div>

            {/* Instructions - The Hero */}
            <div className="relative">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Tell Kan what to do..."
                rows={8}
                className="w-full bg-neutral-800/30 border border-neutral-700/50 rounded-xl px-4 py-3 text-[15px] text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
              />
              <div className="absolute bottom-3 right-3 text-xs text-neutral-500">
                {instructions.length} chars
              </div>
            </div>

            {/* Inline Flow: Where → What */}
            <div className="space-y-4">
              {/* Output destination */}
              <div>
                <div className="text-xs font-medium text-neutral-400 mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-violet-600/20 text-violet-400 flex items-center justify-center text-[10px]">→</span>
                  {action === 'generate' ? 'Add cards to' : action === 'modify' ? 'Modify cards in' : 'Move cards from'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {channel.columns.map((col) => (
                    <button
                      key={col.id}
                      onClick={() => toggleTarget(col.id)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        targetColumns.includes(col.id)
                          ? 'bg-violet-600 text-white'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700'
                      }`}
                    >
                      {col.name}
                      {col.cardIds.length > 0 && (
                        <span className="ml-1.5 text-xs opacity-60">{col.cardIds.length}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card count for generate */}
              {action === 'generate' && (
                <div className="flex items-center gap-3 pl-7">
                  <span className="text-sm text-neutral-400">Generate</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCardCount(Math.max(1, cardCount - 1))}
                      className="w-7 h-7 rounded-md bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-white font-medium">{cardCount}</span>
                    <button
                      onClick={() => setCardCount(Math.min(20, cardCount + 1))}
                      className="w-7 h-7 rounded-md bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-sm text-neutral-400">cards</span>
                </div>
              )}
            </div>

            {/* Advanced Section - Collapsible */}
            <div className="border-t border-neutral-800 pt-4">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors w-full"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Context & Automation
                {contextColumns.length > 0 && !showAdvanced && (
                  <span className="ml-auto text-xs bg-neutral-800 px-2 py-0.5 rounded">
                    {contextColumns.length} columns
                  </span>
                )}
              </button>

              {showAdvanced && (
                <div className="mt-4 space-y-4 pl-6">
                  {/* Context columns */}
                  <div>
                    <div className="text-xs font-medium text-neutral-400 mb-2 flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-amber-600/20 text-amber-400 flex items-center justify-center text-[10px]">👁</span>
                      Kan sees cards from
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setContextColumns(channel.columns.map(c => c.id))}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                          contextColumns.length === channel.columns.length
                            ? 'bg-amber-600/20 text-amber-300 border border-amber-600/30'
                            : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        All columns
                      </button>
                      {channel.columns.map((col) => (
                        <button
                          key={col.id}
                          onClick={() => toggleContext(col.id)}
                          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                            contextColumns.includes(col.id)
                              ? 'bg-amber-600/20 text-amber-300'
                              : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {col.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-500 mt-2">
                      Kan uses these cards as reference when running this action
                    </p>
                  </div>

                  {/* Automation toggle placeholder */}
                  <div className="flex items-center justify-between py-3 px-4 bg-neutral-800/30 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-neutral-300">Automatic</div>
                      <div className="text-xs text-neutral-500">Run on schedule or triggers</div>
                    </div>
                    <button className="w-10 h-6 rounded-full bg-neutral-700 relative transition-colors">
                      <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-neutral-400 transition-transform" />
                    </button>
                  </div>
                </div>
              )}
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
