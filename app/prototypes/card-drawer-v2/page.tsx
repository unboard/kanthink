'use client';

import { useState } from 'react';

type Tab = 'thread' | 'tasks' | 'info';

// Fake message data for the thread
const mockMessages = [
  { id: '1', role: 'user' as const, text: 'This is a great idea for tracking streaks. How should we handle missed days?', time: '2:14 PM' },
  { id: '2', role: 'kan' as const, text: 'Good question! I\'d suggest a "forgiveness day" mechanic — users can mark a day as excused without breaking their streak. This keeps motivation high while being realistic about life getting in the way.', time: '2:15 PM' },
  { id: '3', role: 'user' as const, text: 'Love it. Let\'s also add a visual flame that grows with the streak length.', time: '2:18 PM' },
];

const mockTasks = [
  { id: '1', title: 'Design streak visualization component', done: true },
  { id: '2', title: 'Add forgiveness day mechanic', done: false },
  { id: '3', title: 'Build daily goal check-in flow', done: false },
  { id: '4', title: 'Implement streak fire animation', done: false },
];

export default function CardDrawerV2Prototype() {
  const [activeTab, setActiveTab] = useState<Tab>('thread');
  const [message, setMessage] = useState('');
  const [tasks, setTasks] = useState(mockTasks);

  const incompleteTasks = tasks.filter(t => !t.done).length;

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
      {/* Simulated drawer container */}
      <div className="w-full max-w-md bg-neutral-900 rounded-2xl overflow-hidden flex flex-col" style={{ height: '85vh' }}>

        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-neutral-800">
          <h1 className="flex-1 font-medium text-white truncate">Mini-Goal Streak Tracker</h1>
          <button className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-300 rounded-full hover:bg-neutral-800">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
          </button>
          <button className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-neutral-300 rounded-full hover:bg-neutral-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Segmented Tabs — the key change */}
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <div className="flex bg-neutral-800/60 rounded-lg p-0.5">
            {([
              { key: 'thread' as Tab, label: 'Thread' },
              { key: 'tasks' as Tab, label: 'Tasks', badge: incompleteTasks > 0 ? incompleteTasks : undefined },
              { key: 'info' as Tab, label: 'Info' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 relative py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab.key
                    ? 'bg-neutral-700 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-300'
                }`}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full ${
                    activeTab === tab.key
                      ? 'bg-violet-500 text-white'
                      : 'bg-neutral-600 text-neutral-300'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content area — fills available space */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Thread */}
          {activeTab === 'thread' && (
            <div className="flex flex-col h-full">
              {/* AI Summary */}
              <div className="px-4 pt-2 pb-3">
                <button className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate AI summary
                </button>
              </div>

              {/* Card content */}
              <div className="px-4 pb-4">
                <div className="bg-neutral-800/50 rounded-xl p-4 text-sm text-neutral-300 leading-relaxed">
                  <p>The <strong className="text-white">Mini-Goal Streak Tracker</strong> introduces a gamified system for building momentum on tasks and creative work. By defining bite-sized daily or weekly objectives, users can see a visual streak indicator that celebrates consecutive days of making progress.</p>
                  <p className="mt-3"><strong className="text-white">Key Features</strong></p>
                  <ul className="mt-1 list-disc pl-4 space-y-1 text-neutral-400">
                    <li>Set one or more &ldquo;mini-goals&rdquo; for a card, shroom, or channel</li>
                    <li>Each day the goal is met, the streak increases with a colored progress bar</li>
                    <li>Friendly reminders help keep the streak alive</li>
                  </ul>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 px-4 space-y-4">
                {mockMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${msg.role === 'user' ? '' : ''}`}>
                      {msg.role === 'kan' && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center">
                            <span className="text-[8px]">🍄</span>
                          </div>
                          <span className="text-xs text-violet-400 font-medium">Kan</span>
                          <span className="text-xs text-neutral-600">{msg.time}</span>
                        </div>
                      )}
                      <div className={`text-sm rounded-2xl px-3.5 py-2.5 ${
                        msg.role === 'user'
                          ? 'bg-violet-600 text-white rounded-br-md'
                          : 'bg-neutral-800 text-neutral-200 rounded-bl-md'
                      }`}>
                        {msg.text}
                      </div>
                      {msg.role === 'user' && (
                        <div className="text-right mt-0.5">
                          <span className="text-xs text-neutral-600">{msg.time}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="h-4" /> {/* spacer before input */}
            </div>
          )}

          {/* Tasks */}
          {activeTab === 'tasks' && (
            <div className="px-4 py-3">
              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-neutral-400 mb-1.5">
                  <span>{tasks.filter(t => t.done).length} of {tasks.length} complete</span>
                  <span>{Math.round((tasks.filter(t => t.done).length / tasks.length) * 100)}%</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${(tasks.filter(t => t.done).length / tasks.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Task list */}
              <div className="space-y-1">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-neutral-800/50 group cursor-pointer"
                  >
                    <button
                      onClick={() => setTasks(ts => ts.map(t => t.id === task.id ? { ...t, done: !t.done } : t))}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        task.done
                          ? 'bg-violet-500 border-violet-500'
                          : 'border-neutral-600 hover:border-neutral-400'
                      }`}
                    >
                      {task.done && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span className={`text-sm flex-1 ${
                      task.done
                        ? 'text-neutral-500 line-through'
                        : 'text-neutral-200'
                    }`}>
                      {task.title}
                    </span>
                  </div>
                ))}
              </div>

              {/* Add task */}
              <button className="mt-3 flex items-center gap-2 px-2.5 py-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add task
              </button>
            </div>
          )}

          {/* Info */}
          {activeTab === 'info' && (
            <div className="px-4 py-3 space-y-5">
              {/* Tags */}
              <div>
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-violet-500/20 text-violet-300">feature</span>
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300">gamification</span>
                  <button className="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 rounded-full border border-dashed border-neutral-700 hover:border-neutral-500 transition-colors">+ Add</button>
                </div>
              </div>

              {/* Assignees */}
              <div>
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Assignees</h3>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-xs font-medium text-white">DH</div>
                  <button className="w-7 h-7 rounded-full border border-dashed border-neutral-700 hover:border-neutral-500 flex items-center justify-center text-neutral-500 hover:text-neutral-300 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Column */}
              <div>
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Column</h3>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-300 bg-neutral-800 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  Inbox
                </div>
              </div>

              {/* Dates */}
              <div>
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Created</span>
                    <span className="text-neutral-300">Mar 8, 2026</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Updated</span>
                    <span className="text-neutral-300">Mar 10, 2026</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Source</span>
                    <span className="text-neutral-300">AI generated</span>
                  </div>
                </div>
              </div>

              {/* Danger zone */}
              <div className="pt-3 border-t border-neutral-800">
                <button className="text-sm text-red-400 hover:text-red-300 transition-colors">Archive card</button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom input — ONLY on thread tab, clean and uncluttered */}
        {activeTab === 'thread' && (
          <div className="flex-shrink-0 border-t border-neutral-800 p-3">
            <div className="flex items-center gap-2 bg-neutral-800/60 rounded-xl px-3 py-2">
              <button className="text-neutral-500 hover:text-neutral-300 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 bg-transparent text-sm text-white placeholder-neutral-500 border-none outline-none"
              />
              <button className="text-neutral-500 hover:text-neutral-300 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              <button className="text-violet-400 hover:text-violet-300 flex-shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2 px-1">
              <button className="px-2.5 py-1 text-xs font-medium text-white bg-neutral-700 rounded-md">Note</button>
              <button className="px-2.5 py-1 text-xs font-medium text-neutral-400 hover:text-neutral-300 flex items-center gap-1">
                <span className="text-[10px]">🍄</span> Ask Kan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
