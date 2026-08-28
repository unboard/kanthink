'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, ExternalLink, RotateCcw } from 'lucide-react';

import { useStore } from '@/lib/store';
import type { Card as KCard, Channel } from '@/lib/types';

/**
 * THE LIBRARY — spines all the way down.
 *
 * The Spine prototype folded columns. The obvious next question was whether the
 * fold nests: folders fold to spines, a folder opens into channel spines, a
 * channel opens into column spines, and only at the bottom does anything become
 * a list you read. Shelf, book, chapter, page.
 *
 * It does nest, and the nesting buys something a board cannot have. On a board,
 * the whole hierarchy above the card is chrome — a sidebar, a title, a
 * breadcrumb — and none of it is a place you can put a card. Here every level is
 * a spine, and every spine is a drop target. Pick a card and the entire library
 * becomes destinations: a column spine moves it within the channel, a channel
 * spine moves it to another channel entirely. Cross-board moves stop being a
 * menu buried in a card and become the same gesture as everything else.
 *
 * This one runs on the real account. The store is already the live board — the
 * same one /channel renders — so these are actual folders, actual cards, and a
 * move here is a real move that syncs. Nothing is mocked. It is a different
 * front end on the board you already have, which is the only way to find out
 * whether the idea survives contact with a board that is genuinely full.
 */

type Naming = 'library' | 'plain';

const WORDS = {
  library: {
    shelf: 'Shelf', book: 'Book', chapter: 'Chapter', page: 'Page',
    shelves: 'Shelves', books: 'Books', chapters: 'Chapters', pages: 'pages', root: 'Library',
  },
  plain: {
    shelf: 'Folder', book: 'Channel', chapter: 'Column', page: 'Card',
    shelves: 'Folders', books: 'Channels', chapters: 'Columns', pages: 'cards', root: 'Board',
  },
} as const;

/** Ideal spine width per level. Deeper levels get more room — you are closer to them. */
const IDEAL_W = { shelf: 36, book: 46, chapter: 56 };
/** Type size follows the same ramp, so depth reads before you read any word. */
const LABEL_SIZE = { shelf: 11, book: 12, chapter: 13 };
const MIN_W = 13;
const LABEL_AT = 27;
const PANEL_MIN = 360;
/** Breathing room between levels. Without it three levels read as one long rail. */
const GROUP_GAP = 7;

const LOOSE = '__loose';

type Shelf = { id: string; name: string; channelIds: string[] };

/** Which shelf, book and chapter are open. Any level may be null. */
type Sel = { shelf: string | null; book: string | null; chapter: string | null };

