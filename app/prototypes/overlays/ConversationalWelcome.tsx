'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';
import { SporeBackground } from '@/components/ambient/SporeBackground';
import { useMessageTypewriter } from '@/lib/hooks/useTypewriter';
import {
  inferIntent,
  getIntentLabel,
  type ChannelIntent,
} from '@/lib/channelCreation/inferIntent';
import {
  getWorkflowSuggestions,
  suggestChannelName,
  suggestChannelDescription,
  getChannelInstructions,
  type WorkflowSuggestion,
} from '@/lib/channelCreation/generateShrooms';
import {
  getRecommendedTemplates,
  templateToInstructionCard,
  type ShroomTemplate,
  type ChannelContext,
} from '@/lib/channelCreation/shroomTemplates';

// Types shared with WelcomeFlowOverlay
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

export interface ConversationalWelcomeResultData {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

interface ConversationalWelcomeProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (result: ConversationalWelcomeResultData) => void;
  signInAction?: (formData: FormData) => Promise<void>;
  signInRedirectTo?: string;
  isSignedIn?: boolean;
  /** When true, shows welcome/onboarding language. When false, shows "new channel" language. Default: true */
  isWelcome?: boolean;
}

type FlowStep = 'greeting' | 'followup' | 'workflow' | 'shrooms' | 'ready';

interface Message {
  id: string;
  type: 'user' | 'kan';
  content: string;
  // Optional: chips to show after this message
  chips?: Array<{ label: string; value: string }>;
  // Optional: workflow options
  workflowOptions?: WorkflowSuggestion[];
  // Optional: shroom templates
  shroomOptions?: ShroomTemplate[];
}

// Quick-start chips for the opening state
// Targeted at: product managers, solo entrepreneurs, developers, creators
const QUICK_START_OPTIONS = [
  { label: 'Research competitors', value: 'research and track my competitors' },
  { label: 'Generate product ideas', value: 'brainstorm and develop product ideas' },
  { label: 'Plan a feature', value: 'plan and manage a feature or project' },
  { label: 'Track industry trends', value: 'track industry news and trends' },
];

