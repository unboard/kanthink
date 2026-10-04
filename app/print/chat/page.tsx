import { ChatStudio } from '@/components/print/ChatStudio'

export const metadata = { title: 'Chat with Kan · Print studio' }

export default async function PrintChatPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  return <ChatStudio initialId={typeof d === 'string' && d ? d : null} />
}
