'use client';

import { useState, useEffect } from 'react';
import { useSettingsStore, type LLMProvider } from '@/lib/settingsStore';
import { Button, Input } from '@/components/ui';

const PROVIDERS: { value: LLMProvider; label: string; description: string }[] = [
  { value: 'anthropic', label: 'Anthropic', description: 'Claude models' },
  { value: 'openai', label: 'OpenAI', description: 'GPT models' },
];

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

const MODEL_OPTIONS: Record<LLMProvider, { value: string; label: string }[]> = {
  anthropic: [
    { value: '', label: 'Default (Claude Sonnet 4)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { value: 'other', label: 'Other...' },
  ],
  openai: [
    { value: '', label: 'Default (GPT-4o)' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'o1', label: 'o1' },
    { value: 'o1-mini', label: 'o1 Mini' },
    { value: 'o3-mini', label: 'o3 Mini' },
    { value: 'other', label: 'Other...' },
  ],
};

export function AISettings() {
  const ai = useSettingsStore((s) => s.ai);
  const updateAISettings = useSettingsStore((s) => s.updateAISettings);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);

  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');

  // Local state for form
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);

  // Check if the stored model is a custom one (not in the predefined list)
  const isModelInOptions = (modelValue: string, provider: LLMProvider) => {
    return MODEL_OPTIONS[provider].some(
      (opt) => opt.value === modelValue && opt.value !== 'other'
    );
  };

  // Sync local state with store after hydration
  useEffect(() => {
    if (hasHydrated) {
      setApiKey(ai.apiKey);
      setModel(ai.model);
      // If there's a model set and it's not in our options, show custom input
      if (ai.model && !isModelInOptions(ai.model, ai.provider)) {
        setIsCustomModel(true);
      } else {
        setIsCustomModel(false);
      }
    }
  }, [hasHydrated, ai.apiKey, ai.model, ai.provider]);

  const handleProviderChange = (provider: LLMProvider) => {
    updateAISettings({ provider, model: '' });
    setModel('');
    setIsCustomModel(false);
    setTestStatus('idle');
  };

  const handleApiKeyBlur = () => {
    if (apiKey !== ai.apiKey) {
      updateAISettings({ apiKey });
      setTestStatus('idle');
    }
  };

  const handleModelSelect = (value: string) => {
    if (value === 'other') {
      setIsCustomModel(true);
      setModel('');
    } else {
      setIsCustomModel(false);
      setModel(value);
      updateAISettings({ model: value });
    }
  };

  const handleCustomModelBlur = () => {
    if (model !== ai.model) {
      updateAISettings({ model });
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey) {
      setTestStatus('error');
      setTestError('Please enter an API key');
      return;
    }

    setTestStatus('testing');
    setTestError('');

    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: ai.provider,
          apiKey,
          model: model || DEFAULT_MODELS[ai.provider],
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestStatus('success');
        // Save the key if test succeeds
        updateAISettings({ apiKey });
      } else {
        setTestStatus('error');
        setTestError(data.error || 'Connection failed');
      }
    } catch {
      setTestStatus('error');
      setTestError('Network error - could not test connection');
    }
  };

  if (!hasHydrated) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">AI Provider</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded" />
          <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">AI Provider</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Choose your LLM provider and enter your API key
        </p>
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Provider
        </label>
        <div className="flex gap-4">
          {PROVIDERS.map((p) => (
            <label
              key={p.value}
              className={`
                flex flex-1 cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors
                ${
                  ai.provider === p.value
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600'
                }
              `}
            >
              <input
                type="radio"
                name="provider"
                value={p.value}
                checked={ai.provider === p.value}
                onChange={() => handleProviderChange(p.value)}
                className="h-4 w-4 text-violet-600"
              />
              <div>
                <div className="font-medium text-neutral-900 dark:text-white">{p.label}</div>
                <div className="text-sm text-neutral-500">{p.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          API Key
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={handleApiKeyBlur}
              placeholder={`Enter your ${ai.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            >
              {showKey ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <Button
            variant="secondary"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? 'Testing...' : 'Test'}
          </Button>
        </div>
        {testStatus === 'success' && (
          <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Connected successfully
          </p>
        )}
        {testStatus === 'error' && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {testError}
          </p>
        )}
        <p className="text-xs text-neutral-500">
          Your API key is stored locally in your browser and never sent to our servers.
        </p>
      </div>

      {/* Model Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Model
        </label>
        <select
          value={isCustomModel ? 'other' : model}
          onChange={(e) => handleModelSelect(e.target.value)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        >
          {MODEL_OPTIONS[ai.provider].map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {isCustomModel && (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={handleCustomModelBlur}
            placeholder="Enter model ID (e.g., gpt-4-0125-preview)"
            className="mt-2"
          />
        )}
        <p className="text-xs text-neutral-500">
          {isCustomModel
            ? 'Enter the exact model ID from your provider.'
            : 'Select a model or choose "Other" to enter a custom model ID.'}
        </p>
      </div>
    </div>
  );
}
