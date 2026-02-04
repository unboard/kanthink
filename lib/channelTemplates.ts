/**
 * Pre-built channel templates organized by category.
 * Each template includes columns, optional shrooms (instruction cards), and metadata.
 */

export interface ChannelTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  icon: string // Emoji or icon identifier
  columns: Array<{
    name: string
    instructions?: string
    isAiTarget?: boolean
  }>
  aiInstructions?: string
  instructionCards?: Array<{
    title: string
    instructions: string
    action: 'generate' | 'modify' | 'move'
    targetColumnName: string
    cardCount?: number
  }>
  tags?: string[] // For filtering/search
}

export type TemplateCategory =
  | 'work'
  | 'personal'
  | 'creative'
  | 'sales'
  | 'engineering'
  | 'learning'
  | 'events'

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, { label: string; icon: string; description: string }> = {
  work: {
    label: 'Work & Productivity',
    icon: '💼',
    description: 'Project management, task tracking, and team workflows',
  },
  personal: {
    label: 'Personal',
    icon: '🏠',
    description: 'Goals, habits, life admin, and personal organization',
  },
  creative: {
    label: 'Content & Creative',
    icon: '🎨',
    description: 'Content calendars, design projects, and creative workflows',
  },
  sales: {
    label: 'Sales & Marketing',
    icon: '📈',
    description: 'Pipelines, campaigns, and customer management',
  },
  engineering: {
    label: 'Engineering',
    icon: '⚙️',
    description: 'Sprints, bug tracking, and development workflows',
  },
  learning: {
    label: 'Learning & Research',
    icon: '📚',
    description: 'Study tracking, research, and knowledge management',
  },
  events: {
    label: 'Events & Planning',
    icon: '🗓️',
    description: 'Event planning, trips, and occasion management',
  },
}

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  // ============ WORK & PRODUCTIVITY ============
  {
    id: 'simple-kanban',
    name: 'Simple Kanban',
    description: 'Classic three-column board for any workflow',
    category: 'work',
    icon: '📋',
    columns: [
      { name: 'To Do', instructions: 'Tasks waiting to be started' },
      { name: 'Doing', instructions: 'Work currently in progress' },
      { name: 'Done', instructions: 'Completed tasks' },
    ],
    tags: ['basic', 'tasks', 'beginner'],
  },
  {
    id: 'project-tracker',
    name: 'Project Tracker',
    description: 'Track projects from ideation to completion',
    category: 'work',
    icon: '🎯',
    columns: [
      { name: 'Ideas', instructions: 'Project ideas and proposals' },
      { name: 'Planning', instructions: 'Projects being scoped and planned' },
      { name: 'In Progress', instructions: 'Active projects being worked on' },
      { name: 'Review', instructions: 'Projects pending review or approval' },
      { name: 'Complete', instructions: 'Successfully completed projects' },
    ],
    aiInstructions: 'Help track project status, identify blockers, and suggest next steps for stalled projects.',
    tags: ['projects', 'tracking', 'milestones'],
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Organize meetings and track action items',
    category: 'work',
    icon: '📝',
    columns: [
      { name: 'Upcoming', instructions: 'Scheduled meetings with agendas' },
      { name: 'This Week', instructions: 'Meetings happening this week' },
      { name: 'Notes', instructions: 'Meeting notes and summaries' },
      { name: 'Action Items', instructions: 'Tasks assigned from meetings' },
    ],
    aiInstructions: 'Extract action items from meeting notes, summarize key decisions, and remind about follow-ups.',
    instructionCards: [
      {
        title: 'Extract Action Items',
        instructions: 'Review the meeting notes and extract any action items, assigning them to the appropriate people if mentioned.',
        action: 'modify',
        targetColumnName: 'Notes',
      },
    ],
    tags: ['meetings', 'notes', 'actions'],
  },
  {
    id: 'okr-tracker',
    name: 'OKR Tracker',
    description: 'Track objectives and key results',
    category: 'work',
    icon: '🎯',
    columns: [
      { name: 'Objectives', instructions: 'High-level goals and objectives' },
      { name: 'Key Results', instructions: 'Measurable outcomes for each objective' },
      { name: 'In Progress', instructions: 'Key results actively being worked on' },
      { name: 'Achieved', instructions: 'Completed key results' },
    ],
    aiInstructions: 'Help formulate SMART key results, track progress percentages, and suggest adjustments when off-track.',
    tags: ['okrs', 'goals', 'metrics'],
  },
  {
    id: 'weekly-planner',
    name: 'Weekly Planner',
    description: 'Plan and organize your week',
    category: 'work',
    icon: '📅',
    columns: [
      { name: 'Monday', instructions: 'Tasks for Monday' },
      { name: 'Tuesday', instructions: 'Tasks for Tuesday' },
      { name: 'Wednesday', instructions: 'Tasks for Wednesday' },
      { name: 'Thursday', instructions: 'Tasks for Thursday' },
      { name: 'Friday', instructions: 'Tasks for Friday' },
    ],
    aiInstructions: 'Help balance workload across the week, suggest optimal days for specific task types, and identify scheduling conflicts.',
    tags: ['planning', 'schedule', 'weekly'],
  },

  // ============ PERSONAL ============
  {
    id: 'habit-tracker',
    name: 'Habit Tracker',
    description: 'Build and track daily habits',
    category: 'personal',
    icon: '✅',
    columns: [
      { name: 'Daily Habits', instructions: 'Habits to complete each day' },
      { name: 'Building', instructions: 'New habits being established' },
      { name: 'Streak', instructions: 'Habits with active streaks' },
      { name: 'Archived', instructions: 'Paused or retired habits' },
    ],
    aiInstructions: 'Track habit streaks, suggest habit stacking opportunities, and provide encouragement for consistency.',
    tags: ['habits', 'daily', 'self-improvement'],
  },
  {
    id: 'goal-setting',
    name: 'Goal Setting',
    description: 'Set and achieve personal goals',
    category: 'personal',
    icon: '🌟',
    columns: [
      { name: 'Dreams', instructions: 'Long-term aspirations and dreams' },
      { name: 'Goals', instructions: 'Specific goals derived from dreams' },
      { name: 'Action Steps', instructions: 'Concrete actions to achieve goals' },
      { name: 'Achieved', instructions: 'Accomplished goals to celebrate' },
    ],
    aiInstructions: 'Help break down big dreams into achievable goals, suggest milestones, and celebrate progress.',
    instructionCards: [
      {
        title: 'Break Down Goals',
        instructions: 'Take each goal and suggest 3-5 actionable steps that would help achieve it.',
        action: 'generate',
        targetColumnName: 'Action Steps',
        cardCount: 3,
      },
    ],
    tags: ['goals', 'dreams', 'achievement'],
  },
  {
    id: 'reading-list',
    name: 'Reading List',
    description: 'Track books and reading progress',
    category: 'personal',
    icon: '📖',
    columns: [
      { name: 'Want to Read', instructions: 'Books on your reading wishlist' },
      { name: 'Reading', instructions: 'Currently reading' },
      { name: 'Finished', instructions: 'Completed books with notes' },
      { name: 'Favorites', instructions: 'Books worth re-reading or recommending' },
    ],
    aiInstructions: 'Suggest similar books based on favorites, help summarize key takeaways, and track reading goals.',
    tags: ['books', 'reading', 'learning'],
  },
  {
    id: 'life-admin',
    name: 'Life Admin',
    description: 'Manage household and personal tasks',
    category: 'personal',
    icon: '🏡',
    columns: [
      { name: 'To Do', instructions: 'Tasks that need attention' },
      { name: 'In Progress', instructions: 'Currently being handled' },
      { name: 'Waiting', instructions: 'Waiting on others or external factors' },
      { name: 'Done', instructions: 'Completed tasks' },
    ],
    aiInstructions: 'Help prioritize tasks by urgency, remind about recurring tasks, and suggest efficient batching.',
    tags: ['household', 'errands', 'admin'],
  },
  {
    id: 'fitness-tracker',
    name: 'Fitness Tracker',
    description: 'Plan workouts and track fitness goals',
    category: 'personal',
    icon: '💪',
    columns: [
      { name: 'Workout Plan', instructions: 'Planned workouts for the week' },
      { name: 'Today', instructions: 'Today\'s workout' },
      { name: 'Completed', instructions: 'Finished workouts with notes' },
      { name: 'Personal Records', instructions: 'PRs and achievements' },
    ],
    aiInstructions: 'Suggest workout variations, track progress over time, and help plan balanced training schedules.',
    tags: ['fitness', 'workout', 'health'],
  },

  // ============ CONTENT & CREATIVE ============
  {
    id: 'content-calendar',
    name: 'Content Calendar',
    description: 'Plan and schedule content across channels',
    category: 'creative',
    icon: '📆',
    columns: [
      { name: 'Ideas', instructions: 'Content ideas and topics', isAiTarget: true },
      { name: 'Drafting', instructions: 'Content being written or created' },
      { name: 'Review', instructions: 'Ready for editing or approval' },
      { name: 'Scheduled', instructions: 'Approved and scheduled for publishing' },
      { name: 'Published', instructions: 'Live content' },
    ],
    aiInstructions: 'Generate content ideas based on trends, suggest optimal posting times, and help maintain a consistent content mix.',
    instructionCards: [
      {
        title: 'Generate Content Ideas',
        instructions: 'Suggest fresh content ideas based on current trends, audience interests, and gaps in the content calendar.',
        action: 'generate',
        targetColumnName: 'Ideas',
        cardCount: 5,
      },
    ],
    tags: ['content', 'calendar', 'social'],
  },
  {
    id: 'blog-planning',
    name: 'Blog Planning',
    description: 'Plan and write blog posts',
    category: 'creative',
    icon: '✍️',
    columns: [
      { name: 'Ideas', instructions: 'Blog post ideas and topics' },
      { name: 'Outline', instructions: 'Posts with completed outlines' },
      { name: 'Writing', instructions: 'Posts being written' },
      { name: 'Editing', instructions: 'Posts being edited and polished' },
      { name: 'Published', instructions: 'Live blog posts' },
    ],
    aiInstructions: 'Help outline blog posts, suggest SEO improvements, and generate meta descriptions.',
    instructionCards: [
      {
        title: 'Create Outline',
        instructions: 'Generate a detailed outline with headings, key points, and suggested word count for each section.',
        action: 'modify',
        targetColumnName: 'Ideas',
      },
    ],
    tags: ['blog', 'writing', 'seo'],
  },
  {
    id: 'design-projects',
    name: 'Design Projects',
    description: 'Manage design work from brief to delivery',
    category: 'creative',
    icon: '🎨',
    columns: [
      { name: 'Brief', instructions: 'New design requests and briefs' },
      { name: 'Concepts', instructions: 'Initial concepts and exploration' },
      { name: 'Revisions', instructions: 'Work incorporating feedback' },
      { name: 'Approved', instructions: 'Final approved designs' },
      { name: 'Delivered', instructions: 'Handed off to client/team' },
    ],
    aiInstructions: 'Help interpret briefs, suggest design approaches, and track revision rounds.',
    tags: ['design', 'creative', 'feedback'],
  },
  {
    id: 'video-production',
    name: 'Video Production',
    description: 'Manage video projects end-to-end',
    category: 'creative',
    icon: '🎬',
    columns: [
      { name: 'Ideas', instructions: 'Video concepts and scripts' },
      { name: 'Pre-Production', instructions: 'Planning, scripting, scheduling' },
      { name: 'Filming', instructions: 'Videos being shot' },
      { name: 'Editing', instructions: 'In post-production' },
      { name: 'Published', instructions: 'Released videos' },
    ],
    aiInstructions: 'Help write scripts, suggest B-roll ideas, and generate video descriptions and tags.',
    tags: ['video', 'youtube', 'production'],
  },
  {
    id: 'podcast-planning',
    name: 'Podcast Planning',
    description: 'Plan episodes and manage guests',
    category: 'creative',
    icon: '🎙️',
    columns: [
      { name: 'Episode Ideas', instructions: 'Potential episode topics' },
      { name: 'Guest Outreach', instructions: 'Guests being contacted' },
      { name: 'Scheduled', instructions: 'Confirmed recording dates' },
      { name: 'Editing', instructions: 'Episodes in post-production' },
      { name: 'Published', instructions: 'Released episodes' },
    ],
    aiInstructions: 'Suggest episode topics, generate interview questions, and help write show notes.',
    tags: ['podcast', 'audio', 'interviews'],
  },

  // ============ SALES & MARKETING ============
  {
    id: 'sales-pipeline',
    name: 'Sales Pipeline',
    description: 'Track deals from lead to close',
    category: 'sales',
    icon: '💰',
    columns: [
      { name: 'Leads', instructions: 'New potential customers' },
      { name: 'Contacted', instructions: 'Initial outreach made' },
      { name: 'Qualified', instructions: 'Confirmed fit and interest' },
      { name: 'Proposal', instructions: 'Proposal sent' },
      { name: 'Negotiation', instructions: 'Terms being discussed' },
      { name: 'Closed Won', instructions: 'Successfully closed deals' },
    ],
    aiInstructions: 'Analyze pipeline health, suggest follow-up actions, and identify at-risk deals.',
    tags: ['sales', 'crm', 'deals'],
  },
  {
    id: 'marketing-campaigns',
    name: 'Marketing Campaigns',
    description: 'Plan and execute marketing campaigns',
    category: 'sales',
    icon: '📣',
    columns: [
      { name: 'Planning', instructions: 'Campaigns being planned' },
      { name: 'Creating', instructions: 'Assets being developed' },
      { name: 'Active', instructions: 'Live campaigns' },
      { name: 'Analyzing', instructions: 'Campaigns being measured' },
      { name: 'Completed', instructions: 'Finished campaigns with learnings' },
    ],
    aiInstructions: 'Suggest campaign ideas, help set KPIs, and analyze performance patterns.',
    tags: ['marketing', 'campaigns', 'advertising'],
  },
  {
    id: 'customer-feedback',
    name: 'Customer Feedback',
    description: 'Collect and act on customer feedback',
    category: 'sales',
    icon: '💬',
    columns: [
      { name: 'New', instructions: 'Newly received feedback' },
      { name: 'Reviewing', instructions: 'Being analyzed and categorized' },
      { name: 'Implementing', instructions: 'Acting on feedback' },
      { name: 'Resolved', instructions: 'Feedback addressed' },
      { name: 'Won\'t Fix', instructions: 'Declined with reasoning' },
    ],
    aiInstructions: 'Categorize feedback themes, identify urgent issues, and suggest responses.',
    tags: ['feedback', 'customers', 'support'],
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Coordinate product launches',
    category: 'sales',
    icon: '🚀',
    columns: [
      { name: 'Planning', instructions: 'Launch planning tasks' },
      { name: 'Development', instructions: 'Product being built' },
      { name: 'Testing', instructions: 'Beta testing phase' },
      { name: 'Pre-Launch', instructions: 'Final preparations' },
      { name: 'Launched', instructions: 'Successfully launched' },
    ],
    aiInstructions: 'Create launch checklists, suggest marketing angles, and identify launch risks.',
    tags: ['launch', 'product', 'go-to-market'],
  },

  // ============ ENGINEERING ============
  {
    id: 'sprint-board',
    name: 'Sprint Board',
    description: 'Agile sprint planning and tracking',
    category: 'engineering',
    icon: '🏃',
    columns: [
      { name: 'Backlog', instructions: 'Prioritized work items' },
      { name: 'Sprint', instructions: 'Committed for current sprint' },
      { name: 'In Progress', instructions: 'Actively being worked on' },
      { name: 'Review', instructions: 'Code review or QA' },
      { name: 'Done', instructions: 'Completed this sprint' },
    ],
    aiInstructions: 'Help estimate story points, identify scope creep, and suggest sprint improvements.',
    tags: ['agile', 'sprint', 'scrum'],
  },
  {
    id: 'bug-tracker',
    name: 'Bug Tracker',
    description: 'Track and resolve bugs',
    category: 'engineering',
    icon: '🐛',
    columns: [
      { name: 'Reported', instructions: 'Newly reported bugs' },
      { name: 'Triaging', instructions: 'Being investigated and prioritized' },
      { name: 'Fixing', instructions: 'Actively being fixed' },
      { name: 'Testing', instructions: 'Fix being verified' },
      { name: 'Resolved', instructions: 'Bug fixed and verified' },
    ],
    aiInstructions: 'Help categorize bugs by severity, suggest potential root causes, and identify patterns.',
    tags: ['bugs', 'qa', 'debugging'],
  },
  {
    id: 'feature-requests',
    name: 'Feature Requests',
    description: 'Manage feature requests and roadmap',
    category: 'engineering',
    icon: '💡',
    columns: [
      { name: 'Submitted', instructions: 'New feature requests' },
      { name: 'Under Review', instructions: 'Being evaluated' },
      { name: 'Planned', instructions: 'Approved for development' },
      { name: 'Building', instructions: 'In development' },
      { name: 'Released', instructions: 'Shipped to users' },
    ],
    aiInstructions: 'Group similar requests, estimate effort, and suggest prioritization based on impact.',
    tags: ['features', 'roadmap', 'product'],
  },
  {
    id: 'tech-debt',
    name: 'Tech Debt Tracker',
    description: 'Track and pay down technical debt',
    category: 'engineering',
    icon: '🔧',
    columns: [
      { name: 'Identified', instructions: 'Known tech debt items' },
      { name: 'Prioritized', instructions: 'Scheduled for resolution' },
      { name: 'In Progress', instructions: 'Being addressed' },
      { name: 'Resolved', instructions: 'Tech debt paid down' },
    ],
    aiInstructions: 'Help assess debt impact, suggest quick wins, and balance new features vs debt reduction.',
    tags: ['tech-debt', 'refactoring', 'code-quality'],
  },
  {
    id: 'release-planning',
    name: 'Release Planning',
    description: 'Plan and track releases',
    category: 'engineering',
    icon: '📦',
    columns: [
      { name: 'Planned', instructions: 'Features planned for release' },
      { name: 'Development', instructions: 'Features in development' },
      { name: 'Staging', instructions: 'Ready for staging environment' },
      { name: 'QA', instructions: 'Being tested' },
      { name: 'Released', instructions: 'Deployed to production' },
    ],
    aiInstructions: 'Generate release notes, identify release risks, and track deployment status.',
    tags: ['releases', 'deployment', 'versioning'],
  },

  // ============ LEARNING & RESEARCH ============
  {
    id: 'course-notes',
    name: 'Course Notes',
    description: 'Organize learning and course materials',
    category: 'learning',
    icon: '🎓',
    columns: [
      { name: 'Modules', instructions: 'Course modules and lessons' },
      { name: 'Studying', instructions: 'Currently learning' },
      { name: 'Practicing', instructions: 'Applying knowledge' },
      { name: 'Reviewed', instructions: 'Material reviewed and understood' },
      { name: 'Mastered', instructions: 'Fully learned concepts' },
    ],
    aiInstructions: 'Create study guides, generate practice questions, and identify knowledge gaps.',
    instructionCards: [
      {
        title: 'Generate Practice Questions',
        instructions: 'Create 5 practice questions based on the course material to test understanding.',
        action: 'generate',
        targetColumnName: 'Practicing',
        cardCount: 5,
      },
    ],
    tags: ['learning', 'courses', 'study'],
  },
  {
    id: 'research-project',
    name: 'Research Project',
    description: 'Organize research and sources',
    category: 'learning',
    icon: '🔬',
    columns: [
      { name: 'Sources', instructions: 'Papers, articles, and resources to review' },
      { name: 'Reading', instructions: 'Currently being read' },
      { name: 'Notes', instructions: 'Key takeaways and highlights' },
      { name: 'Synthesis', instructions: 'Connecting ideas across sources' },
      { name: 'Conclusions', instructions: 'Final insights and findings' },
    ],
    aiInstructions: 'Summarize sources, identify themes across papers, and help synthesize findings.',
    tags: ['research', 'academic', 'analysis'],
  },
  {
    id: 'skill-development',
    name: 'Skill Development',
    description: 'Track skills you\'re developing',
    category: 'learning',
    icon: '📈',
    columns: [
      { name: 'Want to Learn', instructions: 'Skills on your wishlist' },
      { name: 'Learning', instructions: 'Actively studying' },
      { name: 'Practicing', instructions: 'Building proficiency' },
      { name: 'Competent', instructions: 'Can apply independently' },
      { name: 'Expert', instructions: 'Can teach others' },
    ],
    aiInstructions: 'Suggest learning resources, create practice exercises, and track skill progression.',
    tags: ['skills', 'development', 'growth'],
  },
  {
    id: 'language-learning',
    name: 'Language Learning',
    description: 'Track language learning progress',
    category: 'learning',
    icon: '🌍',
    columns: [
      { name: 'Vocabulary', instructions: 'New words to learn' },
      { name: 'Grammar', instructions: 'Grammar concepts' },
      { name: 'Practice', instructions: 'Active practice items' },
      { name: 'Mastered', instructions: 'Confident knowledge' },
    ],
    aiInstructions: 'Generate vocabulary lists, create example sentences, and suggest conversation practice topics.',
    instructionCards: [
      {
        title: 'Generate Vocabulary Cards',
        instructions: 'Create vocabulary cards with the word, definition, example sentence, and pronunciation notes.',
        action: 'generate',
        targetColumnName: 'Vocabulary',
        cardCount: 10,
      },
    ],
    tags: ['language', 'vocabulary', 'study'],
  },

  // ============ EVENTS & PLANNING ============
  {
    id: 'event-planning',
    name: 'Event Planning',
    description: 'Plan any type of event',
    category: 'events',
    icon: '🎉',
    columns: [
      { name: 'Ideas', instructions: 'Event concepts and themes' },
      { name: 'Planning', instructions: 'Tasks being planned' },
      { name: 'Booked', instructions: 'Confirmed vendors and venues' },
      { name: 'Day Of', instructions: 'Tasks for event day' },
      { name: 'Follow Up', instructions: 'Post-event tasks' },
    ],
    aiInstructions: 'Create event checklists, suggest vendors, and help with timeline planning.',
    tags: ['events', 'planning', 'party'],
  },
  {
    id: 'travel-planning',
    name: 'Travel Planning',
    description: 'Plan trips and track itineraries',
    category: 'events',
    icon: '✈️',
    columns: [
      { name: 'Inspiration', instructions: 'Places to visit' },
      { name: 'Researching', instructions: 'Actively planning' },
      { name: 'Booked', instructions: 'Confirmed reservations' },
      { name: 'Packing', instructions: 'Pre-trip preparations' },
      { name: 'Memories', instructions: 'Trip highlights and photos' },
    ],
    aiInstructions: 'Suggest destinations, create packing lists, and help build day-by-day itineraries.',
    instructionCards: [
      {
        title: 'Create Packing List',
        instructions: 'Generate a comprehensive packing list based on the destination, duration, and activities planned.',
        action: 'generate',
        targetColumnName: 'Packing',
        cardCount: 1,
      },
    ],
    tags: ['travel', 'vacation', 'trips'],
  },
  {
    id: 'wedding-planning',
    name: 'Wedding Planning',
    description: 'Comprehensive wedding organization',
    category: 'events',
    icon: '💒',
    columns: [
      { name: 'To Research', instructions: 'Vendors and options to explore' },
      { name: 'Getting Quotes', instructions: 'Awaiting pricing' },
      { name: 'Deciding', instructions: 'Comparing options' },
      { name: 'Booked', instructions: 'Confirmed and paid' },
      { name: 'Complete', instructions: 'All set' },
    ],
    aiInstructions: 'Create vendor checklists, suggest timeline milestones, and help with budget tracking.',
    tags: ['wedding', 'planning', 'celebration'],
  },
  {
    id: 'move-planning',
    name: 'Moving Checklist',
    description: 'Organize a move to a new home',
    category: 'events',
    icon: '📦',
    columns: [
      { name: 'Before Move', instructions: 'Pre-move tasks' },
      { name: 'Packing', instructions: 'Items to pack' },
      { name: 'Moving Day', instructions: 'Day-of tasks' },
      { name: 'After Move', instructions: 'Post-move setup' },
      { name: 'Done', instructions: 'Completed tasks' },
    ],
    aiInstructions: 'Generate moving checklists, suggest packing strategies, and help with address change lists.',
    tags: ['moving', 'home', 'relocation'],
  },
]

/**
 * Quick Start template - creates a simple board with generic columns
 */
export const QUICK_START_TEMPLATE: ChannelTemplate = {
  id: 'quick-start',
  name: 'Blank Board',
  description: 'Start with a simple board and customize as you go',
  category: 'work',
  icon: '⚡',
  columns: [
    { name: 'Inbox', instructions: 'New items land here', isAiTarget: true },
    { name: 'Working On', instructions: 'Items in progress' },
    { name: 'Done', instructions: 'Completed items' },
  ],
  tags: ['blank', 'simple', 'custom'],
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: TemplateCategory): ChannelTemplate[] {
  return CHANNEL_TEMPLATES.filter((t) => t.category === category)
}

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): ChannelTemplate | undefined {
  if (id === 'quick-start') return QUICK_START_TEMPLATE
  return CHANNEL_TEMPLATES.find((t) => t.id === id)
}

/**
 * Search templates by name, description, or tags
 */
export function searchTemplates(query: string): ChannelTemplate[] {
  const q = query.toLowerCase()
  return CHANNEL_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q))
  )
}
