'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { emailRegistry, type EmailDefinition } from '@/lib/emails/registry'

const categoryColors: Record<EmailDefinition['category'], string> = {
  onboarding: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  collaboration: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  billing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  usage: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  digest: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
}

export default function EmailDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [override, setOverride] = useState<{ id: string } | null>(null)
  const [loadingOverride, setLoadingOverride] = useState(true)
  const [resetting, setResetting] = useState(false)

  const email = emailRegistry.find((e) => e.slug === slug)

  // Check if a DB override exists for this system email
  useEffect(() => {
    if (!slug) return
    async function checkOverride() {
      try {
        const res = await fetch(`/api/admin/emails/templates?systemSlug=${slug}`)
        if (res.ok) {
          const data = await res.json()
          if (data.length > 0) {
            setOverride({ id: data[0].id })
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingOverride(false)
      }
    }
    checkOverride()
  }, [slug])

  if (!email) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-neutral-500">Email template not found.</p>
        <Link href="/admin/emails" className="text-sm text-violet-600 hover:underline mt-2 inline-block">
          Back to catalog
        </Link>
      </div>
    )
  }

  async function handleResetToDefault() {
    if (!override) return
    if (!confirm('Reset this email to the default template? Your customization will be deleted.')) return
    setResetting(true)
    try {
      const res = await fetch(`/api/admin/emails/templates/${override.id}`, { method: 'DELETE' })
      if (res.ok) {
        setOverride(null)
      }
    } catch {
      // ignore
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm">
        <Link
          href="/admin/emails"
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Catalog
        </Link>
        <span className="text-sm font-medium text-neutral-900 dark:text-white">{email.name}</span>

        {override && (
          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
            customized
          </span>
        )}

        <div className="flex-1" />

        {!loadingOverride && (
          <div className="flex items-center gap-2">
            {override && (
              <button
                onClick={handleResetToDefault}
                disabled={resetting}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors disabled:opacity-50"
              >
                Reset to Default
              </button>
            )}
            <Link
              href={override
                ? `/admin/emails/create?id=${override.id}`
                : `/admin/emails/create?systemSlug=${slug}`
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              {override ? 'Edit' : 'Customize'}
            </Link>
          </div>
        )}
      </div>

      {/* Content: metadata + preview */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Metadata */}
        <div className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-y-auto p-5">
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColors[email.category]}`}>
                  {email.category}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs ${
                  email.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'
                }`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                    email.status === 'active' ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`} />
                  {email.status}
                </span>
              </div>
            </div>

            <Field label="Description" value={email.description} />
            <Field label="Subject" value={email.subject} mono />

            <div>
              <Label>Trigger</Label>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">{email.trigger.description}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  email.trigger.type === 'event'
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                }`}>
                  {email.trigger.type}
                </span>
              </div>
            </div>

            {email.variables.length > 0 && (
              <div>
                <Label>Available Variables</Label>
                <div className="space-y-2 mt-1.5">
                  {email.variables.map((v) => (
                    <div key={v.name} className="bg-neutral-50 dark:bg-neutral-900 rounded px-2.5 py-2">
                      <code className="text-xs font-mono text-violet-600 dark:text-violet-400">{`{{${v.name}}}`}</code>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Code location</Label>
              <p className="text-xs text-neutral-500 font-mono bg-neutral-50 dark:bg-neutral-900 rounded px-2 py-1.5 break-all">
                {email.trigger.location}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex-1 flex flex-col bg-neutral-50 dark:bg-neutral-900 min-h-0">
          <div className="flex items-center justify-end px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-md p-0.5">
              <button
                onClick={() => setViewport('desktop')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  viewport === 'desktop'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                Desktop
              </button>
              <button
                onClick={() => setViewport('mobile')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  viewport === 'mobile'
                    ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                Mobile
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-start justify-center p-6 overflow-auto">
            <iframe
              key={slug}
              src={`/api/admin/emails/preview?template=${slug}`}
              className="bg-white rounded-lg shadow-md border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
              style={{
                width: viewport === 'desktop' ? 480 : 320,
                height: '100%',
                minHeight: 600,
              }}
              title={`${email.name} preview`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">{children}</p>
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className={`text-sm text-neutral-700 dark:text-neutral-300 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}