export function ConversationalWelcome({
  isOpen,
  onClose,
  onCreate,
  signInAction,
  signInRedirectTo = '/',
  isSignedIn = false,
  isWelcome = true,
}: ConversationalWelcomeProps) {
  const [step, setStep] = useState<FlowStep>('greeting');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Channel configuration being built
  const [intent, setIntent] = useState<ChannelIntent | null>(null);
  const [userTopic, setUserTopic] = useState<string>('');
  const [specificDetails, setSpecificDetails] = useState<string>('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowSuggestion | null>(null);
  const [selectedShrooms, setSelectedShrooms] = useState<ShroomTemplate[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Typewriter effect for Kan's messages
  const { getDisplayText, isTyping: isKanTyping, skipToEnd, typingMessageId } = useMessageTypewriter(
    messages,
    { speed: 80 } // Characters per second
  );

  // Generate unique message ID
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('greeting');

      const greetingContent = isWelcome
        ? "Hi, I'm Kan.\n\nWelcome to Kanthink — a space to organize ideas, research topics, and get things done. I'll help you set up your first channel.\n\nWhat are you working on?"
        : "Another channel — love it!\n\nLet's set this one up. What's the focus?";

      setMessages([{
        id: generateId(),
        type: 'kan',
        content: greetingContent,
        chips: QUICK_START_OPTIONS,
      }]);
      setInputValue('');
      setIsLoading(false);
      setIsAiThinking(false);
      setIntent(null);
      setUserTopic('');
      setSpecificDetails('');
      setSelectedWorkflow(null);
      setSelectedShrooms([]);
    }
  }, [isOpen, isWelcome]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (isOpen && !isLoading) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isLoading, messages]);

  // Add a message to the conversation
  const addMessage = useCallback((msg: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: generateId() }]);
  }, []);

  // Handle initial direction selection
  const handleDirectionSubmit = useCallback(async (userInput: string) => {
    if (!userInput.trim()) return;

    setIsLoading(true);
    addMessage({ type: 'user', content: userInput });
    setUserTopic(userInput);

    // Infer intent
    const result = inferIntent(userInput);
    setIntent(result.intent);

    // Simulate AI thinking
    setIsAiThinking(true);
    await new Promise(r => setTimeout(r, 600));
    setIsAiThinking(false);

    // Ask follow-up question based on intent
    let followUpQuestion: string;
    let followUpChips: Array<{ label: string; value: string }> | undefined;

    if (result.intent === 'tracking' && userInput.toLowerCase().includes('competitor')) {
      followUpQuestion = "Got it — competitor research. What space or product are you tracking competitors for?";
    } else if (result.intent === 'ideas') {
      followUpQuestion = "Love it. What domain or problem space? The more specific, the better I can help.";
      followUpChips = [
        { label: 'SaaS / B2B', value: 'SaaS and B2B products' },
        { label: 'Consumer apps', value: 'consumer mobile apps' },
        { label: 'Developer tools', value: 'developer tools and APIs' },
        { label: 'Content / Media', value: 'content and media products' },
      ];
    } else if (result.intent === 'tasks') {
      followUpQuestion = "A space to plan and ship. What's the project or feature you're working on?";
    } else if (result.intent === 'tracking') {
      followUpQuestion = "I can help you stay on top of things. What industry or topic do you want to track?";
    } else {
      followUpQuestion = "Tell me more — what specifically do you want to focus on?";
    }

    addMessage({
      type: 'kan',
      content: followUpQuestion,
      chips: followUpChips,
    });

    setStep('followup');
    setIsLoading(false);
  }, [addMessage]);

  // Handle follow-up response (now we have enough context)
  const handleFollowupSubmit = useCallback(async (userInput: string) => {
    if (!userInput.trim()) return;

    setIsLoading(true);
    addMessage({ type: 'user', content: userInput });
    setSpecificDetails(userInput);

    // Simulate AI thinking
    setIsAiThinking(true);
    await new Promise(r => setTimeout(r, 500));
    setIsAiThinking(false);

    // Get workflow suggestions
    const workflows = getWorkflowSuggestions(intent || 'unknown');

    addMessage({
      type: 'kan',
      content: "Nice. Now let's set up your board. How do you want to organize things?",
      workflowOptions: workflows,
    });

    setStep('workflow');
    setIsLoading(false);
  }, [addMessage, intent]);

  // Handle workflow selection
  const handleWorkflowSelect = useCallback(async (workflow: WorkflowSuggestion) => {
    setIsLoading(true);
    addMessage({ type: 'user', content: workflow.label });
    setSelectedWorkflow(workflow);

    // Simulate AI thinking
    setIsAiThinking(true);
    await new Promise(r => setTimeout(r, 400));
    setIsAiThinking(false);

    // Get recommended shroom templates
    const fullTopic = specificDetails || userTopic;
    const templates = getRecommendedTemplates(intent || 'unknown', fullTopic);

    addMessage({
      type: 'kan',
      content: "Last step — pick your Shrooms. These are AI actions you can run anytime to generate or enhance cards.",
      shroomOptions: templates,
    });

    setStep('shrooms');
    setIsLoading(false);
  }, [addMessage, intent, userTopic, specificDetails]);

  // Handle shroom selection
  const handleShroomToggle = useCallback((template: ShroomTemplate) => {
    setSelectedShrooms(prev => {
      const exists = prev.find(s => s.id === template.id);
      if (exists) {
        return prev.filter(s => s.id !== template.id);
      } else {
        return [...prev, template];
      }
    });
  }, []);

  // Handle confirming shroom selection
  const handleShroomsConfirm = useCallback(async () => {
    if (selectedShrooms.length === 0) return;

    setIsLoading(true);
    const shroomNames = selectedShrooms.map(s => s.title).join(', ');
    addMessage({ type: 'user', content: `Selected: ${shroomNames}` });

    // Simulate AI thinking
    setIsAiThinking(true);
    await new Promise(r => setTimeout(r, 300));
    setIsAiThinking(false);

    const channelName = suggestChannelName(intent || 'unknown', specificDetails || userTopic);

    addMessage({
      type: 'kan',
      content: `Your channel "${channelName}" is ready.\n\nYou can always add more Shrooms later or tweak the settings. Let's go!`,
    });

    setStep('ready');
    setIsLoading(false);
  }, [addMessage, selectedShrooms, intent, userTopic, specificDetails]);

  // Handle creating the channel
  const handleCreate = useCallback(() => {
    if (!selectedWorkflow || !intent) return;

    const fullTopic = specificDetails || userTopic;
    const channelName = suggestChannelName(intent, fullTopic);
    const channelDescription = suggestChannelDescription(intent, fullTopic);
    const instructions = getChannelInstructions(intent, fullTopic);

    const columns = selectedWorkflow.columns.map((name, i) => ({
      name,
      description: i === 0 ? 'New items appear here' : `Items moved to ${name}`,
      isAiTarget: i === 0,
    }));

    // Build context to inject into Shroom instructions
    const shroomContext: ChannelContext = {
      topic: userTopic,
      details: specificDetails,
      channelName,
    };

    const instructionCards = selectedShrooms.map(template =>
      templateToInstructionCard(template, columns[0].name, shroomContext)
    );

    const result: ConversationalWelcomeResultData = {
      channelName,
      channelDescription,
      instructions,
      choices: {
        intent: intent,
        workflow: selectedWorkflow.value,
        topic: userTopic,
        details: specificDetails,
      },
      structure: {
        channelName,
        channelDescription,
        instructions,
        columns,
        instructionCards,
      },
    };

    onClose();
    onCreate(result);
  }, [selectedWorkflow, selectedShrooms, intent, userTopic, specificDetails, onClose, onCreate]);

  // Handle input submission based on current step
  const handleInputSubmit = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;

    const value = inputValue.trim();
    setInputValue('');

    if (step === 'greeting') {
      handleDirectionSubmit(value);
    } else if (step === 'followup') {
      handleFollowupSubmit(value);
    }
  }, [step, inputValue, isLoading, handleDirectionSubmit, handleFollowupSubmit]);

  // Handle chip click
  const handleChipClick = useCallback((value: string) => {
    if (isLoading) return;

    if (step === 'greeting') {
      handleDirectionSubmit(value);
    } else if (step === 'followup') {
      handleFollowupSubmit(value);
    }
  }, [step, isLoading, handleDirectionSubmit, handleFollowupSubmit]);

  // Handle keyboard
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleInputSubmit();
    }
  }, [handleInputSubmit]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const showInput = step === 'greeting' || step === 'followup';
  const lastMessage = messages[messages.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
      {/* Spore particles background */}
      <SporeBackground
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
        id="welcome-spores"
      />

      {/* Header */}
      <div className="relative z-10 flex-shrink-0 flex items-center justify-between px-6 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://res.cloudinary.com/dcht3dytz/image/upload/v1769532115/kanthink-full-v1_lc5ai6.svg"
          alt="Kanthink"
          className="h-6"
        />
        <button
          onClick={onClose}
          className="text-sm text-neutral-400 hover:text-white transition-colors"
        >
          Skip for now
        </button>
      </div>

      {/* Messages area */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {messages.map((message) => {
            const isCurrentlyTyping = typingMessageId === message.id;
            const displayText = getDisplayText(message.id, message.content, message.type);
            const showOptions = message === lastMessage && !isLoading && !isKanTyping;

            return (
              <div key={message.id}>
                {/* Message bubble */}
                <div className={`flex items-start gap-3 ${message.type === 'user' ? 'justify-end' : ''}`}>
                  {message.type === 'kan' && (
                    <div className="flex-shrink-0 mt-1">
                      <KanthinkIcon size={24} className="text-violet-400" />
                    </div>
                  )}
                  <div
                    onClick={isCurrentlyTyping ? skipToEnd : undefined}
                    className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                      message.type === 'kan'
                        ? `bg-neutral-900 border border-neutral-800 ${isCurrentlyTyping ? 'cursor-pointer' : ''}`
                        : 'bg-violet-600'
                    }`}
                  >
                    <p className="text-neutral-100 text-sm leading-relaxed whitespace-pre-line">
                      {displayText}
                      {isCurrentlyTyping && (
                        <span className="inline-block w-0.5 h-4 ml-0.5 bg-violet-400 animate-pulse align-middle" />
                      )}
                    </p>
                  </div>
                </div>

                {/* Chips after Kan's message - only show after typing completes */}
                {message.type === 'kan' && message.chips && showOptions && (
                  <div className="flex flex-wrap gap-2 mt-4 ml-9 animate-in fade-in duration-300">
                    {message.chips.map((chip) => (
                      <button
                        key={chip.value}
                        onClick={() => handleChipClick(chip.value)}
                        className="px-3 py-2 text-sm rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-300 hover:border-violet-500 hover:text-violet-300 hover:bg-violet-900 transition-all"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Workflow options - only show after typing completes */}
                {message.type === 'kan' && message.workflowOptions && showOptions && (
                  <div className="space-y-2 mt-4 ml-9 animate-in fade-in duration-300">
                    {message.workflowOptions.map((workflow) => (
                      <button
                        key={workflow.value}
                        onClick={() => handleWorkflowSelect(workflow)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-neutral-900 border border-neutral-700 hover:border-violet-500 hover:bg-violet-900 transition-all group"
                      >
                        <div className="font-medium text-neutral-200 group-hover:text-violet-300 text-sm">
                          {workflow.label}
                        </div>
                        <div className="text-xs text-neutral-500 group-hover:text-neutral-400 mt-0.5">
                          {workflow.description}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Shroom options - only show after typing completes */}
                {message.type === 'kan' && message.shroomOptions && showOptions && (
                  <div className="mt-4 ml-9 animate-in fade-in duration-300">
                    <div className="grid grid-cols-2 gap-2">
                      {message.shroomOptions.map((template) => {
                        const isSelected = selectedShrooms.some(s => s.id === template.id);
                        return (
                          <button
                            key={template.id}
                            onClick={() => handleShroomToggle(template)}
                            className={`text-left px-4 py-3 rounded-xl border transition-all ${
                              isSelected
                                ? 'border-violet-500 bg-violet-900'
                                : 'bg-neutral-900 border-neutral-700 hover:border-neutral-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base">{template.icon}</span>
                              <span className={`text-sm font-medium ${isSelected ? 'text-violet-300' : 'text-neutral-200'}`}>
                                {template.title}
                              </span>
                              {isSelected && (
                                <svg className="w-4 h-4 text-violet-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500">{template.description}</p>
                          </button>
                        );
                      })}
                    </div>
                    {selectedShrooms.length > 0 && (
                      <button
                        onClick={handleShroomsConfirm}
                        className="mt-4 w-full px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-colors"
                      >
                        Continue with {selectedShrooms.length} Shroom{selectedShrooms.length > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* AI thinking indicator */}
          {isAiThinking && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                <KanthinkIcon size={24} className="text-violet-400" />
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Ready state - Create button */}
          {step === 'ready' && !isLoading && (
            <div className="ml-9 space-y-4">
              {/* Sign-in prompt for non-signed-in users */}
              {!isSignedIn && signInAction && (
                <div className="text-center py-2">
                  <p className="text-xs text-neutral-500 mb-2">
                    Sign in to save your channel and unlock AI features
                  </p>
                  <form action={signInAction} className="inline-block">
                    <input type="hidden" name="redirectTo" value={signInRedirectTo} />
                    <button
                      type="submit"
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      Sign in with Google
                    </button>
                  </form>
                </div>
              )}

              <button
                onClick={handleCreate}
                className="w-full px-6 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-base transition-colors flex items-center justify-center gap-2"
              >
                Create Channel
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area - fixed at bottom */}
      {showInput && (
        <div className="relative z-10 flex-shrink-0">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-full px-4 py-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer..."
                disabled={isLoading}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none py-1"
              />
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim() || isLoading}
                className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
                  inputValue.trim() && !isLoading
                    ? 'text-violet-400 hover:text-violet-300 hover:bg-violet-900/30'
                    : 'text-neutral-600 cursor-not-allowed'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
