'use client';

import type { ReactElement } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

/**
 * Five answers to one question: does Kan reply to this message or not?
 *
 * First principles, because the last two rounds were decoration. The intent is
 * almost always already in the words — "what should I do about pricing?" is a
 * question, "£42, booked" is a note. A mode control asks you to state it a
 * second time, before you've written it, somewhere your eyes aren't. That's why
 * it gets missed, and no amount of switch personality fixes it.
 *
 * So: the decision belongs after the writing, not before. It belongs where the
 * attention already is — the field and the send action. And it should show up
 * when you engage, not sit there permanently.
 *
 * The + menu in every mock is the other half: moving upload and whiteboard in
 * there clears the row these need.
 */

export interface IntentProps {
  focused: boolean;
  text: string;
  /** Whether Kan is currently set to reply. */
  asking: boolean;
  setAsking: (asking: boolean) => void;
  onSend: (asking: boolean) => void;
}

export interface IntentApproach {
  id: string;
  name: string;
  principle: string;
  note: string;
  /** Sits inside the field, before what you typed. */
  Inline?: (p: IntentProps) => ReactElement | null;
  /** Sits to the right of the field, where send lives. */
  Trailing?: (p: IntentProps) => ReactElement | null;
  /** Sits under the field. */
  Footer?: (p: IntentProps) => ReactElement | null;
  /** Replaces the default send button entirely. */
  ownsSend?: boolean;
}

/** Does this read like something addressed to Kan? */
export function readsAsAQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.includes('@kan')) return true;
  if (t.endsWith('?')) return true;
  return /^(what|why|how|when|who|which|where|can you|could you|should i|do i|is there|summarise|summarize|draft|write|find|explain|compare|suggest|help)\b/.test(t);
}

function SendArrow({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-5 w-5 ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

/* 1 ---------------------------------------------------------------- */

function TwoDoorsTrailing({ text, onSend }: IntentProps) {
  const ready = text.trim().length > 0;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Save as a note"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(false)}
        disabled={!ready}
        className={`flex h-[26px] items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors ${
          ready ? 'text-neutral-200 hover:bg-neutral-700' : 'cursor-not-allowed text-neutral-600'
        }`}
      >
        Save
      </button>
      <button
        type="button"
        title="Ask Kan — he'll reply in the thread"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(true)}
        disabled={!ready}
        className={`flex h-[26px] items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors ${
          ready
            ? 'bg-violet-600 text-white hover:bg-violet-500'
            : 'cursor-not-allowed bg-neutral-800 text-neutral-600'
        }`}
      >
        <KanthinkIcon size={12} />
        Ask Kan
      </button>
    </div>
  );
}

/* 2 ---------------------------------------------------------------- */

function ItReadsInline({ text, asking }: IntentProps) {
  const guessed = readsAsAQuestion(text);
  const on = asking || guessed;
  if (!text.trim()) return null;
  return (
    <span
      className={`kn-fade mr-1.5 inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-[1px] text-[10px] font-medium ${
        on ? 'bg-violet-500/20 text-violet-300' : 'bg-neutral-700 text-neutral-400'
      }`}
    >
      <KanthinkIcon size={9} />
      {on ? 'Kan replies' : 'note'}
    </span>
  );
}

function ItReadsFooter({ text, asking, setAsking }: IntentProps) {
  const guessed = readsAsAQuestion(text);
  const on = asking || guessed;
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setAsking(!on)}
      className="kn-fade text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
    >
      {on ? 'Keep it a note instead' : 'Have Kan reply to this'}
    </button>
  );
}

/* 3 ---------------------------------------------------------------- */

function MentionFooter({ focused, text }: IntentProps) {
  if (!focused && !text) return null;
  const has = text.toLowerCase().includes('@kan');
  return (
    <span className="kn-fade text-[11px] text-neutral-500">
      {has ? (
        <span className="text-violet-300">Kan will reply — he&rsquo;s in this message</span>
      ) : (
        <>
          Type <span className="rounded bg-neutral-700 px-1 font-mono text-violet-300">@kan</span> to
          bring him in
        </>
      )}
    </span>
  );
}

/* 4 ---------------------------------------------------------------- */