function daysSince(iso?: string) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function ageLabel(days: number) {
  if (days === 0) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

/** First readable thing a card has to say, for the expanded row. */
function blurb(card: KCard): string | null {
  if (card.summary?.trim()) return card.summary.trim();
  const msg = card.messages?.find((m) => m.content?.trim());
  return msg ? msg.content.trim().slice(0, 400) : null;
}

export default function LibraryPage() {
  // Live board. Only stable slices are selected — zustand v5 loops on derived objects.
  const folders = useStore((s) => s.folders);
  const folderOrder = useStore((s) => s.folderOrder);
  const channels = useStore((s) => s.channels);
  const channelOrder = useStore((s) => s.channelOrder);
  const cards = useStore((s) => s.cards);
  const hasHydrated = useStore((s) => s._hasHydrated);
  const moveCard = useStore((s) => s.moveCard);
  const moveCardToChannel = useStore((s) => s.moveCardToChannel);

  const [naming, setNaming] = useState<Naming>('library');
  const W = WORDS[naming];

  // One selection object rather than three, so every level always moves together
  // and an incoherent pair (a book that is not on the open shelf) is impossible.
  // `null` means "untouched" — the fallback below opens something real instead.
  const [sel, setSel] = useState<Sel | null>(null);

  const [picked, setPicked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ cardId: string; channelId: string; columnId: string } | null>(null);
  const [undo, setUndo] = useState<{ cardId: string; columnId: string; index: number; title: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const say = (m: string) => {
    setNote(m);
    setTimeout(() => setNote((n) => (n === m ? null : n)), 3200);
  };

  // ---- the tree -----------------------------------------------------------

  const shelves: Shelf[] = useMemo(() => {
    const ids = folderOrder.length ? folderOrder : Object.keys(folders);
    const list: Shelf[] = ids
      .map((id) => folders[id])
      .filter(Boolean)
      .map((f) => ({ id: f.id, name: f.name, channelIds: f.channelIds.filter((c) => channels[c]) }));

    const loose = channelOrder.filter((c) => channels[c]);
    if (loose.length) list.push({ id: LOOSE, name: naming === 'library' ? 'Loose pages' : 'Unfiled', channelIds: loose });
    return list.filter((s) => s.channelIds.length > 0);
  }, [folders, folderOrder, channels, channelOrder, naming]);

  // Where to land before anyone has clicked anything: the first shelf, its first
  // book, and the first chapter that actually has something in it.
  const fallback: Sel = useMemo(() => {
    const s = shelves[0];
    if (!s) return { shelf: null, book: null, chapter: null };
    const b = channels[s.channelIds[0]];
    if (!b) return { shelf: s.id, book: null, chapter: null };
    const c = b.columns.find((col) => col.cardIds.length > 0) ?? b.columns[0];
    return { shelf: s.id, book: b.id, chapter: c?.id ?? null };
  }, [shelves, channels]);

  const cur = sel ?? fallback;

  // Each level is only honoured if its parent still contains it. Derived, not
  // synced — nothing here can drift out of step with the board underneath.
  const shelfId = cur.shelf;
  const shelf = shelves.find((s) => s.id === shelfId) ?? null;

  const books: Channel[] = useMemo(
    () => (shelf ? shelf.channelIds.map((id) => channels[id]).filter(Boolean) : []),
    [shelf, channels]
  );

  const bookId = shelf && cur.book && shelf.channelIds.includes(cur.book) ? cur.book : null;
  const book = bookId ? channels[bookId] : null;
  const chapters = book?.columns ?? [];
  const chapterId = book && cur.chapter && chapters.some((c) => c.id === cur.chapter) ? cur.chapter : null;
  const chapter = chapters.find((c) => c.id === chapterId) ?? null;

  const pageList: KCard[] = useMemo(
    () => (chapter ? chapter.cardIds.map((id) => cards[id]).filter(Boolean) : []),
    [chapter, cards]
  );

  const countIn = (ch: Channel) => ch.columns.reduce((n, c) => n + c.cardIds.length, 0);
  const countShelf = (s: Shelf) => s.channelIds.reduce((n, id) => n + (channels[id] ? countIn(channels[id]) : 0), 0);

  // ---- moving -------------------------------------------------------------

  const pickedCard = picked ? cards[picked] : null;

  const moveWithin = (cardId: string, toColumnId: string) => {
    const card = cards[cardId];
    const ch = card ? channels[card.channelId] : null;
    const from = ch?.columns.find((c) => c.cardIds.includes(cardId));
    if (!card || !from) return;
    setUndo({ cardId, columnId: from.id, index: from.cardIds.indexOf(cardId), title: card.title });
    moveCard(cardId, toColumnId, 0);
    setPicked(null);
    const toName = ch?.columns.find((c) => c.id === toColumnId)?.name ?? '';
    say(`Moved to ${toName}.`);
  };

  /** Cross-channel is a heavier move — it rewrites the card — so it asks first. */
  const moveAcross = () => {
    if (!confirm) return;
    const target = channels[confirm.channelId];
    const created = moveCardToChannel(confirm.cardId, confirm.channelId, confirm.columnId);
    setConfirm(null);
    setPicked(null);
    setUndo(null);
    if (created) {
      setSel({
        shelf: shelves.find((s) => s.channelIds.includes(confirm.channelId))?.id ?? shelfId,
        book: confirm.channelId,
        chapter: confirm.columnId,
      });
      say(`Moved into ${target?.name ?? W.book.toLowerCase()}.`);
    }
  };

  const runUndo = () => {
    if (!undo) return;
    moveCard(undo.cardId, undo.columnId, Math.max(0, undo.index));
    setUndo(null);
    say('Put back.');
  };

  /** A spine was hit. With a card in hand it is a destination; otherwise navigation. */
  const hitShelf = (id: string) => {
    // Hitting the open shelf again folds it — the only way back to the overview.
    const collapse = shelfId === id && !picked;
    setSel({ shelf: collapse ? null : id, book: null, chapter: null });
  };

  const hitBook = (id: string) => {
    if (picked && pickedCard && pickedCard.channelId !== id) {
      const first = channels[id]?.columns[0];
      if (first) setConfirm({ cardId: picked, channelId: id, columnId: first.id });
      return;
    }
    const collapse = bookId === id && !picked;
    setSel({ shelf: shelfId, book: collapse ? null : id, chapter: null });
  };

  const hitChapter = (id: string) => {
    if (picked && pickedCard && book) {
      if (pickedCard.channelId === book.id) moveWithin(picked, id);
      else setConfirm({ cardId: picked, channelId: book.id, columnId: id });
      return;
    }
    setSel({ shelf: shelfId, book: bookId, chapter: chapterId === id ? null : id });
  };

  /** Mobile back — one level at a time. */
  const stepUp = () => {
    if (chapterId) setSel({ shelf: shelfId, book: bookId, chapter: null });
    else if (bookId) setSel({ shelf: shelfId, book: null, chapter: null });
    else setSel({ shelf: null, book: null, chapter: null });
  };

  // ---- spine widths -------------------------------------------------------

  const railRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(1200);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    setAvail(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const widths = useMemo(() => {
    const levels: { kind: keyof typeof IDEAL_W; n: number }[] = [{ kind: 'shelf', n: shelves.length }];
    if (shelf) levels.push({ kind: 'book', n: books.length });
    if (book) levels.push({ kind: 'chapter', n: chapters.length });

    const ideal = levels.reduce((s, l) => s + l.n * IDEAL_W[l.kind], 0);
    const budget = Math.max(140, avail - PANEL_MIN - (levels.length - 1) * GROUP_GAP);
    const k = ideal > budget ? budget / ideal : 1;

    return {
      shelf: Math.max(MIN_W, IDEAL_W.shelf * k),
      book: Math.max(MIN_W, IDEAL_W.book * k),
      chapter: Math.max(MIN_W, IDEAL_W.chapter * k),
    };
  }, [shelves.length, books.length, chapters.length, shelf, book, avail]);

  // ---- render -------------------------------------------------------------

  if (!hasHydrated) {
    return <Shell><p className="p-10 text-sm text-white/35">Opening the library…</p></Shell>;
  }

  if (shelves.length === 0) {
    return (
      <Shell>
        <div className="p-10">
          <p className="text-sm text-white/45">
            Nothing on the shelves — this account has no channels loaded on this device yet.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-violet-400 hover:underline">Go to the board</Link>
        </div>
      </Shell>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0c0c0c] text-neutral-100">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-4 border-b border-white/[0.07] px-4 py-2.5 sm:px-6">
        <Link href="/prototypes" className="shrink-0 text-white/35 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">The Library</span>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded border border-white/10 p-0.5">
          {(['library', 'plain'] as Naming[]).map((n) => (
            <button
              key={n}
              onClick={() => setNaming(n)}
              className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                naming === n ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/70'
              }`}
            >
              <span className="hidden sm:inline">
                {n === 'library' ? 'Shelf/Book/Chapter' : 'Folder/Channel/Column'}
              </span>
              <span className="sm:hidden">{n === 'library' ? 'Library' : 'Plain'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ============================ DESKTOP ============================ */}
      <div ref={railRef} className="hidden min-h-0 flex-1 md:flex" style={{ gap: GROUP_GAP }}>
        {/* Shelves */}
        <Group label={W.shelves} width={shelves.length * widths.shelf}>
          {shelves.map((s) => (
            <SpineBtn
              key={s.id}
              w={widths.shelf}
              level="shelf"
              label={s.name}
              count={countShelf(s)}
              active={s.id === shelfId}
              dim={Boolean(picked)}
              onClick={() => hitShelf(s.id)}
            />
          ))}
        </Group>

        {/* Books in the open shelf */}
        {shelf && (
          <Group label={W.books} width={books.length * widths.book}>
            {books.map((b) => (
              <SpineBtn
                key={b.id}
                w={widths.book}
                level="book"
                label={b.name}
                count={countIn(b)}
                active={b.id === bookId}
                target={Boolean(picked) && pickedCard?.channelId !== b.id}
                onClick={() => hitBook(b.id)}
              />
            ))}
          </Group>
        )}

        {/* Chapters in the open book */}
        {book && (
          <Group label={W.chapters} width={chapters.length * widths.chapter}>
            {chapters.map((c) => (
              <SpineBtn
                key={c.id}
                w={widths.chapter}
                level="chapter"
                label={c.name}
                count={c.cardIds.length}
                active={c.id === chapterId}
                // The column it already sits in is not somewhere to move it to.
                target={Boolean(picked) && !c.cardIds.includes(picked!)}
                onClick={() => hitChapter(c.id)}
              />
            ))}
          </Group>
        )}

        {/* The only thing that is ever a list */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Panel
            W={W}
            shelves={shelves}
            shelf={shelf}
            books={books}
            book={book}
            chapter={chapter}
            pages={pageList}
            picked={picked}
            expanded={expanded}
            countIn={countIn}
            countShelf={countShelf}
            onPick={(id) => {
              setPicked(picked === id ? null : id);
              setExpanded(null);
            }}
            onExpand={(id) => setExpanded(expanded === id ? null : id)}
            onShelf={hitShelf}
            onBook={hitBook}
            onChapter={hitChapter}
          />
          <StatusBar
            W={W}
            picked={pickedCard}
            note={note}
            undo={undo}
            onUndo={runUndo}
            onClear={() => setPicked(null)}
          />
        </div>
      </div>

      {/* ============================ MOBILE ============================= */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <MobileDrill
          W={W}
          shelves={shelves}
          shelf={shelf}
          books={books}
          book={book}
          chapter={chapter}
          pages={pageList}
          picked={picked}
          expanded={expanded}
          countIn={countIn}
          countShelf={countShelf}
          onPick={(id) => setPicked(picked === id ? null : id)}
          onExpand={(id) => setExpanded(expanded === id ? null : id)}
          onShelf={hitShelf}
          onBook={hitBook}
          onChapter={hitChapter}
          onUp={stepUp}
        />
        <StatusBar W={W} picked={pickedCard} note={note} undo={undo} onUndo={runUndo} onClear={() => setPicked(null)} />
      </div>

      {/* Cross-channel moves rewrite the card, so they ask. */}
      {confirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-md rounded-lg border border-white/12 bg-[#141414] p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              Move between {W.book.toLowerCase()}s
            </p>
            <p className="mt-3 text-lg font-light leading-snug text-white">
              Move “{cards[confirm.cardId]?.title}” into{' '}
              <span className="text-violet-300">{channels[confirm.channelId]?.name}</span>
              {' · '}
              <span className="text-violet-300">
                {channels[confirm.channelId]?.columns.find((c) => c.id === confirm.columnId)?.name}
              </span>
              ?
            </p>
            <p className="mt-3 text-sm font-light text-white/40">
              This is a real move on your board. The card keeps its thread and tasks but gets a new id, so it
              cannot be undone from here.
            </p>
            <div className="mt-6 flex gap-2">
              <button
                onClick={moveAcross}
                className="rounded-md border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm text-violet-200 transition-colors hover:bg-violet-500/20"
              >
                Move it
              </button>
              <button
                onClick={() => setConfirm(null)}
                className="rounded-md border border-white/12 px-4 py-2 text-sm text-white/55 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full bg-[#0c0c0c] text-neutral-100">
      <div className="border-b border-white/[0.07] px-6 py-2.5">
        <Link href="/prototypes" className="text-white/35 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      {children}
    </div>
  );
}

/**
 * One level of the rail, captioned. Without the caption three stacks of spines
 * read as one long undifferentiated rail and the hierarchy disappears.
 */
function Group({ label, width, children }: { label: string; width: number; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col" style={{ width }}>
      <div className="flex h-6 shrink-0 items-center justify-center overflow-hidden border-b border-white/[0.09] px-1">
        <span className="truncate font-mono text-[8px] uppercase tracking-[0.18em] text-white/25">{label}</span>
      </div>
      <div className="flex min-h-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * One spine. Wide enough, it carries a count and a rotated name; squeezed down it
 * becomes a sliver that still holds its place and still takes a drop.
 */
function SpineBtn({
  w,
  level,
  label,
  count,
  active,
  target,
  dim,
  onClick,
}: {
  w: number;
  level: keyof typeof LABEL_SIZE;
  label: string;
  count: number;
  active?: boolean;
  target?: boolean;
  dim?: boolean;
  onClick: () => void;
}) {
  const showLabel = w >= LABEL_AT;
  return (
    <button
      onClick={onClick}
      title={`${label} · ${count}`}
      style={{ width: w }}
      className={`group relative shrink-0 border-r border-white/[0.05] transition-colors last:border-r-0 ${
        active ? 'bg-white/[0.06]' : target ? 'hover:bg-violet-500/[0.12]' : 'hover:bg-white/[0.035]'
      } ${dim && !target && !active ? 'opacity-45' : ''}`}
    >
      {active && <span className="absolute inset-x-0 top-0 h-px bg-violet-400" />}

      {showLabel ? (
        <>
          <span
            className={`absolute inset-x-0 top-4 text-center font-mono text-[9px] tabular-nums ${
              active ? 'text-violet-300/80' : 'text-white/25'
            }`}
          >
            {count}
          </span>
          <span
            className={`absolute bottom-5 left-1/2 max-h-[calc(100%-4rem)] overflow-hidden whitespace-nowrap tracking-[0.1em] transition-colors ${
              target
                ? 'text-violet-300/85'
                : active
                  ? 'text-white'
                  : 'text-white/40 group-hover:text-white/85'
            }`}
            style={{
              writingMode: 'vertical-rl',
              transform: 'translateX(-50%) rotate(180deg)',
              fontSize: LABEL_SIZE[level],
            }}
          >
            {label}
          </span>
        </>
      ) : (
        <span
          className={`absolute inset-y-6 left-1/2 w-px -translate-x-1/2 ${
            active ? 'bg-violet-400/70' : target ? 'bg-violet-400/30' : 'bg-white/15'
          }`}
        />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------------ */

type PanelProps = {
  W: (typeof WORDS)[Naming];
  shelves: Shelf[];
  shelf: Shelf | null;
  books: Channel[];
  book: Channel | null;
  chapter: Channel['columns'][number] | null;
  pages: KCard[];
  picked: string | null;
  expanded: string | null;
  countIn: (c: Channel) => number;
  countShelf: (s: Shelf) => number;
  onPick: (id: string) => void;
  onExpand: (id: string) => void;
  onShelf: (id: string) => void;
  onBook: (id: string) => void;
  onChapter: (id: string) => void;
};

/**
 * The panel always shows the deepest thing that is open, so the four states read
 * as one continuous zoom rather than four screens.
 */
function Panel(p: PanelProps) {
  if (p.chapter && p.book) return <Pages {...p} />;
  if (p.book) return <FrontMatter {...p} />;
  if (p.shelf) return <ShelfView {...p} />;
  return <LibraryView {...p} />;
}

function Head({ eyebrow, title, meta }: { eyebrow: string; title: string; meta?: string }) {
  return (
    <header className="shrink-0 px-6 pt-8 sm:px-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-light leading-tight tracking-tight text-white sm:text-4xl">{title}</h2>
      {meta && <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/25">{meta}</p>}
    </header>
  );
}

/** A numbered row — the shape everything in here collapses to. */
function Row({
  n,
  title,
  right,
  size = 'md',
  tone = 'default',
  onClick,
  children,
}: {
  n: number;
  title: string;
  right?: string;
  size?: 'md' | 'lg';
  tone?: 'default' | 'picked';
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="group flex w-full items-baseline gap-4 border-b border-white/[0.05] py-3 text-left sm:gap-6"
      >
        <span
          className={`w-6 shrink-0 font-mono text-[10px] tabular-nums ${
            tone === 'picked' ? 'text-violet-400' : 'text-white/20'
          }`}
        >
          {String(n).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-light tracking-tight transition-colors ${
              size === 'lg' ? 'text-xl sm:text-2xl' : 'text-lg'
            } ${tone === 'picked' ? 'text-violet-200' : 'text-white/85 group-hover:text-white'}`}
          >
            {title}
          </span>
          {children}
        </span>
        {right && <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/20">{right}</span>}
      </button>
    </li>
  );
}

function LibraryView(p: PanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head eyebrow={p.W.root} title="Everything" meta={`${p.shelves.length} ${p.W.shelf.toLowerCase()}s`} />
      <ul className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6 sm:px-10">
        {p.shelves.map((s, i) => (
          <Row key={s.id} n={i + 1} title={s.name} size="lg" right={String(p.countShelf(s))} onClick={() => p.onShelf(s.id)} />
        ))}
      </ul>
    </div>
  );
}

function ShelfView(p: PanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head
        eyebrow={p.W.shelf}
        title={p.shelf!.name}
        meta={`${p.books.length} ${p.W.book.toLowerCase()}s · ${p.countShelf(p.shelf!)} ${p.W.pages}`}
      />
      <ul className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6 sm:px-10">
        {p.books.map((b, i) => (
          <Row key={b.id} n={i + 1} title={b.name} size="lg" right={String(p.countIn(b))} onClick={() => p.onBook(b.id)}>
            {b.description && <span className="mt-1 block truncate text-sm text-white/35">{b.description}</span>}
          </Row>
        ))}
      </ul>
    </div>
  );
}

function FrontMatter(p: PanelProps) {
  const b = p.book!;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head eyebrow={p.W.book} title={b.name} meta={`${b.columns.length} ${p.W.chapter.toLowerCase()}s · ${p.countIn(b)} ${p.W.pages}`} />
      {b.description && (
        <p className="shrink-0 px-6 pt-4 text-base font-light leading-relaxed text-white/45 sm:px-10">{b.description}</p>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-6 sm:px-10">
        {b.columns.map((c, i) => (
          <Row key={c.id} n={i + 1} title={c.name} right={String(c.cardIds.length)} onClick={() => p.onChapter(c.id)}>
            {c.instructions && <span className="mt-1 block truncate text-sm text-white/30">{c.instructions}</span>}
          </Row>
        ))}
      </ul>
      <div className="shrink-0 px-6 pb-5 sm:px-10">
        <Link
          href={`/channel/${b.id}`}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 transition-colors hover:text-white"
        >
          Open as a board <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function Pages(p: PanelProps) {
  const c = p.chapter!;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head eyebrow={`${p.W.book} · ${p.book!.name}`} title={c.name} meta={`${p.pages.length} ${p.W.pages}`} />

      <p className="shrink-0 px-6 pt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/25 sm:px-10">
        {p.picked ? 'Now hit a spine to move it' : `Tap a ${p.W.page.toLowerCase()} to pick it up · tap the age to read it`}
      </p>

      <ul className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-4 sm:px-10">
        {p.pages.map((card, i) => {
          const isPicked = card.id === p.picked;
          const isOpen = card.id === p.expanded;
          const text = isOpen ? blurb(card) : null;
          return (
            <li key={card.id}>
              <div className="flex items-baseline gap-4 border-b border-white/[0.05] py-3 sm:gap-6">
                <button
                  onClick={() => p.onPick(card.id)}
                  className="flex min-w-0 flex-1 items-baseline gap-4 text-left sm:gap-6"
                >
                  <span
                    className={`w-6 shrink-0 font-mono text-[10px] tabular-nums ${
                      isPicked ? 'text-violet-400' : 'text-white/20'
                    }`}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-lg font-light tracking-tight transition-colors sm:text-xl ${
                        isPicked ? 'text-violet-200' : 'text-white/85 hover:text-white'
                      }`}
                    >
                      {card.title}
                    </span>
                    {card.tags && card.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {card.tags.slice(0, 4).map((t) => (
                          <span key={t} className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/25">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>

                <button
                  onClick={() => p.onExpand(card.id)}
                  className={`shrink-0 font-mono text-[10px] tabular-nums transition-colors ${
                    isOpen ? 'text-white/70' : 'text-white/20 hover:text-white/60'
                  }`}
                >
                  {ageLabel(daysSince(card.updatedAt))}
                </button>
              </div>

              {isOpen && (
                <div className="border-b border-white/[0.05] px-10 pb-5 sm:px-[4.5rem]">
                  <p className="whitespace-pre-wrap text-sm font-light leading-relaxed text-white/50">
                    {text ?? 'Nothing written on this one yet.'}
                  </p>
                  <Link
                    href={`/channel/${card.channelId}/card/${card.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 transition-colors hover:text-white"
                  >
                    Open the card <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </li>
          );
        })}

        {p.pages.length === 0 && (
          <li className="py-10 text-lg font-light text-white/25">
            Empty {p.W.chapter.toLowerCase()}.
          </li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function StatusBar({
  W,
  picked,
  note,
  undo,
  onUndo,
  onClear,
}: {
  W: (typeof WORDS)[Naming];
  picked: KCard | null;
  note: string | null;
  undo: { title: string } | null;
  onUndo: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-t border-white/[0.07] px-4 sm:px-10">
      {picked ? (
        <>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-violet-300">In hand</span>
          <span className="min-w-0 flex-1 truncate text-sm font-light text-white/70">{picked.title}</span>
          <button onClick={onClear} className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30 hover:text-white">
            Put down
          </button>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
          {note ?? (
            <>
              <span className="hidden sm:inline">
                Your real board · every spine is a place a {W.page.toLowerCase()} can go
              </span>
              <span className="sm:hidden">Your real board</span>
            </>
          )}
        </span>
      )}

      {undo && !picked && (
        <button
          onClick={onUndo}
          className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white"
        >
          <RotateCcw className="h-3 w-3" /> Undo
        </button>
      )}
    </div>
  );
}

/**
 * On a phone the spines would eat the screen, so the same tree becomes a
 * drill-down — which is the reference's own BACK affordance, one level at a time.
 */
function MobileDrill(p: PanelProps & { onUp: () => void }) {
  const level = p.chapter ? 'pages' : p.book ? 'chapters' : p.shelf ? 'books' : 'shelves';
  const crumbs = [p.shelf?.name, p.book?.name, p.chapter?.name].filter(Boolean) as string[];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {level !== 'shelves' && (
        <button
          onClick={p.onUp}
          className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-2.5 text-left"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            {crumbs.join(' / ')}
          </span>
        </button>
      )}

      {level === 'shelves' && (
        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {p.shelves.map((s, i) => (
            <Row key={s.id} n={i + 1} title={s.name} size="lg" right={String(p.countShelf(s))} onClick={() => p.onShelf(s.id)} />
          ))}
        </ul>
      )}

      {level === 'books' && (
        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {p.books.map((b, i) => (
            <Row key={b.id} n={i + 1} title={b.name} size="lg" right={String(p.countIn(b))} onClick={() => p.onBook(b.id)} />
          ))}
        </ul>
      )}

      {level === 'chapters' && (
        <ul className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {p.book!.columns.map((c, i) => (
            <Row
              key={c.id}
              n={i + 1}
              title={c.name}
              size="lg"
              right={String(c.cardIds.length)}
              tone={p.picked ? 'picked' : 'default'}
              onClick={() => p.onChapter(c.id)}
            />
          ))}
          {p.picked && (
            <li className="pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-violet-300/70">
              Pick a {p.W.chapter.toLowerCase()} to drop it in
            </li>
          )}
        </ul>
      )}

      {level === 'pages' && (
        <>
          <div className="shrink-0 px-4 pt-4">
            <h2 className="text-2xl font-light tracking-tight text-white">{p.chapter!.name}</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/25">
              {p.pages.length} {p.W.pages}
            </p>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
            {p.pages.map((card, i) => (
              <Row
                key={card.id}
                n={i + 1}
                title={card.title}
                right={ageLabel(daysSince(card.updatedAt))}
                tone={card.id === p.picked ? 'picked' : 'default'}
                onClick={() => p.onPick(card.id)}
              />
            ))}
          </ul>
          {p.picked && (
            <button
              onClick={p.onUp}
              className="flex shrink-0 items-center justify-center gap-2 border-t border-violet-400/25 bg-violet-500/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-violet-200"
            >
              Choose where it goes <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
