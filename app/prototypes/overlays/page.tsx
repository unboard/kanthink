'use client';

import { useState } from 'react';
import { MinimalFocusOverlay } from './MinimalFocusOverlay';
import { TemplateGalleryOverlay } from './TemplateGalleryOverlay';
import { CommandPaletteOverlay } from './CommandPaletteOverlay';
import { GuidedQuestionnaireOverlay } from './GuidedQuestionnaireOverlay';
import { WelcomeScreen } from './WelcomeScreen';
import { StoryWelcomeOverlay } from './StoryWelcomeOverlay';
import { StoryWelcomeOverlayV2 } from './StoryWelcomeOverlayV2';
import { StoryWelcomeOverlayV3 } from './StoryWelcomeOverlayV3';
import { KanWelcomeOverlay } from './KanWelcomeOverlay';

type OverlayVariant = 'guided' | 'minimal' | 'template' | 'command' | 'welcome' | 'story' | 'story-v2' | 'story-v3' | 'kan-welcome';

const overlayDescriptions: Record<OverlayVariant, { name: string; description: string }> = {
  guided: {
    name: 'Guided Questionnaire',
    description: 'AI-driven multiple choice questions. Helps you think through your channel.',
  },
  minimal: {
    name: 'Minimal Focus',
    description: 'Clean, centered input with progressive disclosure. Focus on the action.',
  },
  template: {
    name: 'Template Gallery',
    description: 'Start from pre-built templates or examples. Visual and explorable.',
  },
  command: {
    name: 'Command Palette',
    description: 'Keyboard-first, fast creation. Power user friendly.',
  },
  welcome: {
    name: 'Welcome Screen',
    description: 'First-time visitor onboarding. Warm introduction to the app.',
  },
  story: {
    name: 'Story Welcome',
    description: 'Terminal-style narrative. AI introduces itself with typewriter effect.',
  },
  'story-v2': {
    name: 'Story Welcome V2',
    description: 'Reframed value prop: instructions that do work for you, effortless feedback.',
  },
  'story-v3': {
    name: 'Story Welcome V3',
    description: 'Partnership-focused: a space that thinks alongside you, learns how you think.',
  },
  'kan-welcome': {
    name: 'Kan Welcome',
    description: 'Character-driven: Kan introduces himself via chat bubbles. Warm, fast, conversational.',
  },
};

