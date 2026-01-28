'use client';

import { useState } from 'react';
import { SkeletonCard, variantDescriptions } from '@/components/board/SkeletonCard';

type HalftoneVariant = 'dot-field' | 'dot-field-wave' | 'dot-field-pulse' | 'dot-field-sparse';

const variants: HalftoneVariant[] = ['dot-field', 'dot-field-wave', 'dot-field-pulse', 'dot-field-sparse'];

export default function SkeletonPrototypePage() {
  const [selectedVariant, setSelectedVariant] = useState<HalftoneVariant | null>(null);

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
          Dot Field Skeleton Prototypes
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mb-8">
          Animated dot grids with randomized brightness - subtle "AI thinking" loading states.
        </p>

        {/* Grid of all variants */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {variants.map((variant) => (
            <div
              key={variant}
              onClick={() => setSelectedVariant(variant)}
              className={`
                p-6 rounded-lg bg-white dark:bg-neutral-900 shadow-sm cursor-pointer
                transition-all hover:shadow-md
                ${selectedVariant === variant ? 'ring-2 ring-violet-500' : ''}
              `}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    {variantDescriptions[variant].name}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {variantDescriptions[variant].description}
                  </p>
                </div>
                <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">
                  {variant}
                </code>
              </div>

              {/* Single skeleton card */}
              <SkeletonCard variant={variant} className="h-24" />
            </div>
          ))}
        </div>

        {/* Column context view */}
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">
          In Column Context
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          How the skeletons look in a typical Kanban column with multiple loading cards.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {variants.map((variant) => (
            <div
              key={variant}
              className="bg-neutral-200/50 dark:bg-neutral-800/50 rounded-lg p-3"
            >
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3 px-1">
                {variantDescriptions[variant].name}
              </h3>
              <div className="space-y-2">
                <SkeletonCard variant={variant} className="h-20" />
                <SkeletonCard variant={variant} className="h-20" />
                <SkeletonCard variant={variant} className="h-20" />
              </div>
            </div>
          ))}
        </div>

        {/* Mixed real + skeleton preview */}
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4 mt-12">
          Mixed with Real Cards
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          How new loading cards would appear alongside existing content.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {variants.map((variant) => (
            <div
              key={variant}
              className="bg-neutral-200/50 dark:bg-neutral-800/50 rounded-lg p-3"
            >
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3 px-1">
                Inbox - {variantDescriptions[variant].name}
              </h3>
              <div className="space-y-2">
                {/* Real card mock */}
                <div className="rounded-md bg-white dark:bg-neutral-900 p-3 shadow-sm">
                  <h4 className="text-sm font-medium text-neutral-900 dark:text-white">
                    Existing Card Title
                  </h4>
                  <p className="mt-1 text-xs text-neutral-500 line-clamp-2">
                    This is some content from an existing card that's already loaded.
                  </p>
                  <div className="mt-2 flex gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Feature
                    </span>
                  </div>
                </div>

                {/* Loading skeletons */}
                <SkeletonCard variant={variant} className="h-20" />
                <SkeletonCard variant={variant} className="h-20" />
              </div>
            </div>
          ))}
        </div>

        {/* Size variations */}
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4 mt-12">
          Size Variations
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Different heights to match varied card content.
        </p>

        <div className="flex gap-4 items-end">
          <div className="w-48">
            <p className="text-xs text-neutral-500 mb-2">Small (h-16)</p>
            <SkeletonCard variant="dot-field" className="h-16" />
          </div>
          <div className="w-48">
            <p className="text-xs text-neutral-500 mb-2">Medium (h-24)</p>
            <SkeletonCard variant="dot-field" className="h-24" />
          </div>
          <div className="w-48">
            <p className="text-xs text-neutral-500 mb-2">Large (h-32)</p>
            <SkeletonCard variant="dot-field" className="h-32" />
          </div>
          <div className="w-48">
            <p className="text-xs text-neutral-500 mb-2">Tall (h-48)</p>
            <SkeletonCard variant="dot-field" className="h-48" />
          </div>
        </div>

        {/* Usage code */}
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4 mt-12">
          Usage
        </h2>
        <pre className="bg-neutral-900 dark:bg-neutral-950 text-neutral-100 p-4 rounded-lg text-sm overflow-x-auto">
{`import { SkeletonCard } from '@/components/board/SkeletonCard';

// Basic usage - defaults to 'dot-field' variant
<SkeletonCard className="h-20" />

// Variants
<SkeletonCard variant="dot-field" />        // Random twinkle
<SkeletonCard variant="dot-field-wave" />   // Diagonal wave
<SkeletonCard variant="dot-field-pulse" />  // Radial pulse
<SkeletonCard variant="dot-field-sparse" /> // Sparse dramatic`}
        </pre>
      </div>
    </div>
  );
}
