'use client';

import { useSettingsStore, type Theme } from '@/lib/settingsStore';

interface ThemeOptionProps {
  theme: Theme;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  preview: React.ReactNode;
}

function ThemeOption({
  title,
  description,
  selected,
  onSelect,
  preview,
}: ThemeOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        relative flex flex-col w-full rounded-lg border p-4 text-left transition-all
        ${selected
          ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500'
          : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600 hover:bg-neutral-800'
        }
      `}
    >
      {/* Preview area */}
      <div className="mb-3 rounded-md overflow-hidden border border-neutral-700 bg-neutral-900">
        {preview}
      </div>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-medium text-neutral-200">{title}</h4>
          <p className="text-sm text-neutral-400 mt-0.5">{description}</p>
        </div>

        {/* Radio indicator */}
        <div
          className={`
            flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
            ${selected
              ? 'border-violet-500 bg-violet-500'
              : 'border-neutral-600'
            }
          `}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

function DefaultThemePreview() {
  return (
    <div className="p-3 bg-neutral-900">
      <div className="flex gap-2">
        {/* Mini column preview */}
        <div className="flex-1 rounded bg-neutral-800/80 p-2">
          <div className="h-2 w-12 rounded bg-neutral-600 mb-2" />
          <div className="space-y-1.5">
            <div className="h-6 rounded bg-neutral-700" />
            <div className="h-6 rounded bg-neutral-700" />
          </div>
        </div>
        <div className="flex-1 rounded bg-neutral-800/80 p-2">
          <div className="h-2 w-8 rounded bg-neutral-600 mb-2" />
          <div className="space-y-1.5">
            <div className="h-6 rounded bg-neutral-700" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalThemePreview() {
  return (
    <div className="p-3 bg-neutral-950 font-mono text-xs">
      {/* Traffic light header */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-2 h-2 rounded-full bg-red-500/80" />
        <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
        <div className="w-2 h-2 rounded-full bg-green-500/80" />
        <span className="ml-2 text-neutral-600">kanthink://board</span>
      </div>
      <div className="flex gap-2">
        {/* Mini column preview */}
        <div className="flex-1 rounded border border-neutral-800 bg-neutral-950 p-2">
          <div className="h-2 w-12 rounded bg-neutral-700 mb-2" />
          <div className="space-y-1.5">
            <div className="h-5 rounded border border-neutral-800 bg-neutral-900" />
            <div className="h-5 rounded border border-neutral-800 bg-neutral-900" />
          </div>
        </div>
        <div className="flex-1 rounded border border-neutral-800 bg-neutral-950 p-2">
          <div className="h-2 w-8 rounded bg-neutral-700 mb-2" />
          <div className="space-y-1.5">
            <div className="h-5 rounded border border-neutral-800 bg-neutral-900" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeSection() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-100 mb-1">Appearance</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Choose how Kanthink looks to you
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ThemeOption
          theme="default"
          title="Default"
          description="Clean, neutral styling"
          selected={theme === 'default'}
          onSelect={() => setTheme('default')}
          preview={<DefaultThemePreview />}
        />

        <ThemeOption
          theme="terminal"
          title="Terminal"
          description="Monospace, darker, hacker vibes"
          selected={theme === 'terminal'}
          onSelect={() => setTheme('terminal')}
          preview={<TerminalThemePreview />}
        />
      </div>
    </div>
  );
}
