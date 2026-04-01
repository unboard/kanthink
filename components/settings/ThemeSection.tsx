'use client';

import { useSettingsStore, type Theme } from '@/lib/settingsStore';

function SporesThemePreview() {
  const glowColors = ['bg-cyan-400/30', 'bg-white/20', 'bg-violet-400/25', 'bg-cyan-300/35'];
  return (
    <div className="p-3 bg-neutral-900 relative overflow-hidden">
      {/* Bioluminescent particles preview */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className={`absolute rounded-full ${glowColors[i % glowColors.length]} animate-pulse`}
            style={{
              left: `${8 + (i * 12) % 85}%`,
              top: `${12 + (i * 11) % 70}%`,
              width: `${1.5 + (i % 2)}px`,
              height: `${1.5 + (i % 2)}px`,
              boxShadow: i % 3 === 0 ? '0 0 6px 2px rgba(34, 211, 238, 0.4)' : 'none',
              animationDelay: `${i * 0.25}s`,
              animationDuration: '3s',
            }}
          />
        ))}
      </div>
      <div className="relative flex gap-2">
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

function LiquidThemePreview() {
  return (
    <div
      className="p-3 relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 100% 80% at 50% 0%, hsla(205, 75, 82, 0.95) 0%, transparent 60%),
          radial-gradient(ellipse 70% 60% at 0% 100%, hsla(330, 80, 65, 0.7) 0%, transparent 50%),
          radial-gradient(ellipse 60% 70% at 100% 80%, hsla(175, 75, 60, 0.6) 0%, transparent 50%),
          linear-gradient(180deg, hsl(205, 65, 88) 0%, hsl(280, 55, 70) 100%)
        `,
      }}
    >
      <div className="relative flex gap-2">
        {/* White frosted glass columns */}
        <div
          className="flex-1 rounded-lg p-2"
          style={{
            background: 'rgba(255, 255, 255, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.45)',
          }}
        >
          <div className="h-2 w-12 rounded mb-2" style={{ background: 'rgba(0,0,0,0.15)' }} />
          <div className="space-y-1.5">
            <div className="h-6 rounded-md" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)' }} />
            <div className="h-6 rounded-md" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)' }} />
          </div>
        </div>
        <div
          className="flex-1 rounded-lg p-2"
          style={{
            background: 'rgba(255, 255, 255, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.45)',
          }}
        >
          <div className="h-2 w-8 rounded mb-2" style={{ background: 'rgba(0,0,0,0.15)' }} />
          <div className="space-y-1.5">
            <div className="h-6 rounded-md" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ThemeCardProps {
  theme: Theme;
  name: string;
  description: string;
  preview: React.ReactNode;
  isActive: boolean;
  onSelect: () => void;
}

function ThemeCard({ name, description, preview, isActive, onSelect }: ThemeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex flex-col w-full rounded-lg border p-4 text-left transition-all ${
        isActive
          ? 'border-violet-500 bg-violet-500/10 ring-1 ring-violet-500'
          : 'border-neutral-700 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-800/50'
      }`}
    >
      <div className="mb-3 rounded-md overflow-hidden border border-neutral-700 bg-neutral-900">
        {preview}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-medium text-neutral-200">{name}</h4>
          <p className="text-sm text-neutral-400 mt-0.5">{description}</p>
        </div>
        <div
          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors ${
            isActive ? 'border-violet-500 bg-violet-500' : 'border-neutral-600'
          }`}
        >
          {isActive && (
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

export function ThemeSection() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-100 mb-1">Appearance</h2>
      <p className="text-sm text-neutral-400 mb-4">
        Choose your visual style
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ThemeCard
          theme="spores"
          name="Spores"
          description="Bioluminescent particles"
          preview={<SporesThemePreview />}
          isActive={theme === 'spores'}
          onSelect={() => setTheme('spores')}
        />
        <ThemeCard
          theme="liquid"
          name="Liquid"
          description="Frosted glass over vivid landscapes"
          preview={<LiquidThemePreview />}
          isActive={theme === 'liquid'}
          onSelect={() => setTheme('liquid')}
        />
      </div>
    </div>
  );
}
