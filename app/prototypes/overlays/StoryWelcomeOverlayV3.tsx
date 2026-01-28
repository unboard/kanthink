'use client';

import { useState, useEffect, useCallback } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface StoryScene {
  id: string;
  lines: Array<{
    text: string;
    delay?: number;
    style?: 'normal' | 'dim' | 'accent' | 'heading';
  }>;
  prompt?: string;
}

const allScenes: StoryScene[] = [
  {
    id: 'intro',
    lines: [
      { text: '> sprouting...', style: 'dim', delay: 0 },
      { text: '> ready', style: 'dim', delay: 400 },
      { text: '', delay: 800 },
      { text: "Hi, I'm Kan.", style: 'heading', delay: 1000 },
      { text: '', delay: 1600 },
      { text: 'Welcome to Kanthink — a space to learn, organize your thoughts, and get things done.', style: 'normal', delay: 1800 },
      { text: 'A productivity board with a little magic built in.', style: 'accent', delay: 2800 },
    ],
    prompt: 'continue',
  },
  {
    id: 'ready',
    lines: [
      { text: 'Make it yours.', style: 'heading', delay: 0 },
      { text: '', delay: 600 },
      { text: "I'll be here to help along the way.", style: 'normal', delay: 800 },
      { text: '', delay: 1400 },
      { text: "Let's get started.", style: 'accent', delay: 1600 },
    ],
    prompt: 'continue',
  },
  {
    id: 'signin',
    lines: [
      { text: 'One more thing.', style: 'heading', delay: 0 },
      { text: '', delay: 600 },
      { text: 'Sign in to save your spaces and unlock AI features.', style: 'normal', delay: 800 },
      { text: 'Free tier includes 10 AI requests per month.', style: 'dim', delay: 1800 },
    ],
    prompt: 'sign in with Google',
  },
  {
    id: 'create',
    lines: [
      { text: "You're all set.", style: 'heading', delay: 0 },
      { text: '', delay: 600 },
      { text: "Let's create your first space.", style: 'accent', delay: 800 },
    ],
    prompt: 'create my first space',
  },
];

interface StoryWelcomeOverlayV3Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  signInAction?: (formData: FormData) => Promise<void>;
  signInRedirectTo?: string;
  isSignedIn?: boolean;
}

export function StoryWelcomeOverlayV3({
  isOpen,
  onClose,
  onCreate,
  signInAction,
  signInRedirectTo = '/',
  isSignedIn = false,
}: StoryWelcomeOverlayV3Props) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [typedChars, setTypedChars] = useState<number>(0);
  const [isTyping, setIsTyping] = useState(true);
  const [showCursor, setShowCursor] = useState(true);

  const story = isSignedIn
    ? allScenes.filter((s) => s.id !== 'signin')
    : allScenes;
  const currentScene = story[sceneIndex];
  const progress = ((sceneIndex + 1) / story.length) * 100;

  // Reset on open — typing starts after icon sprout animation
  useEffect(() => {
    if (isOpen) {
      setSceneIndex(0);
      setVisibleLines(0);
      setTypedChars(0);
      setIsTyping(false);
      const startTyping = setTimeout(() => setIsTyping(true), 2200);
      return () => clearTimeout(startTyping);
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

    let charsNeeded = 0;
    for (let i = 0; i < visibleLines; i++) {
      charsNeeded += scene.lines[i].text.length;
    }

    if (typedChars < charsNeeded) {
      setTypedChars(charsNeeded);
    }
  }, [isOpen, isTyping, sceneIndex, visibleLines, typedChars]);

  const advanceScene = useCallback(() => {
    setSceneIndex((prev) => prev + 1);
    setVisibleLines(0);
    setTypedChars(0);
    setIsTyping(true);
  }, []);

  const handleContinue = useCallback(() => {
    if (isTyping) {
      let totalChars = 0;
      for (const line of currentScene.lines) {
        totalChars += line.text.length;
      }
      setVisibleLines(currentScene.lines.length - 1);
      setTypedChars(totalChars);
      setIsTyping(false);
    } else if (currentScene.id === 'signin') {
      // Sign-in is handled by the form action on the CTA button
      return;
    } else if (sceneIndex < story.length - 1) {
      advanceScene();
    } else {
      onCreate('New Space');
    }
  }, [isTyping, sceneIndex, currentScene, onCreate, story.length, advanceScene]);

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
      normal: 'text-neutral-300',
      dim: 'text-neutral-500 text-sm',
      accent: 'text-violet-400',
      heading: 'text-white text-2xl font-bold',
    };

    return (
      <div
        key={lineIndex}
        className={`leading-relaxed ${styleClasses[line.style || 'normal']}`}
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
      {/* Gradient backdrop */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-violet-950/90 via-neutral-950/95 to-neutral-950/95"
        onClick={onClose}
      />

      {/* Decorative blur elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        {/* Skip button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Skip for now
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {story.map((scene, i) => (
            <div
              key={scene.id}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= sceneIndex
                  ? 'w-8 bg-violet-500'
                  : 'w-2 bg-neutral-700'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-neutral-900/80 backdrop-blur-xl rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl">
          <div className="p-8 min-h-[320px]">
          <style>{`
            @keyframes kan-sprout {
              0% { transform: scale(0) translateY(12px); opacity: 0; }
              50% { transform: scale(1.1) translateY(-3px); opacity: 1; }
              75% { transform: scale(0.96) translateY(1px); opacity: 1; }
              100% { transform: scale(1) translateY(0); opacity: 1; }
            }
          `}</style>
          <div className="mb-6 flex items-center gap-3">
            <div
              style={{
                display: 'inline-block',
                transformOrigin: 'bottom center',
                animation: 'kan-sprout 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              <KanthinkIcon size={40} className="text-violet-400" />
            </div>
          </div>
          <div className="space-y-1">
            {currentScene.lines.map((line, i) => renderLine(line, i))}
          </div>

          {!isTyping && (
            <div className="mt-4">
              <span className={`inline-block w-2 h-4 ${showCursor ? 'bg-violet-400' : 'bg-transparent'}`} />
            </div>
          )}
        </div>

        <div className="px-8 py-5 border-t border-neutral-800 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {currentScene.id === 'signin' && !isTyping && (
              <button
                onClick={advanceScene}
                className="text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Skip sign-in
              </button>
            )}
          </div>

          {currentScene.id === 'signin' && !isTyping && signInAction ? (
            <form action={signInAction}>
              <input type="hidden" name="redirectTo" value={signInRedirectTo} />
              <button
                type="submit"
                className="group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all bg-violet-600 hover:bg-violet-500 text-white"
              >
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
              </button>
            </form>
          ) : (
            <button
              onClick={handleContinue}
              className={`
                group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all
                ${
                  isTyping
                    ? 'text-neutral-400 hover:text-white'
                    : 'bg-violet-600 hover:bg-violet-500 text-white'
                }
              `}
            >
              {isTyping ? (
                'Skip intro'
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
                  {currentScene.prompt || 'Continue'}
                </>
              )}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
