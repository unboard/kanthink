'use client';

import { useState, useEffect, useCallback } from 'react';

interface StoryScene {
  id: string;
  lines: Array<{
    text: string;
    delay?: number; // ms before this line starts
    style?: 'normal' | 'dim' | 'accent' | 'heading';
  }>;
  prompt?: string; // optional prompt text for continue button
}

const story: StoryScene[] = [
  {
    id: 'intro',
    lines: [
      { text: '> initializing...', style: 'dim', delay: 0 },
      { text: '> connection established', style: 'dim', delay: 400 },
      { text: '', delay: 800 },
      { text: 'Hello.', style: 'heading', delay: 1000 },
      { text: '', delay: 1400 },
      { text: "I'm the Kanthink system.", style: 'normal', delay: 1600 },
      { text: "I help you think through things—", style: 'normal', delay: 2400 },
      { text: "without telling you what to think.", style: 'accent', delay: 3200 },
    ],
    prompt: 'continue',
  },
  {
    id: 'problem',
    lines: [
      { text: "You've probably felt it before:", style: 'normal', delay: 0 },
      { text: '', delay: 600 },
      { text: 'The endless scroll of saved articles.', style: 'dim', delay: 800 },
      { text: 'Bookmarks you forgot existed.', style: 'dim', delay: 1400 },
      { text: 'Ideas that slipped away before you could use them.', style: 'dim', delay: 2000 },
      { text: '', delay: 2800 },
      { text: 'Information everywhere.', style: 'normal', delay: 3000 },
      { text: 'Clarity... nowhere.', style: 'accent', delay: 3600 },
    ],
    prompt: 'I know the feeling',
  },
  {
    id: 'reframe',
    lines: [
      { text: "Here's what I've learned:", style: 'normal', delay: 0 },
      { text: '', delay: 600 },
      { text: "The problem isn't too much information.", style: 'normal', delay: 800 },
      { text: "It's that information has no place to become insight.", style: 'accent', delay: 1600 },
      { text: '', delay: 2400 },
      { text: 'No space to breathe.', style: 'dim', delay: 2600 },
      { text: 'No room to evolve.', style: 'dim', delay: 3000 },
      { text: 'No system that learns what matters to you.', style: 'dim', delay: 3400 },
    ],
    prompt: 'so what changes?',
  },
  {
    id: 'solution',
    lines: [
      { text: 'Kanthink gives you channels.', style: 'heading', delay: 0 },
      { text: '', delay: 600 },
      { text: 'Each channel is a space for one thing you care about.', style: 'normal', delay: 800 },
      { text: '', delay: 1400 },
      { text: "→ A problem you're solving", style: 'dim', delay: 1600 },
      { text: "→ A skill you're building", style: 'dim', delay: 2000 },
      { text: "→ A question you're exploring", style: 'dim', delay: 2400 },
      { text: "→ A project you're running", style: 'dim', delay: 2800 },
      { text: '', delay: 3400 },
      { text: "I watch how you organize. I learn what you value.", style: 'normal', delay: 3600 },
      { text: "Then I surface what's relevant—without the noise.", style: 'accent', delay: 4400 },
    ],
    prompt: 'how does it work?',
  },
  {
    id: 'workflow',
    lines: [
      { text: 'Cards flow through columns.', style: 'normal', delay: 0 },
      { text: 'Simple as that.', style: 'dim', delay: 600 },
      { text: '', delay: 1000 },
      { text: 'Move a card to "Like" → I take note.', style: 'normal', delay: 1200 },
      { text: 'Move it to "Dislike" → I learn your taste.', style: 'normal', delay: 1800 },
      { text: 'Move it to "This Week" → I know what\'s urgent.', style: 'normal', delay: 2400 },
      { text: '', delay: 3200 },
      { text: "You don't configure me.", style: 'accent', delay: 3400 },
      { text: 'You just work.', style: 'accent', delay: 4000 },
      { text: 'I adapt.', style: 'accent', delay: 4400 },
    ],
    prompt: 'that sounds... freeing',
  },
  {
    id: 'philosophy',
    lines: [
      { text: "It's meant to be.", style: 'normal', delay: 0 },
      { text: '', delay: 600 },
      { text: 'Curiosity should feel like play, not work.', style: 'normal', delay: 800 },
      { text: 'Organization should emerge, not be enforced.', style: 'normal', delay: 1600 },
      { text: 'AI should assist, not overwhelm.', style: 'normal', delay: 2400 },
      { text: '', delay: 3200 },
      { text: "Think of me as a librarian who knows your mind.", style: 'dim', delay: 3400 },
      { text: "I'll never judge what you're curious about.", style: 'dim', delay: 4200 },
      { text: "I'll just help you follow the thread.", style: 'accent', delay: 5000 },
    ],
    prompt: 'I like that',
  },
  {
    id: 'ready',
    lines: [
      { text: "> system ready", style: 'dim', delay: 0 },
      { text: '', delay: 400 },
      { text: "Let's start with one channel.", style: 'heading', delay: 600 },
      { text: '', delay: 1200 },
      { text: "What's been on your mind lately?", style: 'normal', delay: 1400 },
      { text: 'A project, a question, a rabbit hole...', style: 'dim', delay: 2200 },
      { text: '', delay: 2800 },
      { text: "We'll figure out the rest together.", style: 'accent', delay: 3000 },
    ],
    prompt: 'create my first channel',
  },
];

