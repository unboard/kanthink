'use client'

/**
 * The screen at the end of a share.
 *
 * A miniature of the destination board, with the card you just shared flying in
 * and settling into its column. It shows you the place the thing went — it does
 * not claim anything about what Kan will do with it, because at share time that
 * isn't decided yet.
 *
 * The columns are the channel's real columns in board order, so the miniature is
 * recognisably the board you'll open. Long names truncate rather than wrap: the
 * label is orientation, and the full name is one tap away.
 */

/** How many columns fit on a phone before the board reads as stripes. */
const WINDOW = 3

export interface SavedConfirmationProps {
  /** Title of the card that was created. */
  title: string
  channelName: string
  /** Every column in the destination channel, in board order. */
  columns: string[]
  /** Index into `columns` of the one the card landed in. */
  targetIndex: number
  /** Whether the card took the top slot — depends on the column's sort rule. */
  landedAtTop?: boolean
  channelHref?: string
  onDone?: () => void
}

export function SavedConfirmation({
  title,
  channelName,
  columns,
  targetIndex,
  landedAtTop = false,
  channelHref,
  onDone,
}: SavedConfirmationProps) {
  // Slide a three-column window over the board so the target is always on screen,
  // and keep it off the edges where there's room either side of it.
  const start = Math.max(0, Math.min(targetIndex - 1, columns.length - WINDOW))
  const visible = columns.slice(start, start + WINDOW)
  const targetName = columns[targetIndex] ?? ''

  return (
    <div className="sl-stage text-center">
      <SavedConfirmationStyles />

      <div className="flex w-full items-end gap-2" style={{ height: 168 }}>
        {start > 0 && <Stub side="left" />}

        {visible.map((name, i) => {
          const isTarget = start + i === targetIndex
          return (
            <div
              key={`${start + i}-${name}`}
              // The target gets a little more room, so its name is the one most
              // likely to survive truncation.
              className={`relative min-w-0 ${isTarget ? 'flex-[1.35]' : 'flex-1'}`}
            >
              <p
                className={`mb-1.5 truncate text-[10px] uppercase tracking-wide ${
                  isTarget ? 'text-violet-300' : 'text-neutral-600'
                }`}
              >
                {name}
              </p>
              <div
                className="relative rounded-lg border border-neutral-800 bg-neutral-900/70 p-1.5"
                style={
                  isTarget
                    ? { animation: 'sl-columnglow 1.2s ease-out .35s both', height: 132 }
                    : { height: 132 }
                }
              >
                {isTarget ? (
                  <>
                    {/* Resident cards, so the new one has somewhere to land. Which
                        side of them it lands on is the column's real sort rule. */}
                    {!landedAtTop && <Resident count={2} />}

                    <div
                      className="overflow-hidden rounded bg-gradient-to-br from-violet-500 to-violet-700 px-1.5 py-1 text-left shadow-lg shadow-violet-900/50"
                      style={{ animation: 'sl-fly 1s cubic-bezier(.2,.9,.3,1) .1s both' }}
                    >
                      <p className="truncate text-[8px] font-medium leading-tight text-white">{title}</p>
                      <p className="mt-0.5 text-[7px] text-violet-200/80">just now</p>
                    </div>

                    {landedAtTop && <Resident count={2} className="mt-1.5" />}

                    <span
                      className="absolute -top-1 left-1/2 -translate-x-1/2 text-xs font-semibold text-violet-300"
                      style={{ animation: 'sl-plusone 1.1s ease-out .55s both' }}
                    >
                      +1
                    </span>
                  </>
                ) : (
                  <Resident count={2} />
                )}
              </div>
            </div>
          )
        })}

        {start + WINDOW < columns.length && <Stub side="right" />}
      </div>

      <p
        className="mt-6 text-[26px] font-semibold leading-tight tracking-tight text-white"
        style={{ animation: 'sl-rise .55s cubic-bezier(.2,.8,.3,1) .75s both' }}
      >
        It&rsquo;s on the board
      </p>
      <p
        className="mt-2 line-clamp-2 text-sm text-neutral-400 wrap-anywhere"
        style={{ animation: 'sl-rise .55s cubic-bezier(.2,.8,.3,1) .9s both' }}
      >
        {landedAtTop ? 'Top of ' : 'Added to '}
        <span className="text-neutral-200">{targetName}</span> in {channelName}
      </p>

      <div
        className="mt-7 flex flex-col items-center gap-2.5"
        style={{ animation: 'sl-rise .5s cubic-bezier(.2,.8,.3,1) 1.05s both' }}
      >
        {channelHref && (
          <a
            href={channelHref}
            className="block max-w-full truncate text-[13px] text-violet-300 underline underline-offset-4 hover:text-violet-200"
          >
            Open {channelName}
          </a>
        )}
        {onDone && (
          <button onClick={onDone} className="text-xs text-neutral-500 hover:text-neutral-300">
            Done
          </button>
        )}
      </div>
    </div>
  )
}

/** Placeholder cards already sitting in a column. */
function Resident({ count, className = '' }: { count: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`mb-1.5 h-6 rounded bg-neutral-800/80 ${i === 0 ? className : ''}`} />
      ))}
    </>
  )
}

/** A sliver of the columns that didn't fit, so the board reads as continuing. */
function Stub({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden
      className={`h-[132px] w-2 shrink-0 border-y border-neutral-800/70 bg-neutral-900/40 ${
        side === 'left' ? 'rounded-l-lg border-l' : 'rounded-r-lg border-r'
      }`}
    />
  )
}

function SavedConfirmationStyles() {
  return (
    <style>{`
      @keyframes sl-rise {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: none; }
      }
      @keyframes sl-fly {
        0%   { opacity: 0; transform: translate(64px, -150px) rotate(10deg) scale(1.25); }
        22%  { opacity: 1; }
        72%  { transform: translate(0, 5px) rotate(-1.5deg) scale(1); }
        86%  { transform: translate(0, -3px); }
        100% { opacity: 1; transform: none; }
      }
      @keyframes sl-columnglow {
        0%, 45%  { box-shadow: none; }
        62%      { box-shadow: 0 0 0 2px rgba(167,139,250,.8), 0 0 34px rgba(139,92,246,.55); }
        100%     { box-shadow: 0 0 0 1px rgba(167,139,250,.3); }
      }
      @keyframes sl-plusone {
        0%, 40%  { opacity: 0; transform: translateY(4px); }
        55%      { opacity: 1; }
        100%     { opacity: 0; transform: translateY(-26px); }
      }
      @media (prefers-reduced-motion: reduce) {
        .sl-stage, .sl-stage * { animation-duration: .01ms !important; animation-delay: 0ms !important; }
      }
    `}</style>
  )
}
