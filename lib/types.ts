export type ID = string;

export type ChannelStatus = 'active' | 'paused' | 'archived';
export type CardSource = 'manual' | 'ai';
export type QuestionStatus = 'pending' | 'answered' | 'dismissed';
export type SuggestionMode = 'off' | 'manual' | 'daily';
export type InstructionSource = 'user' | 'ai-suggested' | 'ai-auto';
export type PropertyDisplayType = 'chip' | 'field';
export type TaskStatus = 'not_started' | 'in_progress' | 'on_hold' | 'done';
export type CardMessageType = 'note' | 'question' | 'ai_response';

// Shroom chat message (for conversational creation/editing)
export interface ShroomChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Instruction Card types
export type InstructionAction = 'generate' | 'modify' | 'move';
export type InstructionRunMode = 'manual' | 'automatic';

export interface ShroomStep {
  action: InstructionAction;
  targetColumnId: string;
  description: string;
  cardCount?: number;
}
export type InstructionScope = 'channel' | 'global' | 'public';

// Automation trigger types
export type TriggerType = 'scheduled' | 'event' | 'threshold';
export type ScheduleInterval = 'hourly' | 'every4hours' | 'daily' | 'weekly';
export type EventTriggerType = 'card_moved_to' | 'card_created_in' | 'card_modified';
export type ThresholdOperator = 'below' | 'above';

export interface ScheduledTrigger {
  type: 'scheduled';
  interval: ScheduleInterval;
  specificTime?: string;  // HH:mm format for daily/weekly
  dayOfWeek?: number;     // 0-6 for weekly (0 = Sunday)
}

export interface EventTrigger {
  type: 'event';
  eventType: EventTriggerType;
  columnId: ID;
}

export interface ThresholdTrigger {
  type: 'threshold';
  columnId: ID;
  operator: ThresholdOperator;
  threshold: number;
}

export type AutomaticTrigger = ScheduledTrigger | EventTrigger | ThresholdTrigger;

export interface AutomaticSafeguards {
  cooldownMinutes: number;
  dailyCap: number;
  preventLoops: boolean;
}

export interface ExecutionRecord {
  timestamp: string;
  triggeredBy: TriggerType;
  success: boolean;
  cardsAffected: number;
}

export type InstructionTarget =
  | { type: 'column'; columnId: ID }
  | { type: 'columns'; columnIds: ID[] }
  | { type: 'board' };

// Which columns AI considers for context (separate from destination)
export type ContextColumnSelection =
  | { type: 'all' }                      // All columns (default)
  | { type: 'columns'; columnIds: ID[] }; // Specific columns

export interface CardProperty {
  key: string;
  value: string;
  displayType: PropertyDisplayType;
  color?: string;  // For chips: "red", "blue", "green", etc.
}

export interface PropertyDefinition {
  id: ID;
  key: string;
  label: string;
  displayType: PropertyDisplayType;
  allowedValues?: string[];
  color?: string;
}

export interface TagDefinition {
  id: ID;
  name: string;
  color: string;
}

// Folder for organizing channels
export interface Folder {
  id: ID;
  name: string;
  channelIds: ID[];              // Channels in this folder (ordered)
  isCollapsed?: boolean;         // UI state - collapsed in sidebar
  isVirtual?: boolean;           // True for system folders like Help
  isLocked?: boolean;            // Cannot be modified by user
  isReadOnly?: boolean;          // True for folders shared with this user
  sharedBy?: SharedByInfo;       // Person who shared this folder (if shared)
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: ID;
  name: string;
  instructions?: string;         // Description of what belongs in this column
  processingPrompt?: string;     // Prompt to run on cards entering this column
  autoProcess?: boolean;         // Auto-run vs manual trigger (default: false)
  cardIds: ID[];
  backsideCardIds?: ID[];
  isAiTarget?: boolean;
}

