import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CustomerProof } from '@/components/proof/CustomerProof'
import { getPartner, jobByToken, orderOf } from '@/lib/print/orders/server'
import { pageView } from '@/lib/print/orders/views'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const job = await jobByToken((await params).token)
  if (!job) return { title: 'Order not found' }
  const brand = (await getPartner(job.userId)).brand
  return { title: `${job.name}${brand.name ? ` · ${brand.name}` : ''}`, robots: { index: false, follow: false } }
}

/** /proof/:token — one job's shared page, for the customer. */
export default async function ProofJobPage({ params }: Props) {
  const { token } = await params
  const job = await jobByToken(token)
  if (!job) notFound()
  const view = await pageView(job, await orderOf(job), 'customer')
  return <CustomerProof initial={view} token={token} />
}
