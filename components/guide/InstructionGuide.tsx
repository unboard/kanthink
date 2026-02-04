'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/lib/settingsStore';

export interface GuideStep {
  id: string;
  message: string;
  options: Array<{
    label: string;
    value: string;
    description?: string;
  }>;
  allowCustom?: boolean;
  customPlaceholder?: string;
}

export interface ChannelStructure {
  channelName: string;
  channelDescription: string;
  instructions: string;
  columns: Array<{
    name: string;
    description: string;
    isAiTarget?: boolean;
  }>;
  instructionCards: Array<{
    title: string;
    instructions: string;
    action: 'generate' | 'modify' | 'move';
    targetColumnName: string;
    cardCount?: number;
  }>;
}

export interface GuideResult {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

interface InstructionGuideProps {
  channelName?: string;
  onComplete: (result: GuideResult) => void;
  onCancel?: () => void;
  compact?: boolean;
}

type ViewState = 'loading' | 'options' | 'result' | 'error';

export function InstructionGuide({
  channelName,
  onComplete,
  onCancel,
  compact = false,
}: InstructionGuideProps) {
  const hasStartedRef = useRef(false);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [currentStep, setCurrentStep] = useState<GuideStep | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [choiceLabels, setChoiceLabels] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GuideResult | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ai = useSettingsStore((s) => s.ai);

  // Start the guide on mount (only once)
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startGuide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGuide = async () => {
    setViewState('loading');

    try {
      const response = await fetch('/api/instruction-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          channelName,
          choices: {},
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start guide');
      }

      const data = await response.json();
      handleGuideResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start guide');
      setViewState('error');
    }
  };

  const handleGuideResponse = (data: {
    step?: GuideStep;
    complete?: boolean;
    result?: GuideResult;
    message?: string;
  }) => {
    if (data.complete && data.result) {
      setResult(data.result);
      setResultMessage(data.message || '');
      setViewState('result');
      return;
    }

    if (data.step) {
      setCurrentStep(data.step);
      setViewState('options');
    }
  };

  const selectOption = useCallback(async (value: string, label: string) => {
    if (!currentStep || viewState === 'loading') return;

    const newChoices = { ...choices, [currentStep.id]: value };
    const newLabels = { ...choiceLabels, [currentStep.id]: label };
    setChoices(newChoices);
    setChoiceLabels(newLabels);
    setShowCustomInput(false);
    setCustomValue('');
    setViewState('loading');

    try {
      const response = await fetch('/api/instruction-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'continue',
          channelName,
          choices: newChoices,
          choiceLabels: newLabels,
          lastChoice: { stepId: currentStep.id, value, label },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to continue');
      }

      const data = await response.json();
      handleGuideResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setViewState('error');
    }
  }, [currentStep, viewState, choices, choiceLabels, channelName, ai]);

  const submitCustom = () => {
    if (!customValue.trim()) return;
    selectOption(customValue.trim(), customValue.trim());
  };

  const handleApplyResult = () => {
    if (result) {
      onComplete(result);
    }
  };

  // Progress indicator - dynamic based on whether detail step is present
  const hasDetailStep = currentStep?.id === 'detail' || choices.detail !== undefined;
  const stepOrder = hasDetailStep
    ? ['purpose', 'topic', 'detail', 'workflow', 'style']
    : ['purpose', 'topic', 'workflow', 'style'];
  const currentStepIndex = currentStep ? stepOrder.indexOf(currentStep.id) : -1;
  const completedSteps = Object.keys(choices).length;

  // If step has no options, show text input immediately
  const isTextOnlyStep = currentStep && currentStep.options.length === 0 && currentStep.allowCustom;

  if (viewState === 'error') {
    return (
      <div className={compact ? 'p-4' : 'p-6'}>
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">{error}</p>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-sm text-neutral-600 dark:text-neutral-300 hover:underline"
            >
              Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  if (viewState === 'loading') {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} flex flex-col items-center justify-center min-h-[200px]`}>
        <div className="flex items-center gap-1.5 mb-3">
          <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {completedSteps === 0 ? 'Starting...' : completedSteps >= 4 ? 'Creating your channel...' : 'Thinking...'}
        </p>
      </div>
    );
  }

  if (viewState === 'result' && result) {
    const structure = result.structure;
    const columnNames = structure?.columns.map(c => c.name) || [];

    return (
      <div className={compact ? 'p-4' : 'p-6'}>
        {/* Summary of what was created */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-1">
              {result.channelName}
            </h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {result.channelDescription}
            </p>
          </div>

          {/* Columns preview */}
          {columnNames.length > 0 && (
            <div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mb-2">
                Columns
              </p>
              <div className="flex gap-2 flex-wrap">
                {columnNames.map((name, i) => (
                  <span
                    key={name}
                    className="px-2 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
                  >
                    {i > 0 && <span className="text-neutral-300 dark:text-neutral-600 mr-2">→</span>}
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Instruction cards preview */}
          {structure?.instructionCards && structure.instructionCards.length > 0 && (
            <div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wide mb-2">
                Ready-to-run actions
              </p>
              <div className="space-y-1">
                {structure.instructionCards.map((ic, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {ic.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create button */}
          <button
            onClick={handleApplyResult}
            className="w-full px-4 py-3 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors text-sm"
          >
            Create Channel
          </button>
        </div>
      </div>
    );
  }

  // Options view
  return (
    <div className={compact ? 'p-4' : 'p-6'}>
      {/* Progress dots */}
      <div className="flex gap-1.5 mb-4">
        {stepOrder.map((step, i) => (
          <div
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < completedSteps
                ? 'bg-neutral-900 dark:bg-white'
                : i === currentStepIndex
                ? 'bg-neutral-400 dark:bg-neutral-500'
                : 'bg-neutral-200 dark:bg-neutral-700'
            }`}
          />
        ))}
      </div>

      {/* Current step */}
      {currentStep && (
        <div className="space-y-4">
          {/* Message - may have acknowledgment + question separated by newlines */}
          <div className="space-y-2">
            {currentStep.message.split('\n\n').map((paragraph, i) => (
              <p
                key={i}
                className={`leading-relaxed ${
                  i === 0 && currentStep.message.includes('\n\n')
                    ? 'text-neutral-500 dark:text-neutral-400 text-sm' // Acknowledgment
                    : 'text-neutral-700 dark:text-neutral-200 text-base' // Question
                }`}
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* Options or text input */}
          <div className="space-y-2">
            {/* Text-only step (no options) - fixed at bottom on mobile for keyboard */}
            {isTextOnlyStep ? (
              <div
                className="fixed sm:relative bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto p-4 sm:p-0 bg-white dark:bg-neutral-900 sm:bg-transparent border-t sm:border-t-0 border-neutral-200 dark:border-neutral-700 z-[60]"
                onTouchStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitCustom();
                      }
                    }}
                    onFocus={(e) => {
                      // Scroll input into view when keyboard opens on mobile
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 300);
                    }}
                    placeholder={currentStep.customPlaceholder || 'Type your answer...'}
                    className="flex-1 px-3 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400 transition-colors text-sm"
                  />
                  <button
                    onClick={submitCustom}
                    disabled={!customValue.trim()}
                    className="px-4 py-2.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Option buttons */}
                {currentStep.options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => selectOption(option.value, option.label)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors group"
                  >
                    <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100 group-hover:text-neutral-900 dark:group-hover:text-white">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {option.description}
                      </span>
                    )}
                  </button>
                ))}

                {/* Custom option */}
                {currentStep.allowCustom && !showCustomInput && (
                  <button
                    onClick={() => setShowCustomInput(true)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600 text-neutral-400 dark:text-neutral-500 hover:border-neutral-400 dark:hover:border-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors text-sm"
                  >
                    Something else...
                  </button>
                )}

                {/* Custom input (when "Something else" is clicked) - fixed at bottom on mobile for keyboard */}
                {showCustomInput && (
                  <div
                    className="fixed sm:relative bottom-0 left-0 right-0 sm:bottom-auto sm:left-auto sm:right-auto p-4 sm:p-0 bg-white dark:bg-neutral-900 sm:bg-transparent border-t sm:border-t-0 border-neutral-200 dark:border-neutral-700 z-[60]"
                    onTouchStart={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitCustom();
                          }
                          if (e.key === 'Escape') {
                            setShowCustomInput(false);
                            setCustomValue('');
                          }
                        }}
                        onFocus={(e) => {
                          // Scroll input into view when keyboard opens on mobile
                          setTimeout(() => {
                            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 300);
                        }}
                        placeholder={currentStep.customPlaceholder || 'Type your answer...'}
                        className="flex-1 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400 transition-colors text-sm"
                      />
                      <button
                        onClick={submitCustom}
                        disabled={!customValue.trim()}
                        className="px-4 py-2 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Cancel link */}
      {onCancel && (
        <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={onCancel}
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
