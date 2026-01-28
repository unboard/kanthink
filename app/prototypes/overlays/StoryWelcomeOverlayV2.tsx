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
  // === SCENES 1-3: SAME AS V1 ===
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

  // === SCENES 4+: REWORKED FOR V2 ===
  {
    id: 'instructions',
    lines: [
      { text: 'You give me instructions.', style: 'heading', delay: 0 },
      { text: 'I do the work.', style: 'heading', delay: 800 },
      { text: '', delay: 1400 },
      { text: '"Find interesting takes on AI agents"', style: 'dim', delay: 1600 },
      { text: '"Surface startup ideas in climate tech"', style: 'dim', delay: 2200 },
      { text: '"Research what competitors are building"', style: 'dim', delay: 2800 },
      { text: '', delay: 3400 },
      { text: "Write what you're curious about—in plain language.", style: 'normal', delay: 3600 },
      { text: "I'll search, read, and surface what matters.", style: 'accent', delay: 4400 },
    ],
    prompt: 'then what?',
  },
  {
    id: 'feedback',
    lines: [
      { text: 'Cards appear. You react.', style: 'normal', delay: 0 },
      { text: '', delay: 600 },
      { text: 'Drag to "Like" → I find more like this.', style: 'normal', delay: 800 },
      { text: 'Drag to "Dislike" → I stop going there.', style: 'normal', delay: 1400 },
      { text: 'Drag to "This Week" → I know it\'s urgent.', style: 'normal', delay: 2000 },
      { text: '', delay: 2800 },
      { text: 'No forms. No settings. No configuration.', style: 'dim', delay: 3000 },
      { text: "Your actions are the only input I need.", style: 'accent', delay: 3600 },
    ],
    prompt: 'and it learns over time?',
  },
  {
    id: 'evolution',
    lines: [
      { text: 'Better than that.', style: 'normal', delay: 0 },
      { text: '', delay: 600 },
      { text: 'As I watch you work, I start to understand.', style: 'normal', delay: 800 },
      { text: '', delay: 1400 },
      { text: 'Sometimes I\'ll ask a question:', style: 'dim', delay: 1600 },
      { text: '"You seem focused on early-stage companies—want me to filter out Series B+?"', style: 'dim', delay: 2200 },
      { text: '', delay: 3000 },
      { text: 'Sometimes I\'ll suggest refining your instructions:', style: 'dim', delay: 3200 },
      { text: '"Based on what you\'ve liked, should I add \'agentic workflows\'?"', style: 'dim', delay: 3800 },
      { text: '', delay: 4600 },
      { text: 'You decide. I adapt.', style: 'accent', delay: 4800 },
    ],
    prompt: 'clarity emerging from action',
  },
  {
    id: 'ready',
    lines: [
      { text: '> system ready', style: 'dim', delay: 0 },
      { text: '', delay: 400 },
      { text: "Let's create your first channel.", style: 'heading', delay: 600 },
      { text: '', delay: 1200 },
      { text: "What do you want me to research?", style: 'normal', delay: 1400 },
      { text: "What question do you want to explore?", style: 'normal', delay: 2000 },
      { text: "What would you read if you had infinite time?", style: 'normal', delay: 2600 },
      { text: '', delay: 3400 },
      { text: "Give me an instruction. I'll take it from there.", style: 'accent', delay: 3600 },
    ],
    prompt: 'create my first channel',
  },
];

interface StoryWelcomeOverlayV2Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function StoryWelcomeOverlayV2({
  isOpen,
  onClose,
  onCreate,
}: StoryWelcomeOverlayV2Props) {
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