export default function OverlaysPrototypePage() {
  const [activeOverlay, setActiveOverlay] = useState<OverlayVariant | null>(null);
  const [createdChannel, setCreatedChannel] = useState<string | null>(null);

  const handleCreate = (name: string) => {
    setCreatedChannel(name);
    setActiveOverlay(null);
    setTimeout(() => setCreatedChannel(null), 3000);
  };

  const handleClose = () => {
    setActiveOverlay(null);
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
            Overlay Component Library
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Channel creation and onboarding overlay concepts. Click any card to preview.
          </p>
        </div>

        {/* Success toast */}
        {createdChannel && (
          <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg bg-green-600 text-white shadow-lg animate-in slide-in-from-top-2 fade-in">
            Channel "{createdChannel}" created (demo)
          </div>
        )}

        {/* Grid of overlay variants */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {(Object.keys(overlayDescriptions) as OverlayVariant[]).map((variant) => (
            <button
              key={variant}
              onClick={() => setActiveOverlay(variant)}
              className="group text-left p-6 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-md transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                    {overlayDescriptions[variant].name}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    {overlayDescriptions[variant].description}
                  </p>
                </div>
                <span className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-neutral-500">
                  {variant}
                </span>
              </div>

              {/* Preview thumbnail */}
              <div className="mt-4 aspect-video rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                <OverlayThumbnail variant={variant} />
              </div>
            </button>
          ))}
        </div>

        {/* Usage section */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">
            Design Principles
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <h3 className="font-medium text-neutral-900 dark:text-white mb-2">Speed First</h3>
              <p className="text-sm text-neutral-500">
                Every overlay should let users accomplish their goal in under 5 seconds for the common case.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <h3 className="font-medium text-neutral-900 dark:text-white mb-2">Progressive Disclosure</h3>
              <p className="text-sm text-neutral-500">
                Show only what's needed. Advanced options reveal on demand, not upfront.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <h3 className="font-medium text-neutral-900 dark:text-white mb-2">Keyboard Accessible</h3>
              <p className="text-sm text-neutral-500">
                Full keyboard navigation. Escape to close, Enter to confirm, Tab to navigate.
              </p>
            </div>
          </div>
        </section>

        {/* Comparison table */}
        <section>
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">
            Comparison
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Variant</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Best For</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Complexity</th>
                  <th className="text-left py-3 px-4 font-medium text-neutral-900 dark:text-white">Speed</th>
                </tr>
              </thead>
              <tbody className="text-neutral-600 dark:text-neutral-400">
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Guided Questionnaire</td>
                  <td className="py-3 px-4">Users unsure what they want</td>
                  <td className="py-3 px-4"><span className="text-yellow-600">Medium</span></td>
                  <td className="py-3 px-4"><span className="text-blue-600">Thoughtful</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Minimal Focus</td>
                  <td className="py-3 px-4">Quick, simple channel creation</td>
                  <td className="py-3 px-4"><span className="text-green-600">Low</span></td>
                  <td className="py-3 px-4"><span className="text-green-600">Fast</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Template Gallery</td>
                  <td className="py-3 px-4">Users who want inspiration</td>
                  <td className="py-3 px-4"><span className="text-yellow-600">Medium</span></td>
                  <td className="py-3 px-4"><span className="text-yellow-600">Medium</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Command Palette</td>
                  <td className="py-3 px-4">Power users, keyboard lovers</td>
                  <td className="py-3 px-4"><span className="text-green-600">Low</span></td>
                  <td className="py-3 px-4"><span className="text-green-600">Very Fast</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Welcome Screen</td>
                  <td className="py-3 px-4">First-time users</td>
                  <td className="py-3 px-4"><span className="text-yellow-600">Medium</span></td>
                  <td className="py-3 px-4"><span className="text-yellow-600">Guided</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Story Welcome</td>
                  <td className="py-3 px-4">Immersive onboarding, brand storytelling</td>
                  <td className="py-3 px-4"><span className="text-green-600">Low</span></td>
                  <td className="py-3 px-4"><span className="text-violet-600">Narrative</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Story Welcome V2</td>
                  <td className="py-3 px-4">Value-focused onboarding, instruction-first</td>
                  <td className="py-3 px-4"><span className="text-green-600">Low</span></td>
                  <td className="py-3 px-4"><span className="text-violet-600">Narrative</span></td>
                </tr>
                <tr className="border-b border-neutral-100 dark:border-neutral-800/50">
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Story Welcome V3</td>
                  <td className="py-3 px-4">Partnership-focused, emotional continuity</td>
                  <td className="py-3 px-4"><span className="text-green-600">Low</span></td>
                  <td className="py-3 px-4"><span className="text-violet-600">Narrative</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium text-neutral-900 dark:text-white">Kan Welcome</td>
                  <td className="py-3 px-4">Character-driven, mascot-forward onboarding</td>
                  <td className="py-3 px-4"><span className="text-green-600">Low</span></td>
                  <td className="py-3 px-4"><span className="text-green-600">Fast</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Actual overlays */}
      <GuidedQuestionnaireOverlay
        isOpen={activeOverlay === 'guided'}
        onClose={handleClose}
        onCreate={(result) => handleCreate(result.channelName)}
      />
      <MinimalFocusOverlay
        isOpen={activeOverlay === 'minimal'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <TemplateGalleryOverlay
        isOpen={activeOverlay === 'template'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <CommandPaletteOverlay
        isOpen={activeOverlay === 'command'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <WelcomeScreen
        isOpen={activeOverlay === 'welcome'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <StoryWelcomeOverlay
        isOpen={activeOverlay === 'story'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <StoryWelcomeOverlayV2
        isOpen={activeOverlay === 'story-v2'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <StoryWelcomeOverlayV3
        isOpen={activeOverlay === 'story-v3'}
        onClose={handleClose}
        onCreate={handleCreate}
      />
      <KanWelcomeOverlay
        isOpen={activeOverlay === 'kan-welcome'}
        onClose={handleClose}
        onCreate={() => handleCreate('New Channel')}
      />
    </div>
  );
}

// Mini preview thumbnails
function OverlayThumbnail({ variant }: { variant: OverlayVariant }) {
  switch (variant) {
    case 'guided':
      return (
        <div className="h-full p-4">
          <div className="h-1 w-1/3 bg-violet-300 dark:bg-violet-700 rounded-full mb-3" />
          <div className="h-2 w-3/4 bg-neutral-300 dark:bg-neutral-600 rounded mb-3" />
          <div className="space-y-1.5">
            <div className="h-5 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center px-2">
              <div className="w-2 h-2 rounded-full border border-neutral-400" />
            </div>
            <div className="h-5 bg-violet-100 dark:bg-violet-900/30 rounded flex items-center px-2">
              <div className="w-2 h-2 rounded-full bg-violet-400" />
            </div>
            <div className="h-5 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center px-2">
              <div className="w-2 h-2 rounded-full border border-neutral-400" />
            </div>
          </div>
        </div>
      );
    case 'minimal':
      return (
        <div className="h-full flex items-center justify-center p-4">
          <div className="w-3/4 space-y-2">
            <div className="h-2 w-16 bg-neutral-300 dark:bg-neutral-600 rounded mx-auto" />
            <div className="h-6 bg-neutral-200 dark:bg-neutral-700 rounded-md" />
            <div className="h-6 w-20 bg-violet-200 dark:bg-violet-900/50 rounded-md mx-auto mt-3" />
          </div>
        </div>
      );
    case 'template':
      return (
        <div className="h-full p-3">
          <div className="h-2 w-24 bg-neutral-300 dark:bg-neutral-600 rounded mb-2" />
          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-square bg-neutral-200 dark:bg-neutral-700 rounded" />
            ))}
          </div>
        </div>
      );
    case 'command':
      return (
        <div className="h-full flex items-start justify-center p-4 pt-6">
          <div className="w-4/5 space-y-1.5">
            <div className="h-7 bg-neutral-200 dark:bg-neutral-700 rounded-md flex items-center px-2">
              <div className="h-2 w-2 bg-neutral-400 dark:bg-neutral-500 rounded-full" />
            </div>
            <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded" />
            <div className="h-4 bg-neutral-100 dark:bg-neutral-800 rounded" />
            <div className="h-4 bg-violet-100 dark:bg-violet-900/30 rounded" />
          </div>
        </div>
      );
    case 'welcome':
      return (
        <div className="h-full flex items-center justify-center p-4">
          <div className="text-center space-y-2">
            <div className="w-8 h-8 bg-violet-200 dark:bg-violet-900/50 rounded-full mx-auto" />
            <div className="h-2 w-20 bg-neutral-300 dark:bg-neutral-600 rounded mx-auto" />
            <div className="h-1.5 w-28 bg-neutral-200 dark:bg-neutral-700 rounded mx-auto" />
            <div className="h-1.5 w-24 bg-neutral-200 dark:bg-neutral-700 rounded mx-auto" />
          </div>
        </div>
      );
    case 'story':
      return (
        <div className="h-full bg-neutral-900 p-3 font-mono text-[8px]">
          <div className="flex gap-1 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
          </div>
          <div className="space-y-1">
            <div className="h-1 w-12 bg-neutral-600 rounded" />
            <div className="h-1.5 w-16 bg-neutral-400 rounded" />
            <div className="h-1 w-20 bg-neutral-500 rounded" />
            <div className="h-1 w-14 bg-violet-500/70 rounded" />
          </div>
          <div className="mt-2 w-1 h-2 bg-violet-400 animate-pulse" />
        </div>
      );
    case 'story-v2':
      return (
        <div className="h-full bg-neutral-900 p-3 font-mono text-[8px]">
          <div className="flex gap-1 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-20 bg-neutral-300 rounded" />
            <div className="h-1.5 w-12 bg-neutral-300 rounded" />
            <div className="h-1 w-24 bg-neutral-600 rounded mt-1" />
            <div className="h-1 w-20 bg-neutral-600 rounded" />
            <div className="h-1 w-22 bg-violet-500/70 rounded" />
          </div>
          <div className="mt-2 w-1 h-2 bg-violet-400 animate-pulse" />
        </div>
      );
    case 'story-v3':
      return (
        <div className="h-full bg-neutral-900 p-3 font-mono text-[8px]">
          <div className="flex gap-1 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500/70" />
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-28 bg-neutral-300 rounded" />
            <div className="h-1 w-16 bg-neutral-600 rounded mt-1" />
            <div className="h-1 w-14 bg-neutral-600 rounded" />
            <div className="h-1 w-18 bg-neutral-500 rounded" />
            <div className="h-1 w-16 bg-violet-500/70 rounded" />
          </div>
          <div className="mt-2 w-1 h-2 bg-violet-400 animate-pulse" />
        </div>
      );
    case 'kan-welcome':
      return (
        <div className="h-full bg-neutral-950 p-3 flex flex-col items-center">
          <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center mb-1.5">
            <div className="w-3 h-3 rounded-full bg-violet-400/60" />
          </div>
          <div className="h-1 w-6 bg-neutral-400 rounded mb-0.5" />
          <div className="h-0.5 w-10 bg-neutral-700 rounded mb-2" />
          <div className="w-full space-y-1">
            <div className="h-2.5 w-14 bg-neutral-800 rounded-lg rounded-tl-sm" />
            <div className="h-2.5 w-24 bg-neutral-800 rounded-lg rounded-tl-sm" />
            <div className="h-2.5 w-20 bg-neutral-800 rounded-lg rounded-tl-sm" />
            <div className="h-2.5 w-18 bg-violet-500/20 rounded-lg rounded-tl-sm" />
          </div>
        </div>
      );
  }
}
