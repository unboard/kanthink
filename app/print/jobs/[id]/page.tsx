import { PrinterJob } from '@/components/proof/PrinterJob'

export default async function PrintJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Keyed, so moving between jobs in an order starts each page fresh.
  return <PrinterJob key={id} id={id} />
}
