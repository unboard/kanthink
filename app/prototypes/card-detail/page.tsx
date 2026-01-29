'use client';

import { useState } from 'react';
import { CardDetailV1ChatFirst } from './CardDetailV1ChatFirst';
import { CardDetailV2BottomTabs } from './CardDetailV2BottomTabs';

type Variant = 'chat-first' | 'bottom-tabs';

const variantDescriptions: Record<Variant, { name: string; description: string }> = {
  'chat-first': {
    name: 'Chat-First Collapse',
    description: 'Maximizes chat space. Card info collapses to a compact header that expands on tap. Ideal for conversation-heavy workflows.',
  },
  'bottom-tabs': {
    name: 'Bottom Tabs',
    description: 'Persistent tabs at bottom for Thread/Tasks/Info. Quick switching while keeping context. Native app feel.',
  },
};

// Mock data for prototypes
const mockCard = {
  id: '1',
  title: 'Optimize SEO strategy for Q1 launch',
  channelId: 'ch1',
  columnId: 'col1',
  summary: 'Working on keyword research and content optimization for the product launch.',
  tags: ['urgent', 'marketing'],
  source: 'ai' as const,
  createdAt: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
  updatedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  messages: [
    {
      id: 'm1',
      type: 'question' as const,
      content: 'What are the top 3 things I should focus on for SEO?',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'm2',
      type: 'ai_response' as const,
      content: `Based on your goals, here are the top 3 SEO priorities:

1. **Keyword Research** - Focus on long-tail keywords with high intent
2. **Technical SEO** - Ensure fast page loads and mobile optimization
3. **Content Quality** - Create comprehensive, valuable content

Would you like me to create tasks for each of these?`,
      createdAt: new Date(Date.now() - 3500000).toISOString(),
      replyToMessageId: 'm1',
      proposedActions: [
        { id: 'a1', type: 'create_task' as const, data: { title: 'Research long-tail keywords', description: 'Use Ahrefs to find keywords with search volume 100-1000' }, status: 'pending' as const },
        { id: 'a2', type: 'create_task' as const, data: { title: 'Run Lighthouse audit', description: 'Check performance scores and fix critical issues' }, status: 'pending' as const },
        { id: 'a3', type: 'create_task' as const, data: { title: 'Draft pillar content outline' }, status: 'approved' as const },
      ],
    },
    {
      id: 'm3',
      type: 'note' as const,
      content: 'Competitor analysis: Checking what keywords top 3 competitors rank for.',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ],
};

const mockTasks = [
  { id: 't1', title: 'Research long-tail keywords', status: 'in_progress' as const },
  { id: 't2', title: 'Run Lighthouse audit', status: 'not_started' as const },
  { id: 't3', title: 'Draft pillar content outline', status: 'done' as const },
  { id: 't4', title: 'Create meta descriptions', status: 'not_started' as const },
];

const mockTags = [
  { id: 'tag1', name: 'urgent', color: 'red' },
  { id: 'tag2', name: 'marketing', color: 'blue' },
  { id: 'tag3', name: 'seo', color: 'green' },
];

const mockInstructionRuns = [
  {
    id: 'run1',
    instructionTitle: 'Generate SEO content ideas',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
    cardsCreated: 5,
  },
  {
    id: 'run2',
    instructionTitle: 'Analyze competitor keywords',
    timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    cardsCreated: 3,
  },
];

export default function CardDetailPrototypePage() {
  const [activeVariant, setActiveVariant] = useState<Variant | null>(null);

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
            Card Detail Drawer Prototypes
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Mobile-optimized layouts that prioritize conversation space while keeping card info accessible.
          </p>
        </div>

        {/* Grid of variants */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {(Object.keys(variantDescriptions) as Variant[]).map((variant) => (
            <button
              key={variant}
              onClick={() => setActiveVariant(variant)}
              className="group text-left p-6 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                    {variantDescriptions[variant].name}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    {variantDescriptions[variant].description}
                  </p>
                </div>
                <span className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-neutral-500">
                  {variant}
                </span>
              </div>

              {/* Preview thumbnail */}
              <div className="mt-4 aspect-[9/16] max-h-64 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 overflow-hidden mx-auto w-40">
                <VariantThumbnail variant={variant} />
              </div>
            </button>
          ))}
        </div>

        {/* Design notes */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">
            Design Goals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <h3 className="font-medium text-neutral-900 dark:text-white mb-2">Conversation First</h3>
              <p className="text-sm text-neutral-500">
                Chat should dominate the viewport. Card metadata is important but secondary.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <h3 className="font-medium text-neutral-900 dark:text-white mb-2">Quick Access</h3>
              <p className="text-sm text-neutral-500">
                Tasks, tags, and card info should be one tap away, not buried in menus.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <h3 className="font-medium text-neutral-900 dark:text-white mb-2">Mobile Native</h3>
              <p className="text-sm text-neutral-500">
                Touch-friendly targets, swipe gestures, thumb-reachable controls.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">
            Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Aspect</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Chat-First</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Bottom Tabs</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600 dark:text-neutral-400">
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Chat space</td>
                  <td className="py-3 px-4"><span className="text-green-600">Maximum</span></td>
                  <td className="py-3 px-4"><span className="text-yellow-600">Good (minus tab bar)</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Task access</td>
                  <td className="py-3 px-4">Expand header</td>
                  <td className="py-3 px-4"><span className="text-green-600">One tap</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Context switching</td>
                  <td className="py-3 px-4">Smooth (same view)</td>
                  <td className="py-3 px-4">Clear (distinct views)</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Best for</td>
                  <td className="py-3 px-4">Heavy chatters</td>
                  <td className="py-3 px-4">Task-oriented users</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Actual prototypes */}
      <CardDetailV1ChatFirst
        isOpen={activeVariant === 'chat-first'}
        onClose={() => setActiveVariant(null)}
        card={mockCard}
        tasks={mockTasks}
        tags={mockTags}
      />
      <CardDetailV2BottomTabs
        isOpen={activeVariant === 'bottom-tabs'}
        onClose={() => setActiveVariant(null)}
        card={mockCard}
        tasks={mockTasks}
        tags={mockTags}
        instructionRuns={mockInstructionRuns}
      />
    </div>
  );
}

// Thumbnails
function VariantThumbnail({ variant }: { variant: Variant }) {
  if (variant === 'chat-first') {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
        {/* Collapsed header */}
        <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-neutral-300 dark:bg-neutral-600" />
            <div className="h-2 flex-1 bg-neutral-200 dark:bg-neutral-700 rounded" />
            <div className="w-4 h-4 rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
        {/* Chat area */}
        <div className="flex-1 p-2 space-y-1.5">
          <div className="h-3 w-3/4 bg-blue-100 dark:bg-blue-900/30 rounded ml-auto" />
          <div className="h-6 w-full bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="h-3 w-2/3 bg-neutral-100 dark:bg-neutral-800 rounded" />
          <div className="h-4 w-1/2 bg-violet-100 dark:bg-violet-900/30 rounded" />
        </div>
        {/* Input */}
        <div className="p-2 border-t border-neutral-200 dark:border-neutral-700">
          <div className="h-5 bg-neutral-100 dark:bg-neutral-800 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Mini header */}
      <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
        <div className="h-2 w-3/4 bg-neutral-200 dark:bg-neutral-700 rounded" />
      </div>
      {/* Chat area */}
      <div className="flex-1 p-2 space-y-1.5">
        <div className="h-3 w-2/3 bg-blue-100 dark:bg-blue-900/30 rounded ml-auto" />
        <div className="h-5 w-full bg-neutral-100 dark:bg-neutral-800 rounded" />
        <div className="h-3 w-3/4 bg-neutral-100 dark:bg-neutral-800 rounded" />
      </div>
      {/* Input */}
      <div className="px-2 pb-1">
        <div className="h-5 bg-neutral-100 dark:bg-neutral-800 rounded-full" />
      </div>
      {/* Bottom tabs */}
      <div className="flex border-t border-neutral-200 dark:border-neutral-700">
        <div className="flex-1 py-1.5 flex justify-center">
          <div className="w-4 h-4 rounded bg-violet-200 dark:bg-violet-800" />
        </div>
        <div className="flex-1 py-1.5 flex justify-center">
          <div className="w-4 h-4 rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
        <div className="flex-1 py-1.5 flex justify-center">
          <div className="w-4 h-4 rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
      </div>
    </div>
  );
}
