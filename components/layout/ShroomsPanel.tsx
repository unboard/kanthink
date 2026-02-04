'use client';

import { usePathname, useRouter } from 'next/navigation';
import { NavPanel } from './NavPanel';
import { useNav } from '@/components/providers/NavProvider';
import { useStore, getGlobalShrooms, getChannelShrooms } from '@/lib/store';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import type { InstructionCard } from '@/lib/types';

interface ShroomCardProps {
  shroom: InstructionCard;
  onRun?: () => void;
  onEdit?: () => void;
}

function ShroomCard({ shroom, onRun, onEdit }: ShroomCardProps) {
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

export function ShroomsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const { closePanel } = useNav();
  const instructionCards = useStore((s) => s.instructionCards);
  const channels = useStore((s) => s.channels);
  const hasHydrated = useStore((s) => s._hasHydrated);

  // Get current channel ID from pathname
  const channelId = pathname.startsWith('/channel/') ? pathname.split('/')[2] : null;
  const currentChannel = channelId ? channels[channelId] : null;

  // Get shrooms
  const state = useStore.getState();
  const globalShrooms = getGlobalShrooms(state);
  const channelShrooms = channelId ? getChannelShrooms(state, channelId) : [];

  const handleRunShroom = (shroom: InstructionCard) => {
    const targetChannelId = shroom.channelId || channelId;
    if (targetChannelId) {
      closePanel();
      router.push(`/channel/${targetChannelId}?shrooms=open&run=${shroom.id}`);
    }
  };

  const handleEditShroom = (shroom: InstructionCard) => {
    const targetChannelId = shroom.channelId || channelId;
    if (targetChannelId) {
      closePanel();
      router.push(`/channel/${targetChannelId}?shrooms=open&edit=${shroom.id}`);
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
    <NavPanel panelKey="shrooms" title="Shrooms" width="md">
      <div className="p-4 space-y-6">
        {/* Empty state */}
        {channelShrooms.length === 0 && globalShrooms.length === 0 && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-3">
              <KanthinkIcon size={24} className="text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No shrooms yet
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Create a shroom in a channel to automate AI actions
            </p>
          </div>
        )}

        {/* This Channel section */}
        {channelShrooms.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                />
              ))}
            </div>
          </div>
        )}

        {/* Global section */}
        {globalShrooms.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
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

        {/* Discover section placeholder */}
        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Discover
            </h3>
          </div>
          <div className="text-center py-4">
            <p className="text-xs text-neutral-500">
              Community shrooms coming soon
            </p>
          </div>
        </div>
      </div>
    </NavPanel>
  );
}
