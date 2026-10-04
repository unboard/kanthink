import { Studio } from '@/components/print/Studio'

export default async function PrintDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Studio id={id} />
}
