import Link from 'next/link'
import { emailRegistry, type EmailDefinition } from '@/lib/emails/registry'

const categoryColors: Record<EmailDefinition['category'], string> = {
  onboarding: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  collaboration: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  billing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  usage: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
}

function StatusDot({ status }: { status: EmailDefinition['status'] }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        status === 'active' ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600'
      }`}
      title={status}
    />
  )
}

export default function AdminEmailsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Email Catalog</h2>
          <p className="text-sm text-neutral-500 mt-1">{emailRegistry.length} templates</p>
        </div>
        <Link
          href="/admin/emails/design"
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
          Base Template Design
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {emailRegistry.map((email) => (
          <Link
            key={email.slug}
            href={`/admin/emails/${email.slug}`}
            className="group rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${categoryColors[email.category]}`}>
                {email.category}
              </span>
              <StatusDot status={email.status} />
            </div>
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              {email.name}
            </h3>
            <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
              {email.trigger.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
