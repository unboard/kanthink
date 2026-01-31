'use client';

import { useState } from 'react';
import { ConversationalDrawer } from './ConversationalDrawer';
import { PipelineDrawer } from './PipelineDrawer';
import { ExpandedCardDrawer } from './ExpandedCardDrawer';

// Mock data for prototypes
const mockChannel = {
  id: 'ch1',
  name: 'Content Ideas',
  description: 'Generate and curate content ideas for the blog',
  columns: [
    { id: 'col1', name: 'Ideas', cardIds: ['c1', 'c2', 'c3'] },
    { id: 'col2', name: 'Researching', cardIds: ['c4'] },
    { id: 'col3', name: 'Writing', cardIds: [] },
    { id: 'col4', name: 'Published', cardIds: ['c5', 'c6'] },
  ],
};

const mockInstruction = {
  id: 'inst1',
  title: 'Generate Channel Ideas',
  instructions: `Generate creative and practical channel ideas that would benefit from AI-assisted card management.

For each idea, provide:
- A catchy channel name as the title
- A description explaining the use case and how AI would help manage the cards`,
  action: 'generate' as const,
  cardCount: 5,
  targetColumnIds: ['col1'],
  contextColumnIds: ['col1', 'col4'],
  contextAllColumns: false,
};

export default function ActionDrawerPrototypes() {
  const [activeDrawer, setActiveDrawer] = useState<'conversational' | 'pipeline' | 'expanded' | null>(null);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Action Drawer Prototypes</h1>
        <p className="text-neutral-400 mb-8">
          Three alternative concepts for the action/shroom details drawer.
          Less settings-heavy, no dropdowns.
        </p>

        <div className="grid grid-cols-3 gap-6">
          {/* Concept 1: Conversational */}
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
            <h2 className="text-lg font-semibold mb-2">Concept 1: Conversational</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Instructions as the hero. Segmented action picker.
              Inline chips for columns. Advanced collapsed.
            </p>
            <button
              onClick={() => setActiveDrawer('conversational')}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors"
            >
              Open Drawer
            </button>
          </div>

          {/* Concept 2: Pipeline */}
          <div className="bg-neutral-900 rounded-xl p-6 border border-violet-800/50">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-lg font-semibold">Concept 2: Visual Pipeline</h2>
              <span className="px-2 py-0.5 bg-violet-600/20 text-violet-400 text-xs rounded">UPDATED</span>
            </div>
            <p className="text-sm text-neutral-400 mb-4">
              Action → Output → Learn From (optional).
              Color-coded stages. Preview summary.
            </p>
            <button
              onClick={() => setActiveDrawer('pipeline')}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors"
            >
              Open Drawer
            </button>
          </div>

          {/* Concept 3: Expanded Card */}
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
            <h2 className="text-lg font-semibold mb-2">Concept 3: Expanded Card</h2>
            <p className="text-sm text-neutral-400 mb-4">
              Same layout as shroom card. Inline editing.
              Click-to-edit fields. Minimal mode shift.
            </p>
            <button
              onClick={() => setActiveDrawer('expanded')}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-700 rounded-lg text-sm font-medium transition-colors"
            >
              Open Drawer
            </button>
          </div>
        </div>

        {/* Current Implementation Reference */}
        <div className="mt-8 p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-400 mb-2">Current Implementation Issues:</h3>
          <ul className="text-sm text-neutral-500 space-y-1">
            <li>• Too many separate labeled sections (feels like a settings page)</li>
            <li>• Dropdown menus feel indirect and hidden</li>
            <li>• Action type radios take up significant space</li>
            <li>• AI context section is confusing</li>
          </ul>
        </div>
      </div>

      {/* Drawers */}
      <ConversationalDrawer
        isOpen={activeDrawer === 'conversational'}
        onClose={() => setActiveDrawer(null)}
        channel={mockChannel}
        instruction={mockInstruction}
      />
      <PipelineDrawer
        isOpen={activeDrawer === 'pipeline'}
        onClose={() => setActiveDrawer(null)}
        channel={mockChannel}
        instruction={mockInstruction}
      />
      <ExpandedCardDrawer
        isOpen={activeDrawer === 'expanded'}
        onClose={() => setActiveDrawer(null)}
        channel={mockChannel}
        instruction={mockInstruction}
      />
    </div>
  );
}
