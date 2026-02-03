'use client';

import { useState, useEffect, useCallback } from 'react';
import { KanthinkIcon } from '@/components/icons/KanthinkIcon';

// Types shared with GuidedQuestionnaireOverlay
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

export interface WelcomeFlowResultData {
  channelName: string;
  channelDescription: string;
  instructions: string;
  choices: Record<string, string>;
  structure?: ChannelStructure;
}

interface WorkflowOption {
  label: string;
  value: string;
  description: string;
}

interface WelcomeFlowOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (result: WelcomeFlowResultData) => void;
  signInAction?: (formData: FormData) => Promise<void>;
  signInRedirectTo?: string;
  isSignedIn?: boolean;
}

type Scene = 'intro' | 'purpose' | 'workflow' | 'signin' | 'ready';

// Purpose presets - no open-ended text
const PURPOSE_OPTIONS = [
  { label: 'Learning', value: 'learning', description: 'Explore topics and build knowledge' },
  { label: 'Ideas', value: 'ideas', description: 'Brainstorm and capture creative thoughts' },
  { label: 'Projects', value: 'projects', description: 'Organize work and track progress' },
  { label: 'Tracking', value: 'tracking', description: 'Monitor topics that matter to you' },
];

// Default workflows per purpose (fallback if AI generation fails)
const DEFAULT_WORKFLOWS: Record<string, WorkflowOption[]> = {
  learning: [
    { label: 'Discover → Review → Archive', value: 'discover-review', description: 'Explore and curate the best content' },
    { label: 'To Learn → Learning → Learned', value: 'learning-progress', description: 'Track your learning journey' },
    { label: 'New → Important → Reference', value: 'curation', description: 'Build a reference library' },
  ],
  ideas: [
    { label: 'Inbox → Promising → Develop', value: 'idea-pipeline', description: 'Filter and refine your best ideas' },
    { label: 'Spark → Draft → Ready', value: 'creative-flow', description: 'Evolve ideas into finished pieces' },
    { label: 'Raw → Like → Dislike', value: 'evaluate', description: 'Sort ideas by gut reaction' },
  ],
  projects: [
    { label: 'Backlog → This Week → Done', value: 'timeboxed', description: 'Focus on what matters now' },
    { label: 'To Do → Doing → Done', value: 'kanban', description: 'Classic progress tracking' },
    { label: 'Ideas → Planning → Active', value: 'project-stages', description: 'From concept to execution' },
  ],
  tracking: [
    { label: 'New → Important → Reviewed', value: 'news-flow', description: 'Stay on top of updates' },
    { label: 'Watching → Flagged → Archive', value: 'monitor', description: 'Track what needs attention' },
    { label: 'Inbox → Act On → Reference', value: 'action-oriented', description: 'Turn updates into actions' },
  ],
};

// Derive channel name from purpose
function getChannelName(purpose: string): string {
  const names: Record<string, string> = {
    learning: 'Learning Hub',
    ideas: 'Idea Space',
    projects: 'Project Board',
    tracking: 'Watch List',
  };
  return names[purpose] || 'New Channel';
}

// Derive channel description from purpose
function getChannelDescription(purpose: string): string {
  const descriptions: Record<string, string> = {
    learning: 'A space to explore topics and build knowledge',
    ideas: 'Capture and develop creative thoughts',
    projects: 'Organize work and track progress',
    tracking: 'Monitor topics that matter to you',
  };
  return descriptions[purpose] || 'A new Kanthink channel';
}

// Derive AI instructions from purpose
function getAIInstructions(purpose: string): string {
  const instructions: Record<string, string> = {
    learning: 'Generate interesting insights, questions, and resources. Focus on helping the user explore and understand new concepts. Create cards that encourage curiosity and deeper learning.',
    ideas: 'Generate creative ideas and thought-provoking prompts. Suggest unexpected connections and novel angles. Create cards that spark imagination and inspire action.',
    projects: 'Generate actionable tasks and helpful reminders. Break down complex work into manageable steps. Create cards that help maintain momentum and clarity.',
    tracking: 'Surface relevant updates, trends, and developments. Highlight what matters and filter noise. Create cards that keep the user informed and ready to act.',
  };
  return instructions[purpose] || 'Generate helpful cards based on the channel purpose.';
}

