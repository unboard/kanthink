'use client';

import { useState } from 'react';
import type { Channel, Card } from '@/lib/types';
import { useStore } from '@/lib/store';
import { useSettingsStore } from '@/lib/settingsStore';
import { Drawer, Button, Input } from '@/components/ui';

interface Question {
  question: string;
  context: string;
  suggestedAnswers: string[];
}

interface QuestionsDrawerProps {
  channel: Channel;
  cards: Record<string, Card>;
  isOpen: boolean;
  onClose: () => void;
}

function QuestionItem({
  question,
  onAnswer,
  onDismiss,
}: {
  question: Question;
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
}) {
  const [customAnswer, setCustomAnswer] = useState('');
  const [showContext, setShowContext] = useState(false);

  const handleChipClick = (answer: string) => {
    onAnswer(answer);
  };

  const handleCustomSubmit = () => {
    if (customAnswer.trim()) {
      onAnswer(customAnswer.trim());
      setCustomAnswer('');
    }
  };

  return (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {question.question}
        </p>
        <button
          onClick={onDismiss}
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex-shrink-0"
          title="Skip this question"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <button
        onClick={() => setShowContext(!showContext)}
        className="text-xs text-violet-600 dark:text-violet-400 hover:underline mb-3"
      >
        {showContext ? 'Hide context' : 'Why am I being asked this?'}
      </button>

      {showContext && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400 bg-white dark:bg-neutral-900 rounded p-2 mb-3">
          {question.context}
        </p>
      )}

      {/* Answer chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {question.suggestedAnswers.map((answer, index) => (
          <button
            key={index}
            onClick={() => handleChipClick(answer)}
            className="px-3 py-1.5 text-sm rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
          >
            {answer}
          </button>
        ))}
      </div>

      {/* Custom answer input */}
      <div className="flex gap-2">
        <Input
          value={customAnswer}
          onChange={(e) => setCustomAnswer(e.target.value)}
          placeholder="Or type your own answer..."
          className="flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCustomSubmit();
            }
          }}
        />
        <Button
          onClick={handleCustomSubmit}
          disabled={!customAnswer.trim()}
          size="sm"
        >
          Submit
        </Button>
      </div>
    </div>
  );
}

export function QuestionsDrawer({ channel, cards, isOpen, onClose }: QuestionsDrawerProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const addQuestion = useStore((s) => s.addQuestion);
  const answerQuestion = useStore((s) => s.answerQuestion);
  const dismissQuestion = useStore((s) => s.dismissQuestion);
  const updateChannel = useStore((s) => s.updateChannel);
  const aiSettings = useSettingsStore((s) => s.ai);

  const fetchQuestions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          cards,
          aiConfig: {
            provider: aiSettings.provider,
            apiKey: aiSettings.apiKey,
            model: aiSettings.model || undefined,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate questions');
      }

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        setQuestions([]);
      } else {
        setQuestions(result.questions || []);
      }
    } catch (err) {
      console.error('Failed to fetch questions:', err);
      setError('Failed to generate questions. Please try again.');
      setQuestions([]);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  };

  // Fetch questions when drawer opens
  const handleOpen = () => {
    if (!hasLoaded) {
      fetchQuestions();
    }
  };

  // Reset state when drawer closes
  const handleClose = () => {
    setHasLoaded(false);
    setQuestions([]);
    setError(null);
    onClose();
  };

  const handleAnswer = (question: Question, answer: string) => {
    // Add question to channel's questions (for history)
    addQuestion(channel.id, {
      question: question.question,
      context: question.context,
      status: 'pending',
      suggestedAnswers: question.suggestedAnswers,
    });

    // Get the question ID that was just added (it's the last one)
    const channelQuestions = useStore.getState().channels[channel.id]?.questions ?? [];
    const addedQuestion = channelQuestions[channelQuestions.length - 1];

    if (addedQuestion) {
      // Mark it as answered
      answerQuestion(channel.id, addedQuestion.id, answer);
    }

    // Append to AI instructions
    const currentInstructions = channel.aiInstructions || '';
    const newInstructions = currentInstructions
      ? `${currentInstructions}\n\nUser preference: ${answer}`
      : `User preference: ${answer}`;

    updateChannel(channel.id, { aiInstructions: newInstructions });

    // Remove from local questions list
    setQuestions((prev) => prev.filter((q) => q.question !== question.question));
  };

  const handleDismiss = (question: Question) => {
    // Add as dismissed to channel history
    addQuestion(channel.id, {
      question: question.question,
      context: question.context,
      status: 'pending',
      suggestedAnswers: question.suggestedAnswers,
    });

    const channelQuestions = useStore.getState().channels[channel.id]?.questions ?? [];
    const addedQuestion = channelQuestions[channelQuestions.length - 1];

    if (addedQuestion) {
      dismissQuestion(channel.id, addedQuestion.id);
    }

    // Remove from local questions list
    setQuestions((prev) => prev.filter((q) => q.question !== question.question));
  };

  // Trigger fetch when isOpen changes to true
  if (isOpen && !hasLoaded && !isLoading) {
    handleOpen();
  }

  return (
    <Drawer isOpen={isOpen} onClose={handleClose} width="md" floating>
      <div className="p-6 pt-12">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
          Questions
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          Help me understand what you want so I can suggest better cards for this channel.
        </p>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-neutral-500">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Generating questions...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg p-4 mb-4">
            {error}
            <button
              onClick={fetchQuestions}
              className="ml-2 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && questions.length === 0 && hasLoaded && (
          <div className="text-center py-12">
            <p className="text-neutral-500 dark:text-neutral-400 mb-4">
              No questions right now. Your channel instructions are clear!
            </p>
            <Button variant="secondary" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}

        {!isLoading && questions.length > 0 && (
          <div className="space-y-4">
            {questions.map((question, index) => (
              <QuestionItem
                key={`${question.question}-${index}`}
                question={question}
                onAnswer={(answer) => handleAnswer(question, answer)}
                onDismiss={() => handleDismiss(question)}
              />
            ))}
          </div>
        )}

        {!isLoading && questions.length > 0 && (
          <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <Button variant="ghost" onClick={handleClose} className="w-full">
              Done for now
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  );
}
