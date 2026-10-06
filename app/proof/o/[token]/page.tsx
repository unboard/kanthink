import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getPartner, jobsOf, orderByToken, orderOf, parseJson } from '@/lib/print/orders/server'
import { pageView } from '@/lib/print/orders/views'
import type { Customer, JobStatus } from '@/lib/print/orders/types'
import { thumb } from '@/lib/print/thumb'

export const dynamic = 'force-dynamic'

const LABEL: Record<JobStatus, string> = { received: 'Being checked', awaiting_approval: 'Ready for you to approve', changes_requested: 'We’re making your changes', approved: 'Approved', locked: 'Final', in_production: 'Printing', complete: 'Complete', cancelled: 'Cancelled' }

/** /proof/o/:token — every item in an order, each opening its own page. One item goes straight there. */
export default async function ProofOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const order = await orderByToken(token)
  if (!order) notFound()
  const jobs = await jobsOf(order.id)
  if (jobs.length === 1) redirect(`/proof/${jobs[0].token}`)
  const brand = (await getPartner(order.userId)).brand
  const view = jobs[0] ? await pageView(jobs[0], await orderOf(jobs[0]), 'customer') : null
  const customer = parseJson<Customer>(order.customer, {})
  const items = view?.siblings ?? []
  const waiting = items.filter((s) => s.status === 'awaiting_approval').length
  const first = customer.name?.split(' ')[0]

  return (
    <div className="light-table h-full overflow-y-auto">
      <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="max-w-[880px] mx-auto px-4 sm:px-6 h-[60px] flex items-center">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name ?? ''} className="max-h-8 max-w-[180px] object-contain" />
          ) : (
            <span className="font-semibold text-[15px]">{brand.name || 'Your order'}</span>
          )}
        </div>
      </header>
      <main className="max-w-[880px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">
          {waiting ? `${first ? `${first}, ` : ''}${waiting === items.length ? 'your proofs are' : `${waiting} of your ${items.length} proofs are`} ready` : `Your order${order.ref ? ` ${order.ref}` : ''}`}
        </h1>
        <p className="text-[16px] mt-2 max-w-[560px]" style={{ color: 'var(--ink-2)' }}>
          {waiting ? 'Open each one to see exactly what we’ll print, then approve it or ask for a change.' : 'Each item has its own page showing exactly what we’ll print.'}
        </p>
        <ul className="mt-8 grid gap-4 grid-cols-1 sm:grid-cols-2">
          {items.map((s) => {
            const ready = s.status === 'awaiting_approval'
            return (
              <li key={s.token}>
                <Link href={`/proof/${s.token}`} className="block rounded-3xl bg-white/70 hover:bg-white transition-colors p-3 border" style={{ borderColor: ready ? 'rgba(229,0,126,.35)' : 'var(--line)' }}>
                  <span className="light-table h-52 rounded-2xl flex items-center justify-center p-5">
                    {s.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb(s.thumb, 600)} alt="" className="max-w-full max-h-full object-contain bg-white" style={{ boxShadow: '0 2px 4px rgba(0,0,0,.08), 0 14px 30px rgba(20,24,29,.16)' }} />
                    )}
                  </span>
                  <span className="flex items-center gap-2 px-2 pt-3 pb-1">
                    {ready && <span className="signal-dot" />}
                    <span className="text-[16px] font-semibold">{s.name}</span>
                  </span>
                  <span className="block px-2 pb-1 text-[14px]" style={{ color: ready ? '#9d004f' : 'var(--ink-2)' }}>
                    {LABEL[s.status]}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        {(brand.phone || brand.email) && (
          <p className="mt-12 text-center text-[13.5px]" style={{ color: 'var(--muted)' }}>
            Questions? {brand.phone ? <a href={`tel:${brand.phone}`}>{brand.phone}</a> : null}
            {brand.phone && brand.email ? ' or ' : ''}
            {brand.email ? <a href={`mailto:${brand.email}`}>{brand.email}</a> : null}
          </p>
        )}
      </main>
    </div>
  )
}
