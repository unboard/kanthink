/**
 * The Kan agent's stream, one JSON object per line. Shared by the route that
 * writes it and the page that reads it.
 */

export type AgentEvent =
  /** A trace line starting, or the same id finishing (later fields win). */
  | {
      t: 'step'
      id: string
      label?: string
      status: 'running' | 'done' | 'error'
      kind?: 'thinking'
      detail?: string
      href?: string
      /** It changed something the user owns. */
      write?: boolean
      sources?: { title: string; url: string }[]
    }
  | { t: 'thinking'; id: string; delta: string }
  | { t: 'text'; delta: string }
  /** A new model round began; text after it is a new paragraph. */
  | { t: 'break' }
  | { t: 'suggest'; options: { label: string; prompt: string }[] }
  /** What this turn did, for the next turn's history. */
  | { t: 'done'; memo?: string; cardIds?: string[] }
  | { t: 'error'; message: string }

const PAST: Record<string, string> = {
  Searching: 'Searched', Reading: 'Read', Opening: 'Opened', Checking: 'Checked', Asking: 'Asked',
  Looking: 'Looked', Making: 'Made', Adding: 'Added', Marking: 'Marked', Editing: 'Edited',
  Moving: 'Moved', Archiving: 'Archived', Bringing: 'Brought', Setting: 'Set', Starting: 'Started',
  Updating: 'Updated', Building: 'Built', Handing: 'Handed', Putting: 'Put', Dropping: 'Dropped',
  Shipping: 'Shipped', Lining: 'Lined', Writing: 'Wrote',
}

/** "Searching Work for “deploy”" → "Searched Work for “deploy”". */
export function pastTense(label: string): string {
  const [first, ...rest] = label.split(' ')
  const past = PAST[first]
  return past ? [past, ...rest].join(' ') : label
}