function ForkFooter({ focused, text, asking, setAsking }: IntentProps) {
  if (!focused && !text.trim()) return null;
  return (
    <div className="kn-grow flex w-full gap-1.5 overflow-hidden">
      {[
        { on: false, label: 'Just note it', sub: 'Nobody replies' },
        { on: true, label: 'Ask Kan', sub: 'He answers below' },
      ].map((lane) => {
        const active = asking === lane.on;
        return (
          <button
            key={lane.label}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setAsking(lane.on)}
            className={`flex flex-1 items-center gap-1.5 rounded-lg border px-2 py-1 text-left transition-colors ${
              active
                ? lane.on
                  ? 'border-violet-400/60 bg-violet-500/15'
                  : 'border-neutral-500 bg-neutral-700/60'
                : 'border-neutral-700 opacity-70 hover:opacity-100'
            }`}
          >
            {lane.on && <KanthinkIcon size={12} className={active ? 'text-violet-300' : 'text-neutral-500'} />}
            <span className="min-w-0">
              <span
                className={`block truncate text-[11px] font-medium ${
                  active ? (lane.on ? 'text-violet-200' : 'text-neutral-100') : 'text-neutral-400'
                }`}
              >
                {lane.label}
              </span>
              <span className="block truncate text-[9px] text-neutral-500">{lane.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* 5 ---------------------------------------------------------------- */

function KeysFooter({ focused, text }: IntentProps) {
  if (!focused && !text.trim()) return null;
  return (
    <span className="kn-fade flex items-center gap-2 text-[10px] text-neutral-500">
      <span>
        <kbd className="rounded bg-neutral-700 px-1 py-[1px] font-mono text-neutral-300">Enter</kbd> saves
        a note
      </span>
      <span className="text-neutral-700">·</span>
      <span className="text-violet-300">
        <kbd className="rounded bg-violet-500/25 px-1 py-[1px] font-mono text-violet-200">⌘ Enter</kbd>{' '}
        asks Kan
      </span>
    </span>
  );
}

function KeysTrailing({ text, onSend }: IntentProps) {
  const ready = text.trim().length > 0;
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        title="Ask Kan (⌘ Enter)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(true)}
        disabled={!ready}
        className={`flex h-[26px] w-7 items-center justify-center rounded-md transition-colors ${
          ready ? 'text-violet-400 hover:bg-violet-500/15' : 'cursor-not-allowed text-neutral-700'
        }`}
      >
        <KanthinkIcon size={15} />
      </button>
      <button
        type="button"
        title="Save as a note (Enter)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(false)}
        disabled={!ready}
        className={`flex h-[26px] w-7 items-center justify-center rounded-md transition-colors ${
          ready ? 'text-neutral-200 hover:bg-neutral-700' : 'cursor-not-allowed text-neutral-700'
        }`}
      >
        <SendArrow />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export const APPROACHES: IntentApproach[] = [
  {
    id: 'two-doors',
    name: 'Two doors',
    principle: 'Decide on the way out, not on the way in',
    note: 'No mode at all. You write, then you choose which button ends it: Save, or Ask Kan. The decision happens at the moment you actually know the answer, in the place your hand is already going. Nothing to set beforehand and nothing to remember.',
    Trailing: TwoDoorsTrailing,
    ownsSend: true,
  },
  {
    id: 'it-reads',
    name: 'It reads what you wrote',
    principle: 'Stop asking for what you already said',
    note: 'The composer works out whether this is a question and tells you what it decided, in the field, as you type. Right almost every time — and when it is wrong, one word underneath flips it. Zero decisions in the common case.',
    Inline: ItReadsInline,
    Footer: ItReadsFooter,
  },
  {
    id: 'mention',
    name: 'Address it to him',
    principle: 'Kan is a person in the thread, not a setting',
    note: 'No control whatsoever. You bring Kan in the way you bring in a colleague — you mention him. The hint appears when the cursor lands and goes away once you know. Everyone who has used Slack already knows this rule, and it is the same rule on every surface.',
    Footer: MentionFooter,
  },
  {
    id: 'fork',
    name: 'The field forks',
    principle: 'Ask at the moment of engagement, then get out of the way',
    note: 'Empty and idle, the composer is one quiet line. Put the cursor in and it opens into two labelled lanes that say what each one does to the thread. Collapses again when you leave. The most explicit of the five — nothing is inferred and nothing is hidden.',
    Footer: ForkFooter,
  },
  {
    id: 'keys',
    name: 'Two ways to send',
    principle: 'The intent is in how you finish, and it can be taught once',
    note: 'Enter saves a note, ⌘Enter asks Kan — with the two keys spelled out under the field the moment you focus it, and two matching buttons for thumbs. Fastest possible for anyone who types, and the hint is the whole tutorial.',
    Trailing: KeysTrailing,
    Footer: KeysFooter,
    ownsSend: true,
  },
];
