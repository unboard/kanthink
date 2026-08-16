'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NavPanel } from './NavPanel';
import { useNav } from '@/components/providers/NavProvider';
import { useStore, getGlobalShrooms, getChannelShrooms, getFavoriteShrooms } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { ShroomCard as SharedShroomCard } from '@/components/shrooms/ShroomCard';
import type { InstructionCard } from '@/lib/types';

type ShroomTab = 'channel' | 'favorites';

const TAB_CONFIG: { key: ShroomTab; label: string }[] = [
  { key: 'channel', label: 'Channel' },
  { key: 'favorites', label: 'Favorites' },
];

export function ShroomsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const { closePanel, isMobile } = useNav();
  const instructionCards = useStore((s) => s.instructionCards);
  const channels = useStore((s) => s.channels);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const favoriteInstructionCardIds = useStore((s) => s.favoriteInstructionCardIds);
  const toggleInstructionCardFavorite = useStore((s) => s.toggleInstructionCardFavorite);

  const [activeTab, setActiveTab] = useState<ShroomTab>('channel');

  // Get current channel ID from pathname
  const channelId = pathname.startsWith('/channel/') ? pathname.split('/')[2] : null;
  const currentChannel = channelId ? channels[channelId] : null;

  // Get shrooms
  const state = useStore.getState();
  const globalShrooms = getGlobalShrooms(state);
  const channelShrooms = channelId ? getChannelShrooms(state, channelId) : [];
  const favoriteShrooms = getFavoriteShrooms(state);
  const allChannelShrooms = [...channelShrooms, ...globalShrooms];

  // Explainer card state
  const shroomsExplainerDismissed = useSettingsStore((s) => s.shroomsExplainerDismissed);
  const setShroomsExplainerDismissed = useSettingsStore((s) => s.setShroomsExplainerDismissed);

  const handleRunShroom = (shroom: InstructionCard) => {
    const targetChannelId = shroom.channelId || channelId;
    if (targetChannelId) {
      if (isMobile) closePanel();
      router.push(`/channel/${targetChannelId}?shrooms=open&run=${shroom.id}`);
    }
  };

  const handleEditShroom = (shroom: InstructionCard) => {
    const targetChannelId = shroom.channelId || channelId;
    if (targetChannelId) {
      if (isMobile) closePanel();
      router.push(`/channel/${targetChannelId}?shrooms=open&edit=${shroom.id}`);
    }
  };

  const handleCreateShroom = () => {
    if (channelId) {
      if (isMobile) closePanel();
      router.push(`/channel/${channelId}?shrooms=open&create=true`);
    }
  };

  if (!hasHydrated) {
    return (
      <NavPanel panelKey="shrooms" title="Shrooms" width="md">
        <div className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
            <div className="h-16 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
          </div>
        </div>
      </NavPanel>
    );
  }

  return (
    <NavPanel panelKey="shrooms" title="Shrooms" subtitle="AI-powered actions for your board" width="md">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* What are shrooms? explainer */}
            {!shroomsExplainerDismissed && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 relative">
                <button
                  onClick={() => setShroomsExplainerDismissed(true)}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-violet-400 hover:text-violet-600 dark:text-violet-500 dark:hover:text-violet-300 rounded-full hover:bg-violet-100 dark:hover:bg-violet-900/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex items-start gap-3 pr-6">
                  <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-violet-900 dark:text-violet-100">
                      What are shrooms?
                    </h3>
                    <p className="mt-1 text-xs text-violet-700/80 dark:text-violet-300/70 leading-relaxed">
                      Shrooms are AI-powered automations that can generate new cards, enrich existing ones with data, or move cards between columns based on rules you define.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/50">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  {tab.label}
                  {tab.key === 'favorites' && favoriteShrooms.length > 0 && (
                    <span className="ml-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                      {favoriteShrooms.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* The map is a page, not a tab — a graph squeezed into this column would be
                a list with extra steps. */}
            {allChannelShrooms.length > 0 && (
              <button
                onClick={() => {
                  if (isMobile) closePanel();
                  router.push(channelId ? `/channel/${channelId}/shrooms` : '/shrooms');
                }}
                className="flex w-full items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-xs text-neutral-600 transition-colors hover:border-violet-400 hover:text-violet-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-violet-500 dark:hover:text-violet-400"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}>
                  <rect x="1" y="5" width="5" height="4" rx="1" />
                  <rect x="10" y="2" width="5" height="4" rx="1" />
                  <rect x="10" y="9" width="5" height="4" rx="1" />
                  <path d="M6 7h2a1 1 0 0 1 1 1v3M6 7h2a1 1 0 0 0 1-1V4" strokeLinecap="round" />
                </svg>
                See the map
                <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.12em] text-neutral-400">
                  {allChannelShrooms.length}
                </span>
              </button>
            )}

            {/* Tab content */}
            {activeTab === 'channel' && (
              <>
                {allChannelShrooms.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-3">
                      <KanthinkIcon size={24} className="text-violet-600 dark:text-violet-400" />
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      No shrooms yet
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {channelId ? 'Create your first shroom to automate AI actions' : 'Open a channel to create shrooms'}
                    </p>
                    {channelId && (
                      <button
                        onClick={handleCreateShroom}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Shroom
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* This Channel section */}
                    {channelShrooms.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                          </svg>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            This Channel
                          </h3>
                          {currentChannel && (
                            <span className="text-xs text-neutral-400 truncate">
                              ({currentChannel.name})
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {channelShrooms.map((shroom, i) => (
                            <SharedShroomCard
                              key={shroom.id}
                              shroom={shroom}
                              channel={currentChannel ?? undefined}
                              allShrooms={instructionCards}
                              index={i}
                              onRun={() => handleRunShroom(shroom)}
                              onEdit={() => handleEditShroom(shroom)}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Global section */}
                    {globalShrooms.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-3.5 h-3.5 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
                          </svg>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                            Global
                          </h3>
                        </div>
                        <div className="space-y-2">
                          {globalShrooms.map((shroom, i) => (
                            <SharedShroomCard
                              key={shroom.id}
                              shroom={shroom}
                              channel={channels[shroom.channelId] ?? currentChannel ?? undefined}
                              allShrooms={instructionCards}
                              index={i}
                              onRun={channelId ? () => handleRunShroom(shroom) : undefined}
                              onEdit={() => handleEditShroom(shroom)}
                            />
                          ))}
                        </div>
                        {!channelId && globalShrooms.length > 0 && (
                          <p className="text-xs text-neutral-500 mt-2 text-center">
                            Open a channel to run global shrooms
                          </p>
                        )}
                      </div>
                    )}

                    {/* Inline New Shroom CTA */}
                    {channelId && (
                      <button
                        onClick={handleCreateShroom}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Shroom
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'favorites' && (
              <>
                {favoriteShrooms.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 mb-3">
                      <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      No favorites yet
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Star a shroom to find it quickly here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {favoriteShrooms.map((shroom, i) => (
                      <SharedShroomCard
                        key={shroom.id}
                        shroom={shroom}
                        channel={channels[shroom.channelId] ?? currentChannel ?? undefined}
                        allShrooms={instructionCards}
                        index={i}
                        onRun={() => handleRunShroom(shroom)}
                        onEdit={() => handleEditShroom(shroom)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </NavPanel>
  );
}
