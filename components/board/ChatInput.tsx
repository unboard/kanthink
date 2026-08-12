'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, useMemo, type ReactNode, type Ref } from 'react';
import type { CardMessageType, ChannelMember, Card as CardType } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useImageUpload } from '@/lib/hooks/useImageUpload';
import { LiveVoiceMode } from '@/components/voice/LiveVoiceMode';
import { AudioLines } from 'lucide-react';
import { MentionDropdown } from './MentionDropdown';
import { detectImageGenerationIntent } from '@/lib/ai/imageDetection';

// Keyword highlighting for question mode
const KEYWORD_CONFIG = {
  task: {
    keywords: ['task', 'tasks', 'action item', 'action items', 'todo', 'to-do'],
    tooltip: 'Kan can create tasks for you',
  },
  tag: {
    keywords: ['tag', 'tags', 'label', 'labels'],
    tooltip: 'Kan can add or remove tags',
  },
};

function buildKeywordRegex(): RegExp {
  const allKeywords = Object.values(KEYWORD_CONFIG).flatMap(c => c.keywords);
  const sorted = allKeywords.sort((a, b) => b.length - a.length);
  const pattern = sorted.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(${pattern})\\b`, 'gi');
}

const KEYWORD_REGEX = buildKeywordRegex();

function getTooltipForKeyword(keyword: string): string {
  const lowerKeyword = keyword.toLowerCase();
  for (const config of Object.values(KEYWORD_CONFIG)) {
    if (config.keywords.includes(lowerKeyword)) {
      return config.tooltip;
    }
  }
  return '';
}

type InputMode = 'note' | 'question';

const MAX_HEIGHT = 140;

/**
 * Kan answers when you address him, and not otherwise.
 *
 * There is no mode any more. Whether Kan replies is a property of the message —
 * it's true when his name is in it — which means the answer is in the words you
 * already wrote instead of in a control you had to find first. Typing @kan and
 * picking him out of the mention list are the same act, and both are undone by
 * deleting the text.
 */
const KAN_MENTION = /(^|\s)@kan\b/i;

/** Kan sits at the top of the @ list, in the same place every time. */
const KAN_MEMBER: ChannelMember = {
  id: 'kan',
  name: 'kan',
  email: 'Have Kan reply in this thread',
  image: null,
  role: 'kan',
};

// Hook to handle mobile keyboard visibility
// Returns the keyboard height so parent components can position inputs above it
export function useKeyboardOffset() {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;

    const handleResize = () => {
      // Always calculate offset when focused OR when there's a meaningful keyboard height
      // This handles cases where resize fires slightly before/after focus
      const offsetFromBottom = window.innerHeight - viewport.height - viewport.offsetTop;
      const offset = Math.max(0, offsetFromBottom);

      // Only update if we're focused OR if we need to reset
      if (isFocused || offset === 0) {
        setKeyboardOffset(offset);
      }
    };

    // Check immediately in case keyboard is already open
    handleResize();

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, [isFocused]);

  const onFocus = useCallback(() => {
    setIsFocused(true);
    // Re-check keyboard offset on focus
    if (window.visualViewport) {
      const viewport = window.visualViewport;
      const offsetFromBottom = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboardOffset(Math.max(0, offsetFromBottom));
    }
  }, []);

  const onBlur = useCallback(() => {
    // Small delay before resetting to handle focus transitions
    setTimeout(() => {
      setIsFocused(false);
      setKeyboardOffset(0);
    }, 100);
  }, []);

  return { keyboardOffset, isFocused, onFocus, onBlur };
}

interface StagedImage {
  url: string;
  isLoading?: boolean;
  file?: File;
}

interface MentionState {
  isActive: boolean;
  query: string;
  startIndex: number; // cursor position of the '@' or '#'
}

interface CardMentionState {
  isActive: boolean;
  query: string;
  startIndex: number; // cursor position of '#'
}

interface ImageSettings {
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  quality: 'standard' | 'hd';
}

export interface ChatInputHandle {
  /** Open the box and hand it the cursor. */
  focusInput: () => void;
  /** Put @kan in the message, which is the only way Kan gets involved. */
  mentionKan: () => void;
}

interface ChatInputProps {
  ref?: Ref<ChatInputHandle>;
  onSubmit: (content: string, type: CardMessageType, imageUrls?: string[], imageSettings?: ImageSettings) => void;
  isLoading?: boolean;
  placeholder?: string;
  cardId?: string;
  /** Channel this composer belongs to. Decides which data sources are mentionable. */
  channelId?: string;
  members?: ChannelMember[];
  // Optional keyboard handlers from parent - when provided, parent controls keyboard offset
  onKeyboardFocus?: () => void;
  onKeyboardBlur?: () => void;
  // Always ask Kan, and drop the @kan hint (for dedicated AI chat UIs)
  forceQuestionMode?: boolean;
  // Whiteboard support
  onOpenWhiteboard?: () => void;
  // Voice context for live voice mode
  voiceContext?: string;
}

export function ChatInput({ ref, onSubmit, isLoading = false, placeholder, cardId, channelId, members = [], onKeyboardFocus, onKeyboardBlur, forceQuestionMode = false, onOpenWhiteboard, voiceContext }: ChatInputProps) {
  const [content, setContent] = useState('');
  const [needsScroll, setNeedsScroll] = useState(false);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [inputActivated, setInputActivated] = useState(false);
  const [showLiveVoice, setShowLiveVoice] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [mention, setMention] = useState<MentionState>({ isActive: false, query: '', startIndex: 0 });
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionsMap, setMentionsMap] = useState<Record<string, string>>({}); // name -> userId
  const [cardMention, setCardMention] = useState<CardMentionState>({ isActive: false, query: '', startIndex: 0 });
  const [cardMentionSelectedIndex, setCardMentionSelectedIndex] = useState(0);
  const [cardMentionsMap, setCardMentionsMap] = useState<Record<string, string>>({}); // title -> cardId
  const [imageSettings, setImageSettings] = useState<ImageSettings>({ aspectRatio: '1:1', quality: 'standard' });
  const [showImageSettings, setShowImageSettings] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Data sources you can @ — only the ones this channel actually has. Offering
  // @mixpanel to a channel with no Mixpanel connected produced a question Kan
  // had no way to answer.
  const [connectedProviders, setConnectedProviders] = useState<string[] | null>(null);

  // Asked for the first time the @ list opens, not on every card you look at.
  useEffect(() => {
    if (!mention.isActive || !channelId || connectedProviders !== null) return;
    let cancelled = false;
    fetch(`/api/channels/${channelId}/data-sources`)
      .then((res) => (res.ok ? res.json() : { sources: [] }))
      .then((data) => {
        if (cancelled) return;
        const sources = (data.sources || []) as Array<{ provider: string }>;
        setConnectedProviders(sources.map((s) => s.provider));
      })
      .catch(() => {
        if (!cancelled) setConnectedProviders([]);
      });
    return () => { cancelled = true; };
  }, [mention.isActive, channelId, connectedProviders]);

  const integrationMentions = useMemo<ChannelMember[]>(() => {
    if (!connectedProviders?.includes('mixpanel')) return [];
    return [
      { id: 'integration-mixpanel', name: 'mixpanel', email: 'Mixpanel Analytics', image: null, role: 'integration' },
    ];
  }, [connectedProviders]);

  /** Everyone you could @, Kan first — his place in the list never moves. */
  const mentionableMembers = useMemo(
    () => [KAN_MEMBER, ...integrationMentions, ...members],
    [integrationMentions, members]
  );

  const filteredMembers = useMemo(() => {
    if (!mention.isActive) return [];
    const q = mention.query.toLowerCase();
    return mentionableMembers.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [mention.isActive, mention.query, mentionableMembers]);

  // Filtered cards for # card mention dropdown
  const allCards = useStore((s) => s.cards);
  const channels = useStore((s) => s.channels);
  const filteredCards = useMemo(() => {
    if (!cardMention.isActive) return [];
    const q = cardMention.query.toLowerCase();
    return Object.values(allCards)
      .filter((card) => card.title.toLowerCase().includes(q))
      .sort((a, b) => {
        // Exact start match first
        const aStarts = a.title.toLowerCase().startsWith(q) ? 1 : 0;
        const bStarts = b.title.toLowerCase().startsWith(q) ? 1 : 0;
        return bStarts - aStarts;
      })
      .slice(0, 8);
  }, [cardMention.isActive, cardMention.query, allCards]);

  // Build regex to detect inserted mentions in content
  const mentionNames = Object.keys(mentionsMap);
  const mentionRegex = useMemo(() => {
    if (mentionNames.length === 0) return null;
    const escaped = mentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`@(${escaped.join('|')})(?=\\s|$)`, 'g');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionNames.join(',')]);

  // Build regex for card mentions
  const cardMentionNames = Object.keys(cardMentionsMap);
  const cardMentionRegex = useMemo(() => {
    if (cardMentionNames.length === 0) return null;
    const escaped = cardMentionNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`#(${escaped.join('|')})(?=\\s|$)`, 'g');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardMentionNames.join(',')]);

  // Not state: Kan replying is a fact about the message, so it's read off the
  // message. Delete his name and it stops being true, with nothing to reset.
  const isAskingKan = forceQuestionMode || KAN_MENTION.test(content);
  const mode: InputMode = isAskingKan ? 'question' : 'note';

  const hasMentions = mentionRegex !== null || cardMentionRegex !== null;
  const showBackdrop = mode === 'question' || hasMentions;

  const { uploadFile, isUploading, error: uploadError, clearError } = useImageUpload({ cardId });
  // Use keyboard offset hook for focus/blur handlers (parent handles positioning)
  const { isFocused, onFocus: hookOnFocus, onBlur: hookOnBlur } = useKeyboardOffset();

  // Reset input activation when card changes (prevents auto-focus on new card)
  useEffect(() => {
    setInputActivated(false);
  }, [cardId]);

  // Close the add menu on an outside click or Escape.
  useEffect(() => {
    if (!showAddMenu) return;
    const onPointer = (e: MouseEvent) => {
      if (!addMenuRef.current?.contains(e.target as Node)) setShowAddMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddMenu(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showAddMenu]);

  // Use parent's handlers if provided, otherwise use hook's handlers
  const onFocus = onKeyboardFocus ?? hookOnFocus;
  const onBlur = onKeyboardBlur ?? hookOnBlur;

  // The box ignores focus until it's been deliberately opened, so anything that
  // wants the cursor has to go through here.
  const activateInput = useCallback(() => {
    setInputActivated((already) => {
      if (!already) setTimeout(() => textareaRef.current?.focus(), 50);
      return true;
    });
  }, []);

  /**
   * Type an @ and open the picker, exactly as typing one by hand would.
   *
   * The button is a shortcut to the mention list, not to Kan specifically —
   * he's the first name in it, but he's one of the people you can address here
   * rather than the only one. Typing the character is also why this needs to
   * set the mention state itself: that normally comes off the textarea's own
   * onChange, which a programmatic edit doesn't fire.
   */
  const insertAtMention = useCallback(() => {
    // One @ at a time. There's already an unfinished one if the picker is open
    // or the text trails off in a half-typed mention, and pressing the button
    // again should take you back to finishing it rather than start @@@.
    const alreadyPending = mention.isActive || /(?:^|\s)@[^\s@]*$/.test(content);
    if (alreadyPending) {
      activateInput();
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    const needsSpace = content.length > 0 && !/\s$/.test(content);
    const next = content + (needsSpace ? ' @' : '@');
    setContent(next);
    setMention({ isActive: true, query: '', startIndex: next.length - 1 });
    setMentionSelectedIndex(0);
    activateInput();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = next.length;
    });
  }, [content, mention.isActive, activateInput]);

  /**
   * Put @kan at the front of the message.
   *
   * The front because that's how you address someone, and because it puts the
   * one word that changes what happens to the message where you read first.
   */
  const addKanMention = useCallback(() => {
    setContent((current) => (KAN_MENTION.test(current) ? current : current ? `@kan ${current}` : '@kan '));
    activateInput();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    });
  }, [activateInput]);

  useImperativeHandle(ref, () => ({
    focusInput: activateInput,
    mentionKan: addKanMention,
  }), [activateInput, addKanMention]);

  // Sync scroll between textarea and backdrop (for keyword highlighting)
  const handleScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Render highlighted backdrop for mentions and/or keywords
  const renderBackdropContent = useCallback((): ReactNode[] => {
    const text = content;
    // Collect all highlight matches
    const matches: Array<{ start: number; end: number; type: 'mention' | 'keyword'; text: string }> = [];

    // Mention matches
    if (mentionRegex) {
      mentionRegex.lastIndex = 0;
      let m;
      while ((m = mentionRegex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, type: 'mention', text: m[0] });
      }
    }

    // Card mention matches
    if (cardMentionRegex) {
      cardMentionRegex.lastIndex = 0;
      let m;
      while ((m = cardMentionRegex.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, type: 'mention', text: m[0] });
      }
    }

    // @kan, however it got there — typed by hand or picked from the list. It
    // isn't in mentionsMap, so it needs its own pass.
    const kanRegex = /(^|\s)(@kan)\b/gi;
    let k;
    while ((k = kanRegex.exec(text)) !== null) {
      const start = k.index + k[1].length;
      matches.push({ start, end: start + k[2].length, type: 'mention', text: k[2] });
    }

    // Keyword matches (question mode only)
    if (mode === 'question') {
      KEYWORD_REGEX.lastIndex = 0;
      let m;
      while ((m = KEYWORD_REGEX.exec(text)) !== null) {
        // Skip if overlapping with a mention
        const overlaps = matches.some(
          (existing) => m!.index < existing.end && m!.index + m![0].length > existing.start
        );
        if (!overlaps) {
          matches.push({ start: m.index, end: m.index + m[0].length, type: 'keyword', text: m[0] });
        }
      }
    }

    matches.sort((a, b) => a.start - b.start);

    const segments: ReactNode[] = [];
    let lastIndex = 0;

    for (const match of matches) {
      if (match.start > lastIndex) {
        segments.push(
          <span key={`text-${lastIndex}`} className="text-neutral-900 dark:text-white">
            {text.slice(lastIndex, match.start)}
          </span>
        );
      }

      if (match.type === 'mention') {
        // A finished mention reads as a chip. This layer is an overlay sitting
        // exactly on top of a transparent textarea, so it can only be styled in
        // ways that don't change how wide the text is: the horizontal padding
        // that makes the pill is handed straight back as negative margin, and
        // there's no weight change, or every character after it would drift out
        // from under the caret.
        const atLineStart = match.start === 0;
        segments.push(
          <span
            key={`mention-${match.start}`}
            className="rounded bg-neutral-200/80 dark:bg-neutral-600/50 text-neutral-900 dark:text-white"
            style={{
              paddingTop: 1,
              paddingBottom: 1,
              // Nothing to bleed into at the very start of the box, so that
              // side stays flush and only the right gets room.
              paddingLeft: atLineStart ? 0 : 3,
              marginLeft: atLineStart ? 0 : -3,
              paddingRight: 3,
              marginRight: -3,
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
            }}
          >
            {match.text}
          </span>
        );
      } else {
        segments.push(
          <mark
            key={`keyword-${match.start}`}
            className="text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 rounded-sm"
            data-tooltip={getTooltipForKeyword(match.text)}
          >
            {match.text}
          </mark>
        );
      }

      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      segments.push(
        <span key={`text-${lastIndex}`} className="text-neutral-900 dark:text-white">
          {text.slice(lastIndex)}
        </span>
      );
    }

    segments.push(<span key="trailing">&nbsp;</span>);
    return segments;
  }, [content, mode, mentionRegex, cardMentionRegex]);

  // Handle mouse events on backdrop for tooltips
  const handleBackdropMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'MARK' && target.dataset.tooltip) {
      const rect = target.getBoundingClientRect();
      const wrapperRect = inputWrapperRef.current?.getBoundingClientRect();
      if (wrapperRect) {
        setTooltip({
          text: target.dataset.tooltip,
          x: rect.left - wrapperRect.left + rect.width / 2,
          y: rect.top - wrapperRect.top - 4,
        });
      }
    } else {
      setTooltip(null);
    }
  }, []);

  // Auto-resize textarea and track if scrolling is needed
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const shouldScroll = scrollHeight > MAX_HEIGHT;
      setNeedsScroll(shouldScroll);
      textarea.style.height = `${Math.min(scrollHeight, MAX_HEIGHT)}px`;
    }
  }, [content]);

  // Detect image generation intent in question mode
  useEffect(() => {
    if (mode !== 'question' && !forceQuestionMode) {
      setShowImageSettings(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowImageSettings(detectImageGenerationIntent(content));
    }, 300);
    return () => clearTimeout(timer);
  }, [content, mode, forceQuestionMode]);

  const handleUploadFile = useCallback(async (file: File) => {
    const tempId = URL.createObjectURL(file);
    setStagedImages((prev) => [...prev, { url: tempId, isLoading: true, file }]);

    try {
      const result = await uploadFile(file);
      setStagedImages((prev) =>
        prev.map((img) =>
          img.url === tempId ? { url: result.url } : img
        )
      );
    } catch {
      // Remove failed upload from staged
      setStagedImages((prev) => prev.filter((img) => img.url !== tempId));
    }
  }, [uploadFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          handleUploadFile(file);
        }
      }
    }
  }, [handleUploadFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 5);
    for (const file of imageFiles) {
      handleUploadFile(file);
    }

    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleUploadFile]);

  const removeStagedImage = useCallback((url: string) => {
    setStagedImages((prev) => prev.filter((img) => img.url !== url));
  }, []);

  const hasContent = content.trim().length > 0;
  const hasImages = stagedImages.some((img) => !img.isLoading);
  const canSubmit = (hasContent || hasImages) && !isLoading;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const imageUrls = stagedImages
      .filter((img) => !img.isLoading)
      .map((img) => img.url);

    // Convert @Name mentions to @[Name](userId) format for storage
    let finalContent = content.trim();
    for (const [name, userId] of Object.entries(mentionsMap)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      finalContent = finalContent.replace(
        new RegExp(`@${escaped}(?=\\s|$)`, 'g'),
        `@[${name}](${userId})`
      );
    }
    // Convert #Title mentions to #[Title](cardId) format for storage
    for (const [title, cardId] of Object.entries(cardMentionsMap)) {
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      finalContent = finalContent.replace(
        new RegExp(`#${escaped}(?=\\s|$)`, 'g'),
        `#[${title}](${cardId})`
      );
    }

    // Auto-switch to question mode when @mixpanel is mentioned (notes don't trigger AI)
    const submitMode = (mode === 'note' && mentionsMap['mixpanel']) ? 'question' : mode;

    onSubmit(
      finalContent,
      submitMode,
      imageUrls.length > 0 ? imageUrls : undefined,
      showImageSettings ? imageSettings : undefined
    );
    setContent('');
    setMentionsMap({});
    setCardMentionsMap({});
    setStagedImages([]);
    setShowImageSettings(false);
    setNeedsScroll(false);
    clearError();

    // Reset height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleMentionSelect = useCallback((member: ChannelMember) => {
    const before = content.slice(0, mention.startIndex);
    const after = content.slice(mention.startIndex + 1 + mention.query.length); // +1 for @
    const insert = `@${member.name} `;
    const newContent = before + insert + after;
    setContent(newContent);
    // Kan stays plain text rather than becoming an @[name](id) link, so that
    // picking him from the list and typing his name by hand produce exactly the
    // same message.
    if (member.id !== KAN_MEMBER.id) {
      setMentionsMap((prev) => ({ ...prev, [member.name]: member.id }));
    }
    setMention({ isActive: false, query: '', startIndex: 0 });

    // Reposition cursor after the inserted mention
    const newCursorPos = before.length + insert.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    });
  }, [content, mention.startIndex, mention.query]);

  const handleCardMentionSelect = useCallback((card: CardType) => {
    const before = content.slice(0, cardMention.startIndex);
    const after = content.slice(cardMention.startIndex + 1 + cardMention.query.length); // +1 for #
    const shortTitle = card.title.length > 40 ? card.title.slice(0, 37) + '...' : card.title;
    const insert = `#${shortTitle} `;
    const newContent = before + insert + after;
    setContent(newContent);
    setCardMentionsMap((prev) => ({ ...prev, [shortTitle]: card.id }));
    setCardMention({ isActive: false, query: '', startIndex: 0 });

    const newCursorPos = before.length + insert.length;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    });
  }, [content, cardMention]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Intercept keys when card mention dropdown is active
    if (cardMention.isActive && filteredCards.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCardMentionSelectedIndex((prev) => (prev + 1) % filteredCards.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCardMentionSelectedIndex((prev) => (prev - 1 + filteredCards.length) % filteredCards.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleCardMentionSelect(filteredCards[cardMentionSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCardMention({ isActive: false, query: '', startIndex: 0 });
        return;
      }
    }

    // Intercept keys when member mention dropdown is active
    if (mention.isActive && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(filteredMembers[mentionSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention({ isActive: false, query: '', startIndex: 0 });
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // One placeholder. The field is a field — what happens to the message is said
  // by the mention in it, not by the prompt in front of it.
  const defaultPlaceholder = 'Add a note...';

  // Note: Keyboard positioning is now handled by the parent component (CardChat)
  // which adjusts the `bottom` position of the input wrapper

  return (
    <div
      ref={containerRef}
      className={`px-3 pt-2 ${isFocused ? 'pb-1 relative z-50 bg-white dark:bg-neutral-900' : 'pb-3'}`}
    >
      <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2.5">
        {/* @mention dropdown (members) */}
        {mention.isActive && filteredMembers.length > 0 && (
          <MentionDropdown
            members={mentionableMembers}
            query={mention.query}
            selectedIndex={mentionSelectedIndex}
            onSelect={handleMentionSelect}
            onClose={() => setMention({ isActive: false, query: '', startIndex: 0 })}
          />
        )}
        {/* #mention dropdown (cards) */}
        {cardMention.isActive && filteredCards.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 max-h-48 overflow-y-auto z-50">
            <div className="px-3 py-1.5 text-[10px] font-medium text-neutral-400 uppercase tracking-wider border-b border-neutral-100 dark:border-neutral-700">
              Cards
            </div>
            {filteredCards.map((card, i) => {
              const ch = channels[card.channelId];
              const col = ch?.columns?.find((c) => c.cardIds?.includes(card.id));
              return (
                <button
                  key={card.id}
                  onMouseDown={(e) => { e.preventDefault(); handleCardMentionSelect(card); }}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    i === cardMentionSelectedIndex
                      ? 'bg-violet-50 dark:bg-violet-900/20'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 text-neutral-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-neutral-900 dark:text-white truncate">{card.title}</div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {ch?.name}{col ? ` · ${col.name}` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {/* Staged images preview */}
        {stagedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {stagedImages.map((img, i) => (
              <div key={img.url + i} className="relative group w-16 h-16 rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-700">
                {img.isLoading ? (
                  <div className="w-full h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
                    <svg className="w-5 h-5 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={img.url}
                    alt="Staged upload"
                    className="w-full h-full object-cover"
                  />
                )}
                {!img.isLoading && (
                  <button
                    onClick={() => removeStagedImage(img.url)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="mb-2 text-xs text-red-500 flex items-center gap-1">
            <span>{uploadError}</span>
            <button onClick={clearError} className="underline">Dismiss</button>
          </div>
        )}

        {/* Image generation settings picker */}
        {showImageSettings && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mr-1">Aspect</span>
            {(['1:1', '3:4', '4:3', '9:16', '16:9'] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setImageSettings(s => ({ ...s, aspectRatio: ratio }))}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  imageSettings.aspectRatio === ratio
                    ? 'bg-violet-600 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }`}
              >
                {ratio}
              </button>
            ))}
            <span className="text-neutral-300 dark:text-neutral-600 mx-1">|</span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium mr-1">Quality</span>
            {(['standard', 'hd'] as const).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setImageSettings(s => ({ ...s, quality: q }))}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                  imageSettings.quality === q
                    ? 'bg-violet-600 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }`}
              >
                {q === 'standard' ? '1K' : '2K'}
              </button>
            ))}
          </div>
        )}

        {/*
          Two rows: the text gets the first one to itself, the tools sit under
          it. The plus used to be inline with the textarea, which started the
          caret a button-width in and cost the field that much of every line —
          the row underneath was already reserved for the @kan hint, so this
          buys the width back without making the composer taller.
        */}
        <div
          ref={inputWrapperRef}
          className="relative"
          onMouseMove={mode === 'question' ? handleBackdropMouseMove : undefined}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* Backdrop for mention + keyword highlighting */}
          {showBackdrop && (
            <div
              ref={backdropRef}
              className="absolute inset-0 px-1 text-sm leading-[26px] whitespace-pre-wrap break-words pointer-events-none overflow-hidden font-[inherit]"
              style={{ wordBreak: 'break-word', letterSpacing: 'inherit' }}
              aria-hidden="true"
            >
              {renderBackdropContent()}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              const val = e.target.value;
              setContent(val);

              // Detect @mention (members)
              const cursorPos = e.target.selectionStart;
              const textBeforeCursor = val.slice(0, cursorPos);

              // Always on, not just when the channel has other people in it —
              // Kan is always in the list.
              const atMatch = textBeforeCursor.match(/(?:^|[\s])@([^\s@]*)$/);
              if (atMatch) {
                const query = atMatch[1];
                const startIndex = cursorPos - query.length - 1;
                setMention({ isActive: true, query, startIndex });
                setMentionSelectedIndex(0);
              } else {
                setMention((prev) => prev.isActive ? { isActive: false, query: '', startIndex: 0 } : prev);
              }

              // Detect #mention (cards)
              const hashMatch = textBeforeCursor.match(/(?:^|[\s])#([^\s#]*)$/);
              if (hashMatch) {
                const query = hashMatch[1];
                const startIndex = cursorPos - query.length - 1;
                setCardMention({ isActive: true, query, startIndex });
                setCardMentionSelectedIndex(0);
              } else {
                setCardMention((prev) => prev.isActive ? { isActive: false, query: '', startIndex: 0 } : prev);
              }
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={(e) => {
              if (!inputActivated) {
                // Prevent focus if not activated - blur immediately
                e.target.blur();
                return;
              }
              onFocus();
            }}
            onBlur={onBlur}
            onScroll={handleScroll}
            onClick={() => {
              if (!inputActivated) {
                setInputActivated(true);
                // Focus after activation
                setTimeout(() => {
                  textareaRef.current?.focus();
                }, 50);
              }
            }}
            readOnly={!inputActivated}
            placeholder={placeholder ?? defaultPlaceholder}
            disabled={isLoading}
            rows={1}
            className={`chat-textarea w-full resize-none px-1 text-sm leading-[26px] placeholder-neutral-400 focus:outline-none whitespace-pre-wrap break-words font-[inherit] ${
              needsScroll ? 'overflow-y-auto' : 'overflow-y-hidden'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
              showBackdrop
                ? 'bg-transparent text-transparent caret-neutral-900 dark:caret-white selection:bg-violet-500/30'
                : 'bg-transparent text-neutral-900 dark:text-white'
            } ${!inputActivated ? 'cursor-pointer' : ''}`}
            style={{ wordBreak: 'break-word', letterSpacing: 'inherit' }}
          />

          {/* Tooltip for keywords */}
          {tooltip && showBackdrop && (
            <div
              className="absolute z-50 px-2 py-1 text-xs text-white bg-neutral-800 dark:bg-neutral-700 rounded shadow-lg whitespace-nowrap pointer-events-none"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -100%)',
              }}
            >
              {tooltip.text}
              <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-neutral-800 dark:border-t-neutral-700" />
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <LiveVoiceMode
          isOpen={showLiveVoice}
          onClose={() => setShowLiveVoice(false)}
          systemPrompt={voiceContext}
        />

        {/* Tools on the left, the two ways out on the right. The row is sized to
            the one it replaced, so the composer is exactly as tall as before. */}
        <div className="mt-0.5 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {/* Everything you can attach lives behind the plus. */}
            <div ref={addMenuRef} className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!onOpenWhiteboard) {
                    fileInputRef.current?.click();
                    return;
                  }
                  setShowAddMenu((v) => !v);
                }}
                disabled={isLoading || isUploading}
                className={`h-6 w-7 flex items-center justify-center rounded-md transition-all disabled:opacity-50 ${
                  showAddMenu
                    ? 'rotate-45 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
                    : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                }`}
                title={onOpenWhiteboard ? 'Add' : 'Attach image'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              {showAddMenu && onOpenWhiteboard && (
                <div className="absolute bottom-full left-0 z-50 mb-1.5 w-44 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xl">
                  <button
                    type="button"
                    onClick={() => { setShowAddMenu(false); fileInputRef.current?.click(); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/60"
                  >
                    <svg className="w-4 h-4 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      <span className="block text-[12px] text-neutral-900 dark:text-neutral-100">Upload image</span>
                      <span className="block text-[10px] text-neutral-400 dark:text-neutral-500">Photo or screenshot</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddMenu(false); onOpenWhiteboard(); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/60"
                  >
                    <svg className="w-4 h-4 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                    </svg>
                    <span>
                      <span className="block text-[12px] text-neutral-900 dark:text-neutral-100">Whiteboard</span>
                      <span className="block text-[10px] text-neutral-400 dark:text-neutral-500">Sketch it out</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/*
              The @ button is the discovery mechanism the hint line used to be:
              it opens the same picker typing @ does, with Kan first in it. It
              types a plain @ rather than jumping straight to Kan, because he's
              one of the people you can address here, not the only one.
            */}
            {!forceQuestionMode && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={insertAtMention}
                disabled={isLoading}
                title="Mention someone — Kan included"
                className="h-6 w-7 flex items-center justify-center rounded-md text-[15px] font-medium leading-none text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-50"
              >
                @
              </button>
            )}

            {/*
              The offer, and only while it's still one: once you're writing
              there's something for Kan to answer, and once he's named the
              mention in the field says so itself. It lives in the row the
              tools are already in, so nothing moves when it appears.
            */}
            {!forceQuestionMode && hasContent && !isAskingKan && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addKanMention}
                disabled={isLoading}
                title="Add @kan so he replies to this"
                className={`kan-hint ml-1 flex min-w-0 items-center gap-1 truncate text-[11px] leading-none text-neutral-400 dark:text-neutral-500 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300 ${
                  isLoading ? 'cursor-not-allowed opacity-50' : ''
                }`}
              >
                <span className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                  @kan
                </span>
                <span className="truncate">to have him reply</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowLiveVoice(true)}
              title="Live voice conversation"
              className="h-6 w-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
            >
              <AudioLines className="w-4 h-4" />
            </button>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`h-6 w-7 flex items-center justify-center rounded-md transition-colors ${
                canSubmit
                  ? mode === 'question'
                    ? 'text-violet-500 hover:text-violet-600'
                    : 'text-neutral-900 dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300'
                  : 'text-neutral-300 dark:text-neutral-600 cursor-not-allowed'
              }`}
              title={`Send ${mode === 'question' ? 'question' : 'note'} (Cmd+Enter)`}
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
