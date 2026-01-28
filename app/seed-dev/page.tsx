'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

// Initial cards based on our development discussion
const INITIAL_DEV_CARDS = [
  {
    title: 'Complete the feedback loop',
    content: `Card movements are captured as feedback signals but not yet used for learning.

Connect card movements to instruction refinement - when users consistently move AI-generated cards to "Dislike", the AI should learn what doesn't work.

This is what makes Kanthink a *learning* system rather than just a kanban + AI generation tool.`,
  },
  {
    title: 'Empty state / first-run experience',
    content: `New users hitting an empty channel with no instructions and no cards face a cold start problem.

Idea: The first column of a new channel could be "Channel Purpose" with AI-generated seed cards representing possible interpretations of why the user created it. Delete the ones that don't fit. Keep the ones that do. The channel learns its own purpose through curation.`,
  },
  {
    title: 'Instruction Intelligence features',
    content: `From the PRD - these differentiate Kanthink from "kanban + ChatGPT":

1. Questions as first-class objects - AI generates clarifying questions based on usage patterns
2. Instruction refinement - AI proposes changes to channel instructions (diff view, Apply/Dismiss)
3. Drift detection - gentle suggestions when channel usage diverges from stated purpose

These are Phase 2 but they're the soul of the product.`,
  },
  {
    title: 'Move action needs clarity',
    content: `Generate and Modify have clear mental models. "Move cards from X based on criteria" is fuzzier.

Where do cards move TO? The AI decides? Need to think through the UX here.

Current label shows "Move cards from" but destination is ambiguous.`,
  },
  {
    title: 'Channel "why" should reveal itself',
    content: `Core to every channel created is some guiding "why" that needs to reveal itself.

Ideas:
- Instructions could BE cards in a special column that users curate
- AI could surface questions about purpose based on how cards are organized
- The act of sorting becomes the definition of intent`,
  },
];

export default function SeedDevPage() {
  const router = useRouter();
  const seedDevChannel = useStore((s) => s.seedDevChannel);
  const hasHydrated = useStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;

    const channel = seedDevChannel(INITIAL_DEV_CARDS);
    if (channel) {
      router.replace(`/channel/${channel.id}`);
    } else {
      // Channel already exists, find it and redirect
      const channels = useStore.getState().channels;
      const devChannel = Object.values(channels).find(c => c.name === 'Kanthink <dev>');
      if (devChannel) {
        router.replace(`/channel/${devChannel.id}`);
      } else {
        router.replace('/');
      }
    }
  }, [hasHydrated, seedDevChannel, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-neutral-600 dark:text-neutral-400">Creating Kanthink &lt;dev&gt; channel...</p>
      </div>
    </div>
  );
}