interface StoryWelcomeOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function StoryWelcomeOverlay({
  isOpen,
  onClose,
  onCreate,
}: StoryWelcomeOverlayProps) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [typedChars, setTypedChars] = useState<number>(0);
  const [isTyping, setIsTyping] = useState(true);
  const [showCursor, setShowCursor] = useState(true);

  const currentScene = story[sceneIndex];
  const progress = ((sceneIndex + 1) / story.length) * 100;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSceneIndex(0);
      setVisibleLines(0);
      setTypedChars(0);
      setIsTyping(true);
    }
  }, [isOpen]);

  // Cursor blink
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Typewriter effect
  useEffect(() => {
    if (!isOpen || !isTyping) return;

    const scene = story[sceneIndex];
    if (!scene) return;

    // Calculate total characters up to current visible line
    let totalCharsInVisibleLines = 0;
    for (let i = 0; i <= visibleLines && i < scene.lines.length; i++) {
      totalCharsInVisibleLines += scene.lines[i].text.length;
    }

    // If we've typed all chars in current line, move to next line
    const currentLine = scene.lines[visibleLines];
    if (!currentLine) {
      setIsTyping(false);
      return;
    }

    let charsInPreviousLines = 0;
    for (let i = 0; i < visibleLines; i++) {
      charsInPreviousLines += scene.lines[i].text.length;
    }
    const charsInCurrentLine = typedChars - charsInPreviousLines;

    if (charsInCurrentLine >= currentLine.text.length) {
      // Move to next line
      if (visibleLines < scene.lines.length - 1) {
        const nextLine = scene.lines[visibleLines + 1];
        const delay = nextLine.delay ? nextLine.delay - (currentLine.delay || 0) : 100;
        const timeout = setTimeout(() => {
          setVisibleLines((prev) => prev + 1);
        }, Math.max(delay, 50));
        return () => clearTimeout(timeout);
      } else {
        setIsTyping(false);
      }
      return;
    }

    // Type next character
    const charDelay = currentLine.style === 'dim' ? 15 : 25;
    const timeout = setTimeout(() => {
      setTypedChars((prev) => prev + 1);
    }, charDelay);

    return () => clearTimeout(timeout);
  }, [isOpen, isTyping, sceneIndex, visibleLines, typedChars]);

  // Start typing when line becomes visible
  useEffect(() => {
    if (!isOpen || !isTyping) return;
    const scene = story[sceneIndex];
    if (!scene) return;

    const currentLine = scene.lines[visibleLines];
    if (!currentLine) return;

    // Calculate chars needed to be at start of current line
    let charsNeeded = 0;
    for (let i = 0; i < visibleLines; i++) {
      charsNeeded += scene.lines[i].text.length;
    }

    if (typedChars < charsNeeded) {
      setTypedChars(charsNeeded);
    }
  }, [isOpen, isTyping, sceneIndex, visibleLines, typedChars]);

  const handleContinue = useCallback(() => {
    if (isTyping) {
      // Skip to end of current scene
      let totalChars = 0;
      for (const line of currentScene.lines) {
        totalChars += line.text.length;
      }
      setVisibleLines(currentScene.lines.length - 1);
      setTypedChars(totalChars);
      setIsTyping(false);
    } else if (sceneIndex < story.length - 1) {
      // Go to next scene
      setSceneIndex((prev) => prev + 1);
      setVisibleLines(0);
      setTypedChars(0);
      setIsTyping(true);
    } else {
      // Final scene - create channel
      onCreate('New Channel');
    }
  }, [isTyping, sceneIndex, currentScene, onCreate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleContinue();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleContinue]);

  if (!isOpen) return null;

  // Render text with typewriter effect
  const renderLine = (line: typeof currentScene.lines[0], lineIndex: number) => {
    if (lineIndex > visibleLines) return null;

    let charsBeforeLine = 0;
    for (let i = 0; i < lineIndex; i++) {
      charsBeforeLine += currentScene.lines[i].text.length;
    }

    const charsToShow = Math.max(0, typedChars - charsBeforeLine);
    const displayText = line.text.slice(0, charsToShow);
    const isCurrentLine = lineIndex === visibleLines && isTyping;

    if (line.text === '') {
      return <div key={lineIndex} className="h-4" />;
    }

    const styleClasses = {
      normal: 'text-neutral-200',
      dim: 'text-neutral-500',
      accent: 'text-violet-400',
      heading: 'text-white text-xl font-medium',
    };

    return (
      <div
        key={lineIndex}
        className={`font-mono leading-relaxed ${styleClasses[line.style || 'normal']}`}
      >
        {displayText}
        {isCurrentLine && (
          <span className={`inline-block w-2 h-4 ml-0.5 ${showCursor ? 'bg-violet-400' : 'bg-transparent'}`} />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl bg-neutral-950 rounded-2xl shadow-2xl overflow-hidden border border-neutral-800">
        {/* Progress bar */}
        <div className="h-0.5 bg-neutral-800">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800">
          <div className="flex gap-1.5">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
            />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 text-xs text-neutral-500 font-mono">kanthink://welcome</span>
        </div>

        {/* Content */}
        <div className="p-8 min-h-[320px]">
          <div className="space-y-1">
            {currentScene.lines.map((line, i) => renderLine(line, i))}
          </div>

          {/* Cursor at end when not typing */}
          {!isTyping && (
            <div className="mt-4">
              <span className={`inline-block w-2 h-4 ${showCursor ? 'bg-violet-400' : 'bg-transparent'}`} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-neutral-800 flex justify-between items-center">
          <button
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors font-mono"
          >
            [esc] skip
          </button>

          <button
            onClick={handleContinue}
            className={`
              group flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm transition-all
              ${
                isTyping
                  ? 'text-neutral-400 hover:text-neutral-200'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }
            `}
          >
            {isTyping ? (
              '[space] skip'
            ) : sceneIndex === story.length - 1 ? (
              <>
                {currentScene.prompt}
                <svg
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </>
            ) : (
              <>
                {currentScene.prompt || 'continue'}
                <span className="text-violet-300">[enter]</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
