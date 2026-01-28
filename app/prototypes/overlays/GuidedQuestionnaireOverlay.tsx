'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '@/lib/settingsStore';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

interface GuideStep {
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

interface ChannelStructure {
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

interface GuideResult {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

export interface GuideResultData {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

interface GuidedQuestionnaireOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (result: GuideResultData) => void;
}

type ViewState = 'loading' | 'options' | 'result' | 'error';

export function GuidedQuestionnaireOverlay({
  isOpen,
  onClose,
  onCreate,
}: GuidedQuestionnaireOverlayProps) {
  const hasStartedRef = useRef(false);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [currentStep, setCurrentStep] = useState<GuideStep | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [choiceLabels, setChoiceLabels] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GuideResult | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const ai = useSettingsStore((s) => s.ai);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      hasStartedRef.current = false;
      setViewState('loading');
      setCurrentStep(null);
      setChoices({});
      setChoiceLabels({});
      setResult(null);
      setShowCustomInput(false);
      setCustomValue('');
      setError(null);
      setSelectedOption(null);
    }
  }, [isOpen]);

  // Start the guide
  useEffect(() => {
    if (!isOpen || hasStartedRef.current) return;
    hasStartedRef.current = true;
    startGuide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const startGuide = async () => {
    setViewState('loading');

    try {
      const response = await fetch('/api/instruction-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          choices: {},
          aiConfig: {
            provider: ai.provider,
            apiKey: ai.apiKey,
            model: ai.model,
          },
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
  }) => {
    if (data.complete && data.result) {
      setResult(data.result);
      setViewState('result');
      return;
    }

    if (data.step) {
      setCurrentStep(data.step);
      setViewState('options');
      setSelectedOption(null);
    }
  };

  const selectOption = useCallback(
    async (value: string, label: string) => {
      if (!currentStep || viewState === 'loading') return;

      setSelectedOption(value);

      // Brief delay for selection animation
      await new Promise((r) => setTimeout(r, 200));

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
            choices: newChoices,
            choiceLabels: newLabels,
            lastChoice: { stepId: currentStep.id, value, label },
            aiConfig: {
              provider: ai.provider,
              apiKey: ai.apiKey,
              model: ai.model,
            },
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
    },
    [currentStep, viewState, choices, choiceLabels, ai]
  );

  const submitCustom = () => {
    if (!customValue.trim()) return;
    selectOption(customValue.trim(), customValue.trim());
  };

  const handleCreate = () => {
    if (result) {
      onCreate({
        channelName: result.channelName,
        channelDescription: result.channelDescription,
        instructions: result.instructions,
        choices: result.choices,
        structure: result.structure,
      });
    }
  };

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Progress calculation
  const hasDetailStep = currentStep?.id === 'detail' || choices.detail !== undefined;
  const stepOrder = hasDetailStep
    ? ['purpose', 'topic', 'detail', 'workflow', 'style']
    : ['purpose', 'topic', 'workflow', 'style'];
  const currentStepIndex = currentStep ? stepOrder.indexOf(currentStep.id) : -1;
  const completedSteps = Object.keys(choices).length;
  const totalSteps = stepOrder.length;
  const progressPercent = viewState === 'result' ? 100 : (completedSteps / totalSteps) * 100;

  const isTextOnlyStep = currentStep && currentStep.options.length === 0 && currentStep.allowCustom;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - full height on mobile, centered on desktop */}
      <div className="relative z-10 w-full sm:max-w-xl max-h-[100dvh] sm:max-h-[90vh] sm:m-4 bg-neutral-950 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col border border-neutral-800 safe-area-inset-bottom">
        {/* Progress bar */}
        <div className="h-0.5 bg-neutral-800 flex-shrink-0">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800 flex-shrink-0"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex gap-1.5">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
            />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <KanthinkIcon size={14} className="ml-2 text-violet-400" />
          <span className="text-xs text-neutral-500 font-mono">kan://new-channel</span>
        </div>

        {/* Content - scrollable on mobile */}
        <div className="p-6 sm:p-8 flex-1 overflow-y-auto overscroll-contain">
          {/* Error state */}
          {viewState === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-neutral-400 mb-6">{error}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    hasStartedRef.current = false;
                    setError(null);
                    startGuide();
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-lg"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {viewState === 'loading' && (
            <div className="text-center py-12">
              <div className="inline-flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-neutral-400 font-mono">
                {completedSteps === 0 ? 'Getting started...' : completedSteps >= 4 ? 'Creating your channel...' : 'Thinking...'}
              </p>
            </div>
          )}

          {/* Question state */}
          {viewState === 'options' && currentStep && (
            <div className="space-y-6">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-900/30 text-violet-400 font-medium">
                  {currentStepIndex + 1}
                </span>
                <span>of {totalSteps}</span>
              </div>

              {/* Question */}
              <div className="space-y-2">
                {currentStep.message.split('\n\n').map((paragraph, i) => (
                  <p
                    key={i}
                    className={
                      i === 0 && currentStep.message.includes('\n\n')
                        ? 'text-neutral-400 text-sm'
                        : 'text-xl font-medium text-white'
                    }
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* Options */}
              <div className="space-y-2">
                {isTextOnlyStep ? (
                  <div className="space-y-3">
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
                      placeholder={currentStep.customPlaceholder || 'Type your answer...'}
                      autoFocus
                      className="w-full px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-mono"
                    />
                    <button
                      onClick={submitCustom}
                      disabled={!customValue.trim()}
                      className="w-full px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                ) : (
                  <>
                    {currentStep.options.map((option, index) => (
                      <button
                        key={option.value}
                        onClick={() => selectOption(option.value, option.label)}
                        disabled={selectedOption !== null}
                        className={`
                          w-full text-left px-5 py-4 rounded-xl border transition-all duration-200 group
                          ${
                            selectedOption === option.value
                              ? 'border-violet-500 bg-violet-900/20 scale-[0.98]'
                              : selectedOption !== null
                              ? 'border-neutral-800 opacity-50'
                              : 'border-neutral-800 hover:border-violet-700 hover:bg-neutral-800/50'
                          }
                        `}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={`
                              flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                              ${
                                selectedOption === option.value
                                  ? 'border-violet-500 bg-violet-500'
                                  : 'border-neutral-600 group-hover:border-violet-400'
                              }
                            `}
                          >
                            {selectedOption === option.value && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block font-medium text-white">
                              {option.label}
                            </span>
                            {option.description && (
                              <span className="block text-sm text-neutral-400 mt-0.5">
                                {option.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}

                    {/* Custom option */}
                    {currentStep.allowCustom && !showCustomInput && (
                      <button
                        onClick={() => setShowCustomInput(true)}
                        disabled={selectedOption !== null}
                        className="w-full text-left px-5 py-4 rounded-xl border border-dashed border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-6 h-6 rounded-full border-2 border-neutral-600 flex items-center justify-center">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                          <span>Something else...</span>
                        </div>
                      </button>
                    )}

                    {/* Custom input field */}
                    {showCustomInput && (
                      <div className="flex gap-2 mt-2">
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
                          placeholder={currentStep.customPlaceholder || 'Type your answer...'}
                          autoFocus
                          className="flex-1 px-4 py-3 rounded-xl border border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500 focus:outline-none focus:border-violet-500 transition-colors font-mono"
                        />
                        <button
                          onClick={submitCustom}
                          disabled={!customValue.trim()}
                          className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                        >
                          Go
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Result state */}
          {viewState === 'result' && result && (
            <div className="space-y-6">
              {/* Success header */}
              <div className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  {result.channelName}
                </h2>
                <p className="text-sm text-neutral-400">
                  {result.channelDescription}
                </p>
              </div>

              {/* Channel preview */}
              {result.structure && (
                <div className="space-y-4 p-5 rounded-xl bg-neutral-800/50 border border-neutral-800">
                  {/* Columns */}
                  {result.structure.columns.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 font-mono">
                        Columns
                      </p>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {result.structure.columns.map((col, i) => (
                          <div key={col.name} className="flex items-center">
                            {i > 0 && (
                              <svg className="w-4 h-4 text-neutral-600 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                            <span className="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 text-neutral-300 whitespace-nowrap border border-neutral-700">
                              {col.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {result.structure.instructionCards && result.structure.instructionCards.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2 font-mono">
                        AI Actions
                      </p>
                      <div className="space-y-1.5">
                        {result.structure.instructionCards.map((ic, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-800 text-sm border border-neutral-700"
                          >
                            <div className="w-6 h-6 rounded bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </div>
                            <span className="text-neutral-300">{ic.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Create button */}
              <button
                onClick={handleCreate}
                className="w-full px-5 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
              >
                Create Channel
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {viewState === 'options' && (
          <div
            className="px-6 sm:px-8 py-4 border-t border-neutral-800 flex justify-between items-center flex-shrink-0"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={onClose}
              className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors font-mono"
            >
              [esc] cancel
            </button>
            <div className="text-xs text-neutral-500 font-mono hidden sm:block">
              Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">1</kbd>-<kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400">{currentStep?.options.length || 4}</kbd> to select
            </div>
          </div>
        )}
        {/* Safe area spacer when no footer */}
        {viewState !== 'options' && (
          <div className="flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
        )}
      </div>
    </div>
  );
}
