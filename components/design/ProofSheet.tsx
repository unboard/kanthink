'use client';

import type { ProductSpec, SideSpec } from '@/lib/design/products';

interface ProofSheetProps {
  spec: ProductSpec;
  side: SideSpec;
  url: string | null;
  working: boolean;
  showGuides: boolean;
  starters: string[];
  onStarter: (text: string) => void;
}

/**
 * The piece, shown the way a printer would show it: at true trim aspect, with
 * corner marks, a spec readout, and the reserved postal regions drawn as
 * pre-press keylines over the artwork.
 *
 * The guides are the point, not decoration. A postcard whose address block is
 * buried under a photograph gets rejected at the dock, and the only moment that
 * is cheap to fix is while you are looking at the design.
 */
export function ProofSheet({
  spec,
  side,
  url,
  working,
  showGuides,
  starters,
  onStarter,
}: ProofSheetProps) {
  const safeX = (spec.safeIn / spec.widthIn) * 100;
  const safeY = (spec.safeIn / spec.heightIn) * 100;

  return (
    <div className="ds-proof">
      <div className="ds-piece" style={{ aspectRatio: `${spec.widthIn} / ${spec.heightIn}` }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${side.label} of the ${spec.label}`} />
        ) : !working ? (
          <div className="ds-empty">
            <div>
              <p className="ds-empty-title">{side.label} is blank</p>
              <p className="ds-empty-sub">
                Describe what this postcard is for and hit Generate. You don&apos;t need to know what
                you want yet — make something, then tell me what to change.
              </p>
            </div>
            {starters.length > 0 && (
              <div className="ds-starters">
                {starters.map((s) => (
                  <button key={s} type="button" className="ds-starter" onClick={() => onStarter(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* The guides div is keyed on the side so the keylines redraw when you
            switch, and only then — a draw that replayed on every keystroke
            would read as a glitch. */}
        {showGuides && (
          <div className="ds-guides" key={side.id} data-animate="true" aria-hidden="true">
            <div
              className="ds-safe-line"
              style={{
                left: `${safeX}%`,
                top: `${safeY}%`,
                right: `${safeX}%`,
                bottom: `${safeY}%`,
              }}
            />
            {side.reservations.map((r) => (
              <div
                key={r.id}
                className="ds-reserved"
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              >
                <span className="ds-reserved-label ds-mono">{r.label}</span>
              </div>
            ))}
          </div>
        )}

        {working && (
          <div className="ds-working ds-mono">
            <div className="ds-working-bar" />
            <span>Rendering {side.label.toLowerCase()}</span>
          </div>
        )}
      </div>

      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <span key={corner} className="ds-trim" data-corner={corner} aria-hidden="true" />
      ))}

      <div className="ds-readout ds-mono">
        <span>
          {spec.widthIn.toFixed(2)} × {spec.heightIn.toFixed(2)} IN
        </span>
        <span className="ds-readout-sep" />
        <span>Bleed {spec.bleedIn.toFixed(3)}″</span>
        <span className="ds-readout-sep" />
        <span>Safe {spec.safeIn.toFixed(2)}″</span>
        <span className="ds-readout-sep" />
        <span>{side.label}</span>
      </div>
    </div>
  );
}
