import { fredoka } from '@/app/fonts'
import { EasyMaker } from '@/components/print/EasyMaker'

export const metadata = { title: 'Easy maker · Print studio' }

export default async function PrintEasyPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  return (
    <div className={`${fredoka.variable} h-full`}>
      <EasyMaker initialId={typeof d === 'string' && d ? d : null} />
    </div>
  )
}
