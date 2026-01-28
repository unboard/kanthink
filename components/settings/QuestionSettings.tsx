'use client';

import { useSettingsStore, type QuestionFrequency } from '@/lib/settingsStore';

const FREQUENCY_OPTIONS: {
  value: QuestionFrequency;
  label: string;
  description: string;
}[] = [
  {
    value: 'off',
    label: 'Off',
    description: 'No proactive questions (drawer still accessible)',
  },
  {
    value: 'light',
    label: 'Light',
    description: '1 question when entering a channel with activity',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    description: 'Up to 3 per session, ~5 min apart',
  },
];

export function QuestionSettings() {
  const questionFrequency = useSettingsStore((s) => s.questionFrequency);
  const setQuestionFrequency = useSettingsStore((s) => s.setQuestionFrequency);

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
        Question Frequency
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        How often should Kanthink ask clarifying questions to improve suggestions?
      </p>

      <div className="space-y-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
              questionFrequency === option.value
                ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800'
                : 'bg-neutral-50 dark:bg-neutral-800/50 border border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <input
              type="radio"
              name="questionFrequency"
              value={option.value}
              checked={questionFrequency === option.value}
              onChange={(e) =>
                setQuestionFrequency(e.target.value as QuestionFrequency)
              }
              className="mt-1 h-4 w-4 text-violet-600 focus:ring-violet-500 border-neutral-300 dark:border-neutral-600"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-neutral-900 dark:text-white">
                {option.label}
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">
                {option.description}
              </div>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}
