'use client';

import { useState, useEffect } from 'react';
import { useSettingsStore, type LLMProvider, fetchAIStatus } from '@/lib/settingsStore';
import { Button, Input } from '@/components/ui';

const PROVIDERS: { value: LLMProvider; label: string; description: string }[] = [
  { value: 'openai', label: 'OpenAI', description: 'GPT models' },
  { value: 'google', label: 'Google', description: 'Gemini models' },
];

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-5',
  google: 'gemini-2.5-flash',
};

const MODEL_OPTIONS: Record<LLMProvider, { value: string; label: string }[]> = {
  openai: [
    { value: '', label: 'Default (GPT-5)' },
    { value: 'gpt-5.2', label: 'GPT-5.2' },
    { value: 'gpt-5.1', label: 'GPT-5.1' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { value: 'gpt-5-pro', label: 'GPT-5 Pro' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'other', label: 'Other...' },
  ],
  google: [
    { value: '', label: 'Default (Gemini 2.5 Flash)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' },
    { value: 'other', label: 'Other...' },
  ],
};

export function AISettings() {
  const ai = useSettingsStore((s) => s.ai);
  const updateAISettings = useSettingsStore((s) => s.updateAISettings);
  const hasHydrated = useSettingsStore((s) => s._hasHydrated);
  const hasByokConfigured = useSettingsStore((s) => s._hasByokConfigured);
  const setHasByokConfigured = useSettingsStore((s) => s.setHasByokConfigured);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string>('');
  const [clearStatus, setClearStatus] = useState<'idle' | 'clearing' | 'success' | 'error'>('idle');

  // Local state for form
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Check if the stored model is a custom one (not in the predefined list)
  const isModelInOptions = (modelValue: string, provider: LLMProvider) => {
    return MODEL_OPTIONS[provider].some(
      (opt) => opt.value === modelValue && opt.value !== 'other'
    );
  };

  // Sync local state with store after hydration
  useEffect(() => {
    if (hasHydrated) {
      setModel(ai.model);
      // If there's a model set and it's not in our options, show custom input
      if (ai.model && !isModelInOptions(ai.model, ai.provider)) {
        setIsCustomModel(true);
      } else {
        setIsCustomModel(false);
      }
    }
  }, [hasHydrated, ai.model, ai.provider]);

  const handleProviderChange = (provider: LLMProvider) => {
    updateAISettings({ provider, model: '' });
    setModel('');
    setIsCustomModel(false);
    setSaveStatus('idle');
  };

  const saveModelToServer = async (modelValue: string) => {
    if (!hasByokConfigured) return;
    try {
      await fetch('/api/byok/update-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelValue }),
      });
    } catch {
      // Silently fail - localStorage still has the value
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
      saveModelToServer(value);
    }
  };

  const handleCustomModelBlur = () => {
    if (model !== ai.model) {
      updateAISettings({ model });
      saveModelToServer(model);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey) {
      setSaveStatus('error');
      setSaveError('Please enter an API key');
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    try {
      const response = await fetch('/api/byok/save', {
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
        setSaveStatus('success');
        setHasByokConfigured(true);
        setApiKey(''); // Clear the input
        setShowKeyInput(false);
        // Refresh status from server
        await fetchAIStatus();
      } else {
        setSaveStatus('error');
        setSaveError(data.error || 'Failed to save API key');
      }
    } catch {
      setSaveStatus('error');
      setSaveError('Network error - could not save API key');
    }
  };

  const handleClearKey = async () => {
    setClearStatus('clearing');

    try {
      const response = await fetch('/api/byok/clear', {
        method: 'POST',
      });

      if (response.ok) {
        setClearStatus('success');
        setHasByokConfigured(false);
        setSaveStatus('idle');
        // Reset after a moment
        setTimeout(() => setClearStatus('idle'), 2000);
      } else {
        setClearStatus('error');
      }
    } catch {
      setClearStatus('error');
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
          Choose your LLM provider and configure your API key
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

      {/* API Key Status */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          API Key
        </label>

        {hasByokConfigured && !showKeyInput ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <div className="font-medium text-green-800 dark:text-green-200">
                  API key configured
                </div>
                <div className="text-sm text-green-600 dark:text-green-400">
                  Your {ai.provider === 'openai' ? 'OpenAI' : 'Google'} API key is securely stored
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowKeyInput(true)}
              >
                Update Key
              </Button>
              <Button
                variant="secondary"
                onClick={handleClearKey}
                disabled={clearStatus === 'clearing'}
                className="text-red-600 hover:text-red-700 dark:text-red-400"
              >
                {clearStatus === 'clearing' ? 'Clearing...' : 'Clear Key'}
              </Button>
            </div>
            {clearStatus === 'success' && (
              <p className="text-sm text-green-600 dark:text-green-400">
                API key cleared
              </p>
            )}
            {clearStatus === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400">
                Failed to clear API key
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${ai.provider === 'openai' ? 'OpenAI' : 'Google'} API key`}
                className="flex-1"
              />
              <Button
                variant="primary"
                onClick={handleSaveKey}
                disabled={saveStatus === 'saving' || !apiKey}
              >
                {saveStatus === 'saving' ? 'Saving...' : 'Save Key'}
              </Button>
              {showKeyInput && hasByokConfigured && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowKeyInput(false);
                    setApiKey('');
                    setSaveStatus('idle');
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            {saveStatus === 'success' && (
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                API key saved successfully
              </p>
            )}
            {saveStatus === 'error' && (
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {saveError}
              </p>
            )}
            <p className="text-xs text-neutral-500">
              Your API key is encrypted and stored securely on our servers. It is never stored in your browser.
            </p>
          </div>
        )}
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
