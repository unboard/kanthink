import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPartner, jobsOf, orderByToken, orderOf, parseJson } from '@/lib/print/orders/server'
import { pageView } from '@/lib/print/orders/views'
import { STATUS_LABEL, type Customer } from '@/lib/print/orders/types'
import { thumb } from '@/lib/print/thumb'

export const dynamic = 'force-dynamic'

/** /proof/o/:token — every item in an order, each linking to its own page. One item goes straight there. */
export default async function ProofOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const order = await orderByToken(token)
  if (!order) notFound()
  const jobs = await jobsOf(order.id)
  if (jobs.length === 1) redirect(`/proof/${jobs[0].token}`)
  const brand = (await getPartner(order.userId)).brand
  const view = jobs[0] ? await pageView(jobs[0], await orderOf(jobs[0]), 'customer') : null
  const customer = parseJson<Customer>(order.customer, {})
  const accent = /^#[0-9a-f]{6}$/i.test(brand.color ?? '') ? brand.color! : '#1f2937'
  const waiting = view?.siblings.filter((s) => s.status === 'awaiting_approval').length ?? 0

  return (
    <div className="h-full overflow-y-auto" style={{ ['--accent' as string]: accent }}>
      <header className="border-b bg-white" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[860px] mx-auto px-4 sm:px-6 h-16 flex items-center">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name ?? ''} className="max-h-9 max-w-[160px] object-contain" />
          ) : (
            <span className="font-semibold text-[16px]">{brand.name || 'Your order'}</span>
          )}
        </div>
      </header>
      <main className="max-w-[860px] mx-auto px-4 sm:px-6 py-8">
        <div className="text-[13px]" style={{ color: 'var(--muted)' }}>
          {order.ref ? `Order ${order.ref}` : 'Your order'}
          {customer.name ? ` · ${customer.name}` : ''}
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight mt-1">
          {jobs.length} items{waiting ? ` · ${waiting} waiting for your approval` : ''}
        </h1>
        <p className="text-[14.5px] mt-1" style={{ color: 'var(--ink-2)' }}>
          Each item has its own page, with exactly what will print and anything we changed.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {(view?.siblings ?? []).map((s, i) => (
            <li key={s.token}>
              <Link href={`/proof/${s.token}`} className="proof-card flex items-center gap-4 p-3 hover:shadow-sm">
                <span className="w-20 h-20 rounded-lg overflow-hidden inline-flex items-center justify-center shrink-0" style={{ background: 'var(--raise)' }}>
                  {s.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb(s.thumb, 200)} alt="" className="max-w-full max-h-full object-contain" />
                  )}
                </span>
                <span>
                  <span className="block text-[15.5px] font-semibold">
                    {i + 1}. {s.name}
                  </span>
                  <span className="block text-[13px] mt-0.5" style={{ color: s.status === 'awaiting_approval' ? '#b45309' : 'var(--ink-2)' }}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <footer className="mt-10 text-center text-[12.5px]" style={{ color: 'var(--muted)' }}>
          {[brand.name, brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')}
        </footer>
      </main>
    </div>
  )
}
