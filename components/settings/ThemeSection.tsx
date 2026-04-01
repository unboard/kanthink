'use client';

// Theme selection temporarily disabled - only spores theme available
// Other theme previews removed, will be re-added when themes return

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
        {/* Mini column preview - same as Default */}
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

export function ThemeSection() {
  // Theme selection temporarily disabled - only spores theme available
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-100 mb-1">Appearance</h2>
      <p className="text-sm text-neutral-400 mb-4">
        More themes coming soon
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Single theme shown - Spores is the only option */}
        <div className="relative flex flex-col w-full rounded-lg border p-4 text-left border-violet-500 bg-violet-500/10 ring-1 ring-violet-500">
          <div className="mb-3 rounded-md overflow-hidden border border-neutral-700 bg-neutral-900">
            <SporesThemePreview />
          </div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-medium text-neutral-200">Spores</h4>
              <p className="text-sm text-neutral-400 mt-0.5">Bioluminescent particles</p>
            </div>
            <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 border-violet-500 bg-violet-500">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
