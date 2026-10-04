'use client'

import { useState } from 'react'
import { findPrintModel, formatCents } from '@/lib/print/models'
import { effectiveDpi } from '@/lib/print/spec'
import type { PageCopy, PreflightIssue, PrintPage, PrintSpec, PrintVersion } from '@/lib/print/types'
import { thumb } from './api'

const MODE_LABEL: Record<PrintVersion['mode'], string> = {
  create: 'Designed',
  edit: 'Changed',
  area: 'Area changed',
  retext: 'Words updated',
  fix: 'Fixed for print',
  upscale: 'Sharpened',
  fill: 'Filled to the edges',
}

interface InspectorProps {
  spec: PrintSpec
  page: PrintPage
  pageIndex: number
  busy: boolean
  checking: boolean
  onSelectVersion: (index: number) => void
  onDeleteVersion: (index: number) => void
  onCheck: () => void
  onFix: (issues: PreflightIssue[]) => void
  onUpscale: () => void
  onFill: () => void
  onRetext: (copy: PageCopy) => void
  onHoverIssue: (id: string | null) => void
  onClose?: () => void
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="px-4 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function copyEqual(a?: PageCopy, b?: PageCopy) {
  const pick = (c?: PageCopy) => JSON.stringify([c?.headline ?? '', c?.subhead ?? '', c?.body ?? [], c?.cta ?? '', c?.details ?? []])
  return pick(a) === pick(b)
}

function WordsEditor({ copy, busy, onRetext }: { copy: PageCopy; busy: boolean; onRetext: (c: PageCopy) => void }) {
  // Keyed by version, so a new version starts a fresh draft.
  const [draft, setDraft] = useState<PageCopy>(copy)
  const changed = !copyEqual(draft, copy)

  const field = (key: 'headline' | 'subhead' | 'cta', label: string, rows = 1) =>
    draft[key] !== undefined || key === 'headline' ? (
      <label className="block mb-2.5">
        <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
        <textarea
          rows={rows}
          className="print-input resize-none"
          value={draft[key] ?? ''}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      </label>
    ) : null

  const list = (key: 'body' | 'details', label: string) =>
    draft[key]?.length ? (
      <label className="block mb-2.5">
        <span className="block text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
          {label} <span className="opacity-70">· one per line</span>
        </span>
        <textarea
          rows={Math.min(6, (draft[key]?.length ?? 1) + 1)}
          className="print-input resize-none"
          value={(draft[key] ?? []).join('\n')}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value.split('\n') })}
        />
      </label>
    ) : null

  return (
    <div>
      {field('headline', 'Headline', 2)}
      {field('subhead', 'Subheadline', 2)}
      {list('body', 'Body')}
      {field('cta', 'Call to action')}
      {list('details', 'Details')}
      {changed && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onRetext({
                ...draft,
                body: draft.body?.map((l) => l.trim()).filter(Boolean),
                details: draft.details?.map((l) => l.trim()).filter(Boolean),
              })
            }
            className="h-9 px-3.5 rounded-lg text-[13.5px] font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--magenta)' }}
          >
            Update words
          </button>
          <button type="button" onClick={() => setDraft(copy)} className="h-9 px-3 rounded-lg text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            Undo edits
          </button>
        </div>
      )}
    </div>
  )
}

