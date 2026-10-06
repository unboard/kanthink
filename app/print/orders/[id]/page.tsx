import { PrinterOrder } from '@/components/proof/PrinterOrder'

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <PrinterOrder id={id} />
}