// Purpose-aware Shroom title
function getShroomTitle(purpose: string): string {
  const titles: Record<string, string> = {
    learning: 'Discover Resources',
    ideas: 'Generate Ideas',
    projects: 'Suggest Tasks',
    tracking: 'Find Updates',
  };
  return titles[purpose] || 'Generate Cards';
}

export function WelcomeFlowOverlay({
  isOpen,
  onClose,
  onCreate,
  signInAction,
  signInRedirectTo = '/',
  isSignedIn = false,
}: WelcomeFlowOverlayProps) {
  const [scene, setScene] = useState<Scene>('intro');
  const [purpose, setPurpose] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<string | null>(null);
  const [workflowOptions, setWorkflowOptions] = useState<WorkflowOption[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Typewriter state for intro
  const [visibleLines, setVisibleLines] = useState(0);
  const [typedChars, setTypedChars] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  const introLines = [
    { text: '> sprouting...', style: 'dim' as const, delay: 0 },
    { text: '> ready', style: 'dim' as const, delay: 400 },
    { text: '', delay: 800 },
    { text: "Hi, I'm Kan.", style: 'heading' as const, delay: 1000 },
    { text: '', delay: 1600 },
    { text: 'Welcome to Kanthink — a space to learn, organize, and get things done.', style: 'normal' as const, delay: 1800 },
  ];

  // Scenes for progress indicator
  const allScenes: Scene[] = isSignedIn
    ? ['intro', 'purpose', 'workflow', 'ready']
    : ['intro', 'purpose', 'workflow', 'signin', 'ready'];
  const sceneIndex = allScenes.indexOf(scene);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setScene('intro');
      setPurpose(null);
      setWorkflow(null);
      setWorkflowOptions([]);
      setSelectedOption(null);
      setVisibleLines(0);
      setTypedChars(0);
      setIsTyping(false);
      // Start typewriter after sprout animation
      const timer = setTimeout(() => setIsTyping(true), 2200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Cursor blink
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setShowCursor((prev) => !prev), 530);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Typewriter effect for intro
  useEffect(() => {
    if (!isOpen || !isTyping || scene !== 'intro') return;

    const currentLine = introLines[visibleLines];
    if (!currentLine) {
      setIsTyping(false);
      return;
    }

    let charsInPreviousLines = 0;
    for (let i = 0; i < visibleLines; i++) {
      charsInPreviousLines += introLines[i].text.length;
    }
    const charsInCurrentLine = typedChars - charsInPreviousLines;

    if (charsInCurrentLine >= currentLine.text.length) {
      if (visibleLines < introLines.length - 1) {
        const nextLine = introLines[visibleLines + 1];
        const delay = nextLine.delay ? nextLine.delay - (currentLine.delay || 0) : 100;
        const timeout = setTimeout(() => setVisibleLines((prev) => prev + 1), Math.max(delay, 50));
        return () => clearTimeout(timeout);
      } else {
        setIsTyping(false);
      }
      return;
    }

    const charDelay = currentLine.style === 'dim' ? 15 : 25;
    const timeout = setTimeout(() => setTypedChars((prev) => prev + 1), charDelay);
    return () => clearTimeout(timeout);
  }, [isOpen, isTyping, scene, visibleLines, typedChars]);

  // Ensure typed chars catch up when line becomes visible
  useEffect(() => {
    if (!isOpen || !isTyping || scene !== 'intro') return;
    const currentLine = introLines[visibleLines];
    if (!currentLine) return;

    let charsNeeded = 0;
    for (let i = 0; i < visibleLines; i++) {
      charsNeeded += introLines[i].text.length;
    }
    if (typedChars < charsNeeded) {
      setTypedChars(charsNeeded);
    }
  }, [isOpen, isTyping, scene, visibleLines, typedChars]);

  // Skip intro typing animation
  const skipIntro = useCallback(() => {
    let totalChars = 0;
    for (const line of introLines) {
      totalChars += line.text.length;
    }
    setVisibleLines(introLines.length - 1);
    setTypedChars(totalChars);
    setIsTyping(false);
  }, []);

  // Fetch workflow options from API
  const fetchWorkflowOptions = useCallback(async (selectedPurpose: string) => {
    setIsLoadingWorkflows(true);
    try {
      const response = await fetch('/api/instruction-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'workflow-options',
          purpose: selectedPurpose,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.options && data.options.length > 0) {
          setWorkflowOptions(data.options);
          setIsLoadingWorkflows(false);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to fetch workflow options:', err);
    }

    // Fallback to defaults
    setWorkflowOptions(DEFAULT_WORKFLOWS[selectedPurpose] || DEFAULT_WORKFLOWS.learning);
    setIsLoadingWorkflows(false);
  }, []);

  // Handle purpose selection
  const handlePurposeSelect = useCallback(async (value: string) => {
    setSelectedOption(value);
    await new Promise((r) => setTimeout(r, 200));
    setPurpose(value);
    setSelectedOption(null);
    setScene('workflow');
    fetchWorkflowOptions(value);
  }, [fetchWorkflowOptions]);

  // Handle workflow selection
  const handleWorkflowSelect = useCallback(async (value: string) => {
    setSelectedOption(value);
    await new Promise((r) => setTimeout(r, 200));
    setWorkflow(value);
    setSelectedOption(null);

    // Skip signin if already signed in
    if (isSignedIn) {
      setScene('ready');
    } else {
      setScene('signin');
    }
  }, [isSignedIn]);

  // Create the channel
  const handleCreate = useCallback(() => {
    if (!purpose || !workflow) return;

    // Find the selected workflow option to get column names
    const selectedWorkflow = workflowOptions.find((w) => w.value === workflow);
    const columnNames = selectedWorkflow
      ? selectedWorkflow.label.split(' → ').map((name) => name.trim())
      : ['Inbox', 'Review', 'Done'];

    const channelName = getChannelName(purpose);
    const channelDescription = getChannelDescription(purpose);
    const instructions = getAIInstructions(purpose);

    const columns = columnNames.map((name, i) => ({
      name,
      description: i === 0 ? 'New items appear here' : `Items moved to ${name}`,
      isAiTarget: i === 0,
    }));

    const result: WelcomeFlowResultData = {
      channelName,
      channelDescription,
      instructions,
      choices: { purpose, workflow },
      structure: {
        channelName,
        channelDescription,
        instructions,
        columns,
        instructionCards: [
          {
            title: getShroomTitle(purpose),
            instructions,
            action: 'generate',
            targetColumnName: columns[0].name,
            cardCount: 5,
          },
        ],
      },
    };

    onClose();
    onCreate(result);
  }, [purpose, workflow, workflowOptions, onClose, onCreate]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === 'Enter' || e.key === ' ') && scene === 'intro') {
        e.preventDefault();
        if (isTyping) {
          skipIntro();
        } else {
          setScene('purpose');
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, scene, isTyping, skipIntro]);

  if (!isOpen) return null;

  // Render intro line
  const renderIntroLine = (line: typeof introLines[0], lineIndex: number) => {
    if (lineIndex > visibleLines) return null;

    let charsBeforeLine = 0;
    for (let i = 0; i < lineIndex; i++) {
      charsBeforeLine += introLines[i].text.length;
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
      <div key={lineIndex} className={`leading-relaxed ${styleClasses[line.style || 'normal']}`}>
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
          {allScenes.map((s, i) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= sceneIndex ? 'w-8 bg-violet-500' : 'w-2 bg-neutral-700'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-neutral-900/80 backdrop-blur-xl rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl">
          <div className="p-8 min-h-[320px]">
            {/* Mascot icon */}
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
                  animation: scene === 'intro' ? 'kan-sprout 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
                }}
              >
                <KanthinkIcon size={40} className="text-violet-400" />
              </div>
            </div>

            {/* Scene: Intro */}
            {scene === 'intro' && (
              <>
                <div className="space-y-1">
                  {introLines.map((line, i) => renderIntroLine(line, i))}
                </div>
                {!isTyping && (
                  <div className="mt-4">
                    <span className={`inline-block w-2 h-4 ${showCursor ? 'bg-violet-400' : 'bg-transparent'}`} />
                  </div>
                )}
              </>
            )}

            {/* Scene: Purpose */}
            {scene === 'purpose' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">What brings you here today?</h2>
                  <p className="text-neutral-400 text-sm">This helps me set up your space.</p>
                </div>
                <div className="space-y-2">
                  {PURPOSE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handlePurposeSelect(option.value)}
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
                          <span className="block font-medium text-white">{option.label}</span>
                          <span className="block text-sm text-neutral-400 mt-0.5">{option.description}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scene: Workflow */}
            {scene === 'workflow' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">How would you like to organize things?</h2>
                  <p className="text-neutral-400 text-sm">Choose a column structure for your board.</p>
                </div>
                {isLoadingWorkflows ? (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                      <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="text-sm text-neutral-400">Generating workflows...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workflowOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleWorkflowSelect(option.value)}
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
                            <span className="block font-medium text-white">{option.label}</span>
                            <span className="block text-sm text-neutral-400 mt-0.5">{option.description}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Scene: Sign-in */}
            {scene === 'signin' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">One more thing</h2>
                  <p className="text-neutral-300 mb-4">Sign in to save your spaces and unlock AI features.</p>
                  <p className="text-neutral-500 text-sm">Free tier includes 10 AI requests per month.</p>
                </div>
              </div>
            )}

            {/* Scene: Ready */}
            {scene === 'ready' && purpose && workflow && (
              <div className="space-y-6">
                {/* Pulse animation for shroom preview */}
                <style>{`
                  @keyframes shroom-pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
                    50% { box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.3); }
                  }
                  .shroom-pulse {
                    animation: shroom-pulse 2s ease-in-out 3;
                  }
                `}</style>
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
                    <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-1">Your space is ready</h2>
                  <p className="text-sm text-neutral-400">{getChannelDescription(purpose)}</p>
                </div>

                {/* Channel preview */}
                <div className="space-y-4 p-5 rounded-xl bg-neutral-800/50 border border-neutral-800">
                  <div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Channel</p>
                    <p className="text-white font-medium">{getChannelName(purpose)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Columns</p>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {(workflowOptions.find((w) => w.value === workflow)?.label || 'Inbox → Review → Done')
                        .split(' → ')
                        .map((col, i, arr) => (
                          <div key={col} className="flex items-center">
                            {i > 0 && (
                              <svg className="w-4 h-4 text-neutral-600 mx-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                            <span className="px-3 py-1.5 text-sm rounded-lg bg-neutral-800 text-neutral-300 whitespace-nowrap border border-neutral-700">
                              {col.trim()}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Shroom preview */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <KanthinkIcon size={16} className="text-violet-400" />
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Your first Shroom</p>
                    </div>
                    <div className="shroom-pulse rounded-lg bg-neutral-900/80 border border-neutral-700 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm font-medium text-white">Generate</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-400 mb-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span>
                          {(workflowOptions.find((w) => w.value === workflow)?.label || 'Inbox → Review → Done')
                            .split(' → ')[0]?.trim()}
                        </span>
                        <span className="text-neutral-600">·</span>
                        <span>5 cards</span>
                      </div>
                      <p className="text-xs text-neutral-500 italic">
                        Click the Shrooms button to run AI actions
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-neutral-800 flex justify-between items-center">
            <div className="flex items-center gap-4">
              {scene === 'signin' && (
                <button
                  onClick={() => setScene('ready')}
                  className="text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  Skip sign-in
                </button>
              )}
            </div>

            {scene === 'intro' && (
              <button
                onClick={() => {
                  if (isTyping) {
                    skipIntro();
                  } else {
                    setScene('purpose');
                  }
                }}
                className={`
                  group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isTyping ? 'text-neutral-400 hover:text-white' : 'bg-violet-600 hover:bg-violet-500 text-white'}
                `}
              >
                {isTyping ? (
                  'Skip intro'
                ) : (
                  <>
                    Continue
                    <svg
                      className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            )}

            {scene === 'signin' && signInAction && (
              <form action={signInAction}>
                <input type="hidden" name="redirectTo" value={signInRedirectTo} />
                <button
                  type="submit"
                  className="group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Sign in with Google
                  <svg
                    className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </form>
            )}

            {scene === 'ready' && (
              <button
                onClick={handleCreate}
                className="group flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all bg-violet-600 hover:bg-violet-500 text-white"
              >
                Let's go
                <svg
                  className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
