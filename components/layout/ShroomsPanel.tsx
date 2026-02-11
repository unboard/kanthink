'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NavPanel } from './NavPanel';
import { useNav } from '@/components/providers/NavProvider';
import { useStore, getGlobalShrooms, getChannelShrooms, getFavoriteShrooms } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import type { InstructionCard } from '@/lib/types';

type ShroomTab = 'channel' | 'favorites' | 'community';

interface ShroomCardProps {
  shroom: InstructionCard;
  onRun?: () => void;
  onEdit?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
}

function ShroomCard({ shroom, onRun, onEdit, onToggleFavorite, isFavorite }: ShroomCardProps) {
  const actionIcons: Record<string, React.ReactNode> = {
    generate: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
      </svg>
    ),
    modify: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    move: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  };

  const isGlobal = shroom.scope === 'global';
  const isKanthinkResource = shroom.isGlobalResource;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors group">
      {/* Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
        {actionIcons[shroom.action] || <KanthinkIcon size={16} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-neutral-900 dark:text-white truncate">
            {shroom.title}
          </span>
          {isKanthinkResource && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
              by Kanthink
            </span>
          )}
          {isGlobal && !isKanthinkResource && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
              </svg>
              Global
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 truncate mt-0.5">
          {shroom.instructions.slice(0, 60)}...
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onRun && (
          <button
            onClick={onRun}
            className="p-1.5 rounded-md text-neutral-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            title="Run"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={`p-1.5 rounded-md transition-colors ${
              isFavorite
                ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300'
                : 'text-neutral-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
            }`}
            title={isFavorite ? 'Unfavorite' : 'Favorite'}
          >
            {isFavorite ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            )}
          </button>
        )}
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-neutral-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

const TAB_CONFIG: { key: ShroomTab; label: string }[] = [
  { key: 'channel', label: 'Channel' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'community', label: 'Community' },
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
                          {channelShrooms.map((shroom) => (
                            <ShroomCard
                              key={shroom.id}
                              shroom={shroom}
                              onRun={() => handleRunShroom(shroom)}
                              onEdit={() => handleEditShroom(shroom)}
                              onToggleFavorite={() => toggleInstructionCardFavorite(shroom.id)}
                              isFavorite={favoriteInstructionCardIds.includes(shroom.id)}
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
                          {globalShrooms.map((shroom) => (
                            <ShroomCard
                              key={shroom.id}
                              shroom={shroom}
                              onRun={channelId ? () => handleRunShroom(shroom) : undefined}
                              onEdit={() => handleEditShroom(shroom)}
                              onToggleFavorite={() => toggleInstructionCardFavorite(shroom.id)}
                              isFavorite={favoriteInstructionCardIds.includes(shroom.id)}
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
                    {favoriteShrooms.map((shroom) => (
                      <ShroomCard
                        key={shroom.id}
                        shroom={shroom}
                        onRun={() => handleRunShroom(shroom)}
                        onEdit={() => handleEditShroom(shroom)}
                        onToggleFavorite={() => toggleInstructionCardFavorite(shroom.id)}
                        isFavorite={true}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'community' && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 mb-3">
                  <svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Coming soon
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  Discover and share shrooms with the community
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </NavPanel>
  );
}