export function Inspector(props: InspectorProps) {
  const { spec, page, busy, checking, onSelectVersion, onDeleteVersion, onCheck, onFix, onUpscale, onFill, onRetext, onHoverIssue, onClose } = props
  const version = page.versions[page.current]
  if (!version) return null
  const check = version.check
  const dpi = effectiveDpi(spec, version.width)
  const fixable = (check?.issues ?? []).filter((i) => i.kind !== 'resolution')
  const needsSharpen = dpi < 240
  const framed = (check?.issues ?? []).some((i) => i.kind === 'border')
  const model = findPrintModel(version.model)

  const download = async () => {
    const res = await fetch(version.url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${spec.name}-${page.label}.jpg`.replace(/\s+/g, '-').toLowerCase()
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <div className="h-full overflow-y-auto print-scroll">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-semibold">{page.label}</div>
          <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
            {MODE_LABEL[version.mode]} · version {page.current + 1} of {page.versions.length}
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg inline-flex items-center justify-center" aria-label="Close" style={{ color: 'var(--muted)' }}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {page.versions.length > 1 && (
        <div className="px-4 pb-4 flex gap-2 overflow-x-auto print-scroll border-b" style={{ borderColor: 'var(--line)' }}>
          {page.versions.map((v, i) => (
            <div key={v.id} className="relative shrink-0 group">
              <button
                type="button"
                onClick={() => onSelectVersion(i)}
                className="block rounded-[4px] overflow-hidden"
                style={{ outline: i === page.current ? '2px solid var(--ink)' : '1px solid var(--line)', outlineOffset: i === page.current ? 2 : 0 }}
                title={`${MODE_LABEL[v.mode]}${v.prompt ? `: ${v.prompt}` : ''}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb(v.url, 160)} alt="" className="h-16 w-auto block" />
              </button>
              {page.versions.length > 1 && (
                <button
                  type="button"
                  onClick={() => onDeleteVersion(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full hidden group-hover:inline-flex items-center justify-center text-[11px]"
                  style={{ background: 'var(--raise)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
                  aria-label="Delete version"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Section
        title="Print check"
        aside={
          !checking && (
            <button type="button" onClick={onCheck} className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
              {check ? 'Check again' : 'Check'}
            </button>
          )
        }
      >
        {checking ? (
          <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            Reading the page for safe margins, folds, borders and spelling…
          </p>
        ) : !check ? (
          <p className="text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            Not checked yet.
          </p>
        ) : check.issues.length === 0 ? (
          <div className="flex items-start gap-2.5">
            <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--ok)' }} />
            <p className="text-[13.5px] leading-snug" style={{ color: 'var(--ink-2)' }}>
              Ready to print. Text and logos are inside the safe area, colour runs to the edges, and the words match.
            </p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {check.issues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex items-start gap-2.5 text-[13.5px] leading-snug"
                  onMouseEnter={() => onHoverIssue(issue.id)}
                  onMouseLeave={() => onHoverIssue(null)}
                  style={{ color: 'var(--ink-2)' }}
                >
                  <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: issue.severity === 'error' ? 'var(--err)' : 'var(--warn)' }} />
                  {issue.message}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 mt-3">
              {fixable.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onFix(fixable)}
                  className="h-9 px-3.5 rounded-lg text-[13.5px] font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--magenta)' }}
                >
                  Fix {fixable.length === 1 ? 'it' : `${fixable.length} issues`}
                </button>
              )}
              {framed && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onFill}
                  className="h-9 px-3.5 rounded-lg text-[13.5px] border disabled:opacity-40"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
                  title="Trim the white frame and scale the design out to the bleed. Instant, no charge."
                >
                  Fill to the edges
                </button>
              )}
              {needsSharpen && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onUpscale}
                  className="h-9 px-3.5 rounded-lg text-[13.5px] border disabled:opacity-40"
                  style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
                >
                  Sharpen for print
                </button>
              )}
            </div>
          </>
        )}
      </Section>

      {version.copy && (version.copy.headline || version.copy.body?.length) && (
        <Section title="Words on this page">
          <WordsEditor key={version.id} copy={version.copy} busy={busy} onRetext={onRetext} />
        </Section>
      )}

      <Section title="File">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt style={{ color: 'var(--muted)' }}>Resolution</dt>
          <dd style={{ color: dpi >= 240 ? 'var(--ink-2)' : 'var(--warn)' }}>
            {dpi} dpi at print size · {version.width} × {version.height} px
          </dd>
          {model && (
            <>
              <dt style={{ color: 'var(--muted)' }}>Drawn by</dt>
              <dd style={{ color: 'var(--ink-2)' }}>{model.label}</dd>
            </>
          )}
          {version.costCents !== undefined && (
            <>
              <dt style={{ color: 'var(--muted)' }}>Cost</dt>
              <dd style={{ color: 'var(--ink-2)' }}>≈ {formatCents(version.costCents)}</dd>
            </>
          )}
          {version.prompt && (
            <>
              <dt style={{ color: 'var(--muted)' }}>Asked</dt>
              <dd style={{ color: 'var(--ink-2)' }}>{version.prompt}</dd>
            </>
          )}
        </dl>
        <div className="flex gap-2 mt-3">
          <button type="button" onClick={download} className="h-9 px-3.5 rounded-lg text-[13.5px] border" style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}>
            Download this page
          </button>
          {!needsSharpen && (
            <button type="button" disabled={busy} onClick={onUpscale} className="h-9 px-3 rounded-lg text-[13.5px] disabled:opacity-40" style={{ color: 'var(--ink-2)' }} title="Redraw at the highest resolution the model allows">
              Sharpen
            </button>
          )}
        </div>
      </Section>
    </div>
  )
}