export interface ChannelQuestion {
  id: ID;
  question: string;
  context: string;  // AI explanation of why this is being asked
  status: QuestionStatus;
  answer?: string;
  suggestedAnswers?: string[];  // AI-generated answer options
  createdAt: string;
  answeredAt?: string;
}

export interface InstructionRevision {
  id: ID;
  instructions: string;
  source: InstructionSource;
  appliedAt: string;
}

export interface InstructionCard {
  id: ID;
  channelId: ID;                          // For channel-scoped shrooms. Can be empty string for global shrooms
  title: string;
  instructions: string;
  action: InstructionAction;
  target: InstructionTarget;              // Destination: where cards are added
  contextColumns?: ContextColumnSelection | null; // Context: what AI sees (null/undefined = all)
  runMode: InstructionRunMode;
  scope?: InstructionScope;               // 'channel' (default), 'global', or 'public'
  cardCount?: number;
  interviewQuestions?: string[];
  createdAt: string;
  updatedAt: string;
  // Automation fields (only used when runMode === 'automatic')
  triggers?: AutomaticTrigger[];
  safeguards?: AutomaticSafeguards;
  isEnabled?: boolean;                    // Master on/off for automatic execution
  lastExecutedAt?: string;
  nextScheduledRun?: string;              // Computed next run time for scheduled triggers
  dailyExecutionCount?: number;
  dailyCountResetAt?: string;
  executionHistory?: ExecutionRecord[];   // Last N executions for tracking
  isGlobalResource?: boolean;             // True if this is a global resource (available to all, by Kanthink)
  conversationHistory?: ShroomChatMessage[];  // Chat history from conversational creation/editing
  steps?: ShroomStep[];                   // Multi-step action sequence (e.g. modify then move)
}

export interface TaskNote {
  id: ID;
  content: string;
  imageUrls?: string[];
  authorId?: string;
  authorName?: string;
  authorImage?: string;
  createdAt: string;
  editedAt?: string;
}

export interface Task {
  id: ID;
  cardId: ID | null;        // null = standalone task
  channelId: ID;
  title: string;
  description: string;
  status: TaskStatus;
  notes?: TaskNote[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Assignment & scheduling
  assignedTo?: string[];
  dueDate?: string;
}

// Smart snippet types for actionable AI responses
export type ProposedActionType = 'create_task' | 'add_tag' | 'remove_tag';
export type ActionStatus = 'pending' | 'approved' | 'rejected';

export interface CreateTaskActionData {
  title: string;
  description?: string;
}

export interface AddTagActionData {
  tagName: string;
  createDefinition?: boolean;  // True if tag doesn't exist
  suggestedColor?: string;
}

export interface RemoveTagActionData {
  tagName: string;
}

export type ActionData = CreateTaskActionData | AddTagActionData | RemoveTagActionData;

export interface StoredAction {
  id: string;
  type: ProposedActionType;
  data: ActionData;
  status: ActionStatus;
  editedData?: ActionData;      // If user edited before approving
  executedAt?: string;
  resultId?: string;            // e.g., created task ID
}

export interface CardMessage {
  id: ID;
  type: CardMessageType;
  content: string;           // Plain text (no HTML)
  imageUrls?: string[];      // Attached image URLs
  authorId?: string;         // User who created the message
  authorName?: string;       // Display name at time of creation
  authorImage?: string;      // Avatar URL at time of creation
  createdAt: string;
  replyToMessageId?: ID;     // For AI responses, links to the question
  proposedActions?: StoredAction[];  // Smart snippets for AI responses
}

export interface ChannelMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role?: string;
  roleDescription?: string | null;
}

