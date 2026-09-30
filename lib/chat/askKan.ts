/**
 * "Ask Kan" after the fact.
 *
 * Kan replies when a message is addressed to him, and it's easy to forget the @kan.
 * Rather than making you retype it, your latest message offers to be sent to him.
 *
 * Only ever on the last message in the thread, only when you wrote it, and only when
 * Kan hasn't answered it — his own messages, other people's, and anything older never
 * offer it. Once anyone posts after it, it's gone.
 */

interface ThreadMessageLike {
  id: string;
  type: string;
  content?: string;
  authorId?: string;
  imageUrls?: string[];
  whiteboards?: unknown[];
  shroomRunId?: string;
}

export function messageToAskKanAbout<T extends ThreadMessageLike>(
  messages: readonly T[],
  userId: string | null | undefined
): T | null {
  const last = messages[messages.length - 1];
  if (!last) return null;
  // A question with no reply after it is one Kan never answered — worth offering again.
  if (last.type !== 'note' && last.type !== 'question') return null;
  if (last.shroomRunId) return null;
  // Your own message. A message with no author was written on this device before
  // sign-in, which is only ever you.
  if (last.authorId && last.authorId !== userId) return null;
  const hasSomething = !!last.content?.trim() || !!last.imageUrls?.length || !!last.whiteboards?.length;
  return hasSomething ? last : null;
}

/** The API's answer when this month's included AI requests are used up. */
export const USAGE_LIMIT_CODE = 'USAGE_LIMIT_REACHED';
