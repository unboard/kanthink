'use client';

import { useState, useEffect, useRef } from 'react';

interface WelcomeScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

type Step = 'welcome' | 'purpose' | 'name' | 'ready';

const purposes = [
  { id: 'reading', label: 'Reading & Learning', icon: '📚', description: 'Books, articles, courses' },
  { id: 'ideas', label: 'Ideas & Projects', icon: '💡', description: 'Capture and develop ideas' },
  { id: 'research', label: 'Research', icon: '🔬', description: 'Collect and organize findings' },
  { id: 'content', label: 'Content Creation', icon: '✍️', description: 'Plan and track content' },
  { id: 'personal', label: 'Personal Goals', icon: '🎯', description: 'Habits and development' },
  { id: 'other', label: 'Something else', icon: '✨', description: 'Create your own workflow' },
];

export function WelcomeScreen({ isOpen, onClose, onCreate }: WelcomeScreenProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null);
  const [channelName, setChannelName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('welcome');
      setSelectedPurpose(null);
      setChannelName('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 'name') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePurposeSelect = (purposeId: string) => {
    setSelectedPurpose(purposeId);
    const purpose = purposes.find(p => p.id === purposeId);
    if (purpose && purpose.id !== 'other') {
      setChannelName(purpose.label);
    }
    setStep('name');
  };

  const handleCreate = () => {
    if (channelName.trim()) {
      onCreate(channelName.trim());
    }
  };

  const handleNext = () => {
    switch (step) {
      case 'welcome':
        setStep('purpose');
        break;
      case 'purpose':
        if (selectedPurpose) setStep('name');
        break;
      case 'name':
        if (channelName.trim()) setStep('ready');
        break;
      case 'ready':
        handleCreate();
        break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'purpose':
        setStep('welcome');
        break;
      case 'name':
        setStep('purpose');
        break;
      case 'ready':
        setStep('name');
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/90 via-neutral-950/95 to-neutral-950/95" />

      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-lg">
        {/* Skip button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Skip for now
        </button>

        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mb-8">
          {(['welcome', 'purpose', 'name', 'ready'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= ['welcome', 'purpose', 'name', 'ready'].indexOf(step)
                  ? 'w-8 bg-violet-500'
                  : 'w-2 bg-neutral-700'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-neutral-900/80 backdrop-blur-xl rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl">
          {step === 'welcome' && (
            <div className="p-8 text-center">
              {/* Logo/Icon */}
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>

              <h1 className="text-2xl font-bold text-white mb-3">
                Welcome to Kanthink
              </h1>
              <p className="text-neutral-400 mb-8 max-w-sm mx-auto">
                An AI-assisted Kanban where channels learn from how you organize things.
              </p>

              {/* Features preview */}
              <div className="grid grid-cols-3 gap-4 mb-8 text-left">
                <div className="p-3 rounded-lg bg-neutral-800/50">
                  <div className="text-lg mb-1">📋</div>
                  <div className="text-xs text-neutral-300 font-medium">Channels</div>
                  <div className="text-xs text-neutral-500">Focused spaces</div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-800/50">
                  <div className="text-lg mb-1">🤖</div>
                  <div className="text-xs text-neutral-300 font-medium">AI-Assisted</div>
                  <div className="text-xs text-neutral-500">Smart suggestions</div>
                </div>
                <div className="p-3 rounded-lg bg-neutral-800/50">
                  <div className="text-lg mb-1">🎯</div>
                  <div className="text-xs text-neutral-300 font-medium">Goal-Driven</div>
                  <div className="text-xs text-neutral-500">Learn your intent</div>
                </div>
              </div>

              <button
                onClick={handleNext}
                className="w-full py-3 px-6 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors"
              >
                Get started
              </button>
            </div>
          )}

          {step === 'purpose' && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-white mb-2 text-center">
                What brings you here?
              </h2>
              <p className="text-neutral-400 text-sm mb-6 text-center">
                We'll set up your first channel based on this
              </p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {purposes.map((purpose) => (
                  <button
                    key={purpose.id}
                    onClick={() => handlePurposeSelect(purpose.id)}
                    className={`p-4 rounded-xl text-left transition-all ${
                      selectedPurpose === purpose.id
                        ? 'bg-violet-600 ring-2 ring-violet-400'
                        : 'bg-neutral-800/70 hover:bg-neutral-800'
                    }`}
                  >
                    <span className="text-xl block mb-2">{purpose.icon}</span>
                    <div className={`text-sm font-medium ${
                      selectedPurpose === purpose.id ? 'text-white' : 'text-neutral-200'
                    }`}>
                      {purpose.label}
                    </div>
                    <div className={`text-xs ${
                      selectedPurpose === purpose.id ? 'text-violet-200' : 'text-neutral-500'
                    }`}>
                      {purpose.description}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleBack}
                className="w-full py-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                Back
              </button>
            </div>
          )}

          {step === 'name' && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-white mb-2 text-center">
                Name your channel
              </h2>
              <p className="text-neutral-400 text-sm mb-6 text-center">
                You can always change this later
              </p>

              <input
                ref={inputRef}
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="My first channel"
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder:text-neutral-500 focus:outline-none focus:border-violet-500 transition-colors mb-6"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && channelName.trim()) {
                    handleNext();
                  }
                }}
              />

              <div className="flex gap-3">
                <button
                  onClick={handleBack}
                  className="flex-1 py-3 text-neutral-400 hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleNext}
                  disabled={!channelName.trim()}
                  className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 'ready' && (
            <div className="p-8 text-center">
              {/* Success animation placeholder */}
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h2 className="text-xl font-bold text-white mb-2">
                You're all set!
              </h2>
              <p className="text-neutral-400 text-sm mb-6">
                Your channel "<span className="text-white">{channelName}</span>" is ready to go.
              </p>

              {/* Quick tips */}
              <div className="text-left space-y-3 mb-8 p-4 rounded-xl bg-neutral-800/50">
                <h3 className="text-sm font-medium text-neutral-300 mb-2">Quick tips:</h3>
                <div className="flex items-start gap-3 text-sm">
                  <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-violet-400 text-xs">1</span>
                  </div>
                  <p className="text-neutral-400">
                    <span className="text-neutral-200">Add cards</span> to capture ideas, links, or tasks
                  </p>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-violet-400 text-xs">2</span>
                  </div>
                  <p className="text-neutral-400">
                    <span className="text-neutral-200">Move cards</span> between columns to signal your intent
                  </p>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-violet-400 text-xs">3</span>
                  </div>
                  <p className="text-neutral-400">
                    <span className="text-neutral-200">Use AI</span> to generate suggestions based on your patterns
                  </p>
                </div>
              </div>

              <button
                onClick={handleCreate}
                className="w-full py-3 px-6 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors"
              >
                Open my channel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