export interface SharedByInfo {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface Channel {
  id: ID;
  name: string;
  description: string;
  status: ChannelStatus;
  aiInstructions: string;
  includeBacksideInAI?: boolean;
  instructionCardIds?: ID[];
  columns: Column[];
  questions?: ChannelQuestion[];
  instructionHistory?: InstructionRevision[];
  suggestionMode?: SuggestionMode;
  propertyDefinitions?: PropertyDefinition[];
  tagDefinitions?: TagDefinition[];
  unlinkedTaskOrder?: ID[];  // Order of standalone tasks (no cardId)
  isGlobalHelp?: boolean;    // True if this is a global help resource (read-only for all users)
  role?: ChannelRole;        // User's role in this channel (owner, editor, viewer)
  sharedBy?: SharedByInfo;   // Person who shared this channel (if not owner)
  createdAt: string;
  updatedAt: string;
}

export interface Card {
  id: ID;
  channelId: ID;
  title: string;
  messages: CardMessage[];   // Chat messages (replaces content)
  coverImageUrl?: string;    // Cover image URL (Trello-style banner)
  summary?: string;          // AI-generated preview text
  summaryUpdatedAt?: string;
  source: CardSource;
  properties?: CardProperty[];
  tags?: string[];  // Tag names assigned to this card
  isProcessing?: boolean;  // True while AI is processing this card
  processingStatus?: string;  // Creative status message while processing
  spawnedChannelIds?: ID[];  // Channels created from this card
  assignedTo?: string[];    // User IDs assigned to this card
  taskIds?: ID[];           // Tasks within this card
  hideCompletedTasks?: boolean;  // User preference to hide done tasks
  createdAt: string;
  updatedAt: string;
  createdByInstructionId?: ID;  // For loop prevention: tracks which instruction created this card
  processedByInstructions?: Record<ID, string>;  // instructionId -> ISO timestamp of last run
}

// ===== REVIEW QUEUE TYPES =====

export type RejectionReason = 'too_similar' | 'not_relevant' | 'too_vague' | 'not_for_me' | 'already_know';

export interface CardRejection {
  channelId: ID;
  instructionCardId: ID;
  rejectedCardTitle: string;
  reason?: RejectionReason;
  feedback?: string;
  timestamp: string;
}

export interface ReviewQueueCard {
  title: string;
  content?: string;
  assignedTo?: string[];
  accepted: boolean;
  rejectionReason?: RejectionReason;
  rejectionFeedback?: string;
  expanded?: boolean;
}

export interface ReviewQueueState {
  instructionCardId: ID;
  instructionTitle: string;
  channelId: ID;
  targetColumnId: ID;
  targetColumnName: string;
  cards: ReviewQueueCard[];
  createdAt: string;
}

export interface ChannelInput {
  name: string;
  description?: string;
  aiInstructions?: string;
}

export interface CardInput {
  title: string;
  initialMessage?: string;  // Optional first message content
  assignedTo?: string[];    // User IDs to assign (from AI)
}

export interface InstructionCardInput {
  title: string;
  instructions: string;
  action: InstructionAction;
  target: InstructionTarget;
  contextColumns?: ContextColumnSelection | null;
  runMode?: InstructionRunMode;
  scope?: InstructionScope;
  cardCount?: number;
  interviewQuestions?: string[];
  conversationHistory?: ShroomChatMessage[];
  steps?: ShroomStep[];
}

export interface TaskInput {
  title: string;
  description?: string;
  assignedTo?: string[];
  dueDate?: string;
  createdBy?: string;
}

export interface BoardState {
  channels: Record<ID, Channel>;
  cards: Record<ID, Card>;
  tasks: Record<ID, Task>;
  instructionCards: Record<ID, InstructionCard>;
  channelOrder: ID[];
}

// Global AI operation state for status bar
export interface AIOperationContext {
  action: 'generate' | 'modify' | 'move' | 'process';
  instructionTitle?: string;
  targetColumnName?: string;
  cardCount?: number;
  keywords?: string[];  // Extracted from instructions for contextual messages
}

export interface AIOperation {
  isActive: boolean;
  status: string;
  context?: AIOperationContext;
  startedAt?: string;
  runningInstructionIds: ID[];  // Track which instructions are currently running
}

// Automation event types
export interface CardEvent {
  type: 'moved' | 'created' | 'modified';
  cardId: ID;
  channelId: ID;
  toColumnId?: ID;
  fromColumnId?: ID;
  createdByInstructionId?: ID;  // For loop prevention
}

// Instruction undo types
export type CardChangeType = 'task_added' | 'property_set' | 'title_changed' | 'message_added' | 'tag_added';

export interface CardChange {
  cardId: ID;
  type: CardChangeType;
  // Reversal data - only what's needed to undo:
  taskId?: ID;              // task_added: delete this task to undo
  previousTitle?: string;   // title_changed: restore this value
  propertyKey?: string;     // property_set: key that was set
  previousValue?: string;   // property_set: previous value (undefined = was new)
  messageId?: ID;           // message_added: delete this message
  tagName?: string;         // tag_added: remove this tag to undo
}

export interface InstructionRun {
  id: ID;
  instructionId: ID;
  instructionTitle: string;
  channelId: ID;
  timestamp: string;
  changes: CardChange[];
  undone: boolean;
}

// ===== SHARING TYPES =====

export type ChannelRole = 'owner' | 'editor' | 'viewer';

export interface ChannelShare {
  id: ID;
  channelId: ID;
  userId: ID | null;
  email: string | null;
  role: ChannelRole;
  folderShareId?: ID | null;
  invitedBy: ID | null;
  invitedAt: string;
  acceptedAt: string | null;
  isPending: boolean;
  user?: {
    id: ID;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

export type FolderShareRole = 'editor' | 'viewer';

export interface FolderShare {
  id: ID;
  folderId: ID;
  userId: ID | null;
  email: string | null;
  role: FolderShareRole;
  invitedBy: ID | null;
  invitedAt: string;
  acceptedAt: string | null;
  isPending: boolean;
  user?: {
    id: ID;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

export interface ChannelInviteLink {
  id: ID;
  channelId: ID;
  token: string;
  defaultRole: 'editor' | 'viewer';
  requiresApproval: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
  isExpired: boolean;
  isExhausted: boolean;
}

// Real-time sync types
export type RealtimeEventType =
  | 'card:created'
  | 'card:updated'
  | 'card:moved'
  | 'card:deleted'
  | 'column:created'
  | 'column:updated'
  | 'column:deleted'
  | 'column:reordered'
  | 'presence:join'
  | 'presence:leave';

export interface RealtimeEvent {
  type: RealtimeEventType;
  channelId: ID;
  userId: ID;
  data: Record<string, unknown>;
  timestamp: string;
}

// ===== CHANNEL CHAT TYPES =====

export type ChannelChatMessageType = 'question' | 'ai_response';
export type ChannelProposedActionType = 'create_card' | 'create_task';

export interface CreateCardActionData {
  title: string;
  columnName: string;
  columnId?: string;
}

export interface ChannelCreateTaskActionData {
  title: string;
  description?: string;
  cardId?: string;
  cardTitle?: string;
}

export type ChannelActionData = CreateCardActionData | ChannelCreateTaskActionData;

export interface ChannelStoredAction {
  id: string;
  type: ChannelProposedActionType;
  data: ChannelActionData;
  status: ActionStatus;
  editedData?: ChannelActionData;
  executedAt?: string;
  resultId?: string;
}

export interface ChannelChatMessage {
  id: string;
  type: ChannelChatMessageType;
  content: string;
  imageUrls?: string[];
  authorId?: string;
  authorName?: string;
  authorImage?: string;
  createdAt: string;
  replyToMessageId?: string;
  proposedActions?: ChannelStoredAction[];
}

export interface ChannelChatThread {
  id: string;
  channelId: string;
  title: string;
  messages: ChannelChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// ===== FEED TYPES =====

export type FeedCardType = 'appetizer' | 'main_course' | 'dessert';

export interface FeedCardSource {
  url: string;
  title: string;
}

export interface FeedCard {
  id: ID;
  title: string;
  content: string;              // HTML (converted from markdown)
  type: FeedCardType;
  sourceChannelId: ID;
  sourceChannelName: string;
  sources: FeedCardSource[];
  coverImageUrl?: string;
  createdAt: string;
}

