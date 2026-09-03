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
/**
 * `report` shrooms analyse their context columns and write a single digest card instead
 * of producing N new cards. The point is signal without clutter — a shroom that watches
 * a channel and tells you what changed, rather than adding to the pile you're already
 * struggling to read.
 */
export type InstructionAction = 'generate' | 'modify' | 'move' | 'report' | 'build';
export type InstructionRunMode = 'manual' | 'automatic';

export interface ShroomStep {
  action: InstructionAction;
  targetColumnId: string;
  description: string;
  cardCount?: number;
}
export type InstructionScope = 'channel' | 'global' | 'public';

/**
 * Optional "email me after this runs" behaviour on a shroom.
 *
 * `brief` is a natural-language description of what the email should say — not a
 * template. Kan writes the actual email at send time from the brief plus what the run
 * actually did, so a quiet day and a busy one don't produce the same email.
 *
 * Recipient is deliberately not a field: mail goes to the channel owner's account
 * email. A shroom runs unattended on a cron, so it isn't something that should be
 * able to mail arbitrary addresses.
 */
export interface ShroomEmailConfig {
  enabled: boolean;
  brief: string;
  /** Optional steer on the subject line. Kan writes one from the brief if unset. */
  subjectHint?: string;
  /** Skip the send when a run changed nothing. Defaults to true. */
  skipWhenNothingHappened?: boolean;
}

/**
 * What a shroom is allowed to do, as distinct from what it's asked to do.
 *
 * These are a ceiling, not a request. The instructions decide what actually happens;
 * this decides what's even on the table. They exist because the run used to infer them
 * by scanning the instructions for words like "task" or "label" — so "break this into
 * steps" was told *not* to make tasks (no magic word), and "identify the category"
 * silently gained the power to write properties. Both were invisible and neither was
 * anyone's decision.
 *
 * Unset means unrestricted. A permission nobody has narrowed shouldn't quietly narrow
 * itself, and a prohibition should only ever reach the model because someone chose it.
 */
export interface ShroomCapabilities {
  /** Extract action items onto the card as tasks. */
  tasks: boolean;
  /** Add tags. */
  tags: boolean;
  /** Write key/value properties. */
  properties: boolean;
  /** Assign channel members to cards and tasks. */
  assignment: boolean;
}

/**
 * What a run has to be handed for this shroom to mean anything.
 *
 * A shroom is invoked at wildly different scopes — one card from a thread, a selection,
 * a whole column on a schedule. Some don't survive the narrow end of that: "pick the
 * best of these and say why" is not a question you can ask about one card. Declaring the
 * requirement lets any surface refuse the run *and say why* before spending a model call,
 * instead of running and producing something quietly nonsensical.
 */
export interface ShroomInputRequirements {
  /** Fewest cards a run needs. 0 means it doesn't act on existing cards at all. */
  minCards: number;
  /** Why, in the user's words. Shown when a run can't meet it. */
  reason?: string;
}

/**
 * A shroom's Web ability.
 *
 * Before this, web research was inferred: if the instructions happened to contain
 * "article" or "youtube", the run quietly went and searched. That made research a
 * property of your wording rather than a choice, and there was no way to ask for it
 * without saying a magic word — or to stop it once you'd said one by accident.
 *
 * 'auto' keeps that inference, so existing shrooms behave exactly as before.
 */
export type ShroomWebMode = 'auto' | 'always' | 'off';

export interface ShroomWebAccess {
  mode: ShroomWebMode;
  /**
   * What to go and look for, in the user's words. When set, this is the search query
   * instead of one derived from the instructions — so a shroom can research one thing
   * while its instructions describe what to do with the findings.
   */
  focus?: string;
}

// Automation trigger types
/**
 * 'manual' is a real trigger, not a placeholder: pressing Run is the most common
 * way a shroom executes, and leaving it out of this union is why manual runs went
 * unrecorded and every hand-run shroom read as "never run".
 */
export type TriggerType = 'scheduled' | 'event' | 'threshold' | 'reaction' | 'manual';
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

export interface ReactionTrigger {
  type: 'reaction';
  emoji: string;           // The emoji to watch for (e.g. '👍')
  minCount: number;        // Minimum reaction count to trigger (e.g. 3)
  columnId?: ID;           // Optional: only watch cards in this column
}

export type AutomaticTrigger = ScheduledTrigger | EventTrigger | ThresholdTrigger | ReactionTrigger;

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
  /**
   * Set when the run was declined rather than attempted (daily cap, loop prevention).
   * Recorded so a shroom that quietly isn't running says why, instead of looking broken.
   */
  skippedReason?: string;
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
  reviewCardIds?: ID[];          // AI-generated cards awaiting approval. Deliberately kept
                                 // out of cardIds and itemOrder — reorderColumnItems
                                 // rewrites positions from itemOrder indices, so a pending
                                 // card in there would corrupt active-bucket positions.
  backsideTaskIds?: ID[];        // Completed tasks hidden from column view
  taskIds?: ID[];                // Standalone tasks in this column (cardId=null)
  itemOrder?: ID[];              // Interleaved display order of cards + tasks. Falls back to cardIds if absent.
  isAiTarget?: boolean;
  isCollapsed?: boolean;         // Collapsed columns show as thin strips
  sortOrder?: ColumnSortOrder;   // Sticky sort rule new cards must respect. Defaults to 'manual'.
}

/**
 * A column's sort preference. 'manual' means positions are whatever the user
 * dragged them to; the others are rules, so newly created cards get placed to
 * match instead of always being appended.
 */
export type ColumnSortOrder =
  | 'manual'
  | 'created_newest'
  | 'created_oldest'
  | 'updated_newest'
  | 'updated_oldest';

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
  /**
   * The shroom's **default scope**: the cards a run acts on when the invoker doesn't
   * supply any. A thread run, a multi-select, or a chained run all override it.
   *
   * Not "where this shroom belongs" — a shroom belongs nowhere in particular, which is
   * what makes it reusable. For `generate` this is also where new cards land.
   */
  target: InstructionTarget;
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
  coverImageUrl?: string;                 // Cover/avatar image URL for the shroom
  conversationHistory?: ShroomChatMessage[];  // Chat history from conversational creation/editing
  steps?: ShroomStep[];                   // Multi-step action sequence (e.g. modify then move)
  nextInstructionId?: ID;                 // Chaining: run this shroom after current one completes
  autoApprove?: boolean;                  // Skip review queue for generate actions
  emailConfig?: ShroomEmailConfig;        // Email the channel owner after a run
  /**
   * Which model this shroom runs on, stored provider-qualified ("google:gemini-3.7-flash").
   * Unset means the account default. Honoured only when there's a key for that provider —
   * see `resolveShroomModel`.
   */
  modelId?: string;
  /**
   * Whether this shroom can go to the web, and what it should look for there.
   * Unset means 'auto' — inferred from the instructions, which is what shrooms did
   * before the ability was made explicit.
   */
  webAccess?: ShroomWebAccess;
  /** What this shroom may do beyond writing a note. Unset means unrestricted. */
  capabilities?: ShroomCapabilities;
  /** What a run must be handed for this shroom to make sense. */
  inputRequirements?: ShroomInputRequirements;
  /**
   * One generated sentence describing what this shroom does, for the card on the board.
   * `instructions` is written *to* the model and reads like configuration, which is why
   * cards showing it felt like settings rather than a description.
   */
  summary?: string;
}

export interface TaskNote {
  id: ID;
  content: string;
  imageUrls?: string[];
  whiteboards?: WhiteboardAttachment[];
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
  columnId?: ID | null;     // Which column this standalone task lives in (null/undefined = card-owned or legacy unlinked)
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
  snoozedUntil?: string;  // ISO timestamp — task hidden from board until this time
  isArchived?: boolean;   // Archived tasks are hidden from default views
}

// Smart snippet types for actionable AI responses
export type ProposedActionType = 'create_task' | 'add_tag' | 'remove_tag' | 'build_app';
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

/**
 * Kan proposing to build an app from a card. He is the gatekeeper: a build costs
 * minutes and real money, so it never happens without the user accepting this.
 * Accepting creates a new PlaygroundApp on the card and builds into it.
 */
export interface BuildAppActionData {
  /** What Kan will build or change, in one line, shown on the snippet. */
  summary: string;
  /** The brief handed to the generator. Fuller than the summary. */
  instruction: string;
}

export type ActionData = CreateTaskActionData | AddTagActionData | RemoveTagActionData | BuildAppActionData;

export interface StoredAction {
  id: string;
  type: ProposedActionType;
  data: ActionData;
  status: ActionStatus;
  editedData?: ActionData;      // If user edited before approving
  executedAt?: string;
  resultId?: string;            // e.g., created task ID
}

export interface MessageReaction {
  emoji: string;             // e.g. "👍", "❤️"
  userId: string;
  userName?: string;
}

export interface WhiteboardAttachment {
  id: ID;
  snapshot: string;          // Serialized whiteboard data JSON
  snapshotImageUrl?: string; // Uploaded PNG snapshot for AI vision (not displayed in thread)
}

export interface CardMessage {
  id: ID;
  type: CardMessageType;
  content: string;           // Plain text (no HTML)
  imageUrls?: string[];      // Attached image URLs
  whiteboards?: WhiteboardAttachment[];  // Embedded tldraw whiteboards
  authorId?: string;         // User who created the message
  authorName?: string;       // Display name at time of creation
  authorImage?: string;      // Avatar URL at time of creation
  createdAt: string;
  replyToMessageId?: ID;     // For AI responses, links to the question
  proposedActions?: StoredAction[];  // Smart snippets for AI responses
  reactions?: MessageReaction[];
  /**
   * Set when this message carries a shroom rather than text. The thread renders the
   * shroom's own card in place of a bubble, so a run leaves a visible trace you can
   * re-run, open, or clear — instead of happening silently.
   */
  shroomRunId?: ID;
  /**
   * Whether the shroom above actually ran. False when it was summoned with /shrooms
   * and is sitting in the thread waiting to be run.
   */
  shroomRan?: boolean;
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
  isQuickSave?: boolean;     // True if this is the user's Kan Bookmarks channel
  coverImageUrl?: string;    // Cover image URL for the channel
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
  isPublic?: boolean;           // Whether this card is publicly accessible
  shareToken?: string;          // Token for public sharing URL
  shareTheme?: string;          // Theme for public card page
  createdByInstructionId?: ID;  // For loop prevention: tracks which instruction created this card
  processedByInstructions?: Record<ID, string>;  // instructionId -> ISO timestamp of last run
  snoozedUntil?: string;  // ISO timestamp — card hidden from board until this time
  pinnedAt?: string;      // ISO timestamp — pinned cards sort to top of column
  reactions?: { emoji: string; userIds: string[] }[];  // Card-level emoji reactions
  color?: string;       // Color code for left border accent (e.g. 'red', 'blue', 'green')
  cardType?: string | null;    // null = standard card, 'report', etc.
  typeData?: Record<string, unknown>;  // Type-specific configuration data
  reviewRunId?: ID;     // Groups cards generated by a single shroom run
}

/**
 * A playground app — a generated single-file React app that hangs off a card.
 *
 * Many per card, listed under the card's tasks, each with its own thread. The card
 * it came from supplies the brief for the first build and stays linked at the top
 * of the app's thread; after that the app owns its own conversation and its own code.
 */
export interface PlaygroundApp {
  id: ID;
  channelId: ID;
  /** The card this app is an artifact of. */
  cardId: ID;
  title: string;
  summary?: string | null;
  code?: string | null;
  generationCount: number;
  /** Terse running list of established design decisions, re-injected on each build. */
  designNotes?: string | null;
  /** Kan's note from the most recent build. */
  lastNotes?: string | null;
  /** Runtime library declarations — see lib/playground/runtime. Never resolved URLs. */
  dependencies?: string[];
  lastModelId?: string | null;
  lastUsage?: {
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  /** Sticky per-app model choice. Null falls back to the 'auto' router. */
  modelId?: string | null;
  messages?: CardMessage[];
  isPublic?: boolean;
  shareToken?: string | null;
  /** Signed token the sandboxed iframe uses to call back into the AI/save routes. */
  appToken?: string | null;
  savedRecords?: { slug: string; data: unknown; label?: string; createdAt: number }[];
  position: number;
  createdBy?: string | null;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ===== REVIEW TYPES =====

export type RejectionReason = 'too_similar' | 'not_relevant' | 'too_vague' | 'not_for_me' | 'already_know';

/**
 * A rejected generated card. Persisted server-side in the card_rejections table and
 * fed back into the originating shroom's prompts — rejecting is how a shroom learns.
 */
export interface CardRejection {
  channelId: ID;
  instructionCardId: ID;
  rejectedCardTitle: string;
  reason?: RejectionReason;
  feedback?: string;
  timestamp: string;
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
  emailConfig?: ShroomEmailConfig;
  capabilities?: ShroomCapabilities;
  inputRequirements?: ShroomInputRequirements;
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
  action: 'generate' | 'modify' | 'move' | 'process' | 'report' | 'build';
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
export type ChannelProposedActionType = 'create_card' | 'create_task' | 'create_tag' | 'bulk_tag';

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

export interface CreateTagActionData {
  tagName: string;
  color?: string;
}

export interface BulkTagActionData {
  tagName: string;
  color?: string;
  cardIds: string[];    // Cards to tag
  columnName?: string;  // For display: "→ Raw Ideas"
}

export type ChannelActionData = CreateCardActionData | ChannelCreateTaskActionData | CreateTagActionData | BulkTagActionData;

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
  /** Raw JSON result behind a data answer (e.g. Mixpanel rows + totals), kept so
   *  follow-up questions can be answered against the same numbers. Not rendered. */
  dataResult?: string;
}

export interface ChannelChatThread {
  id: string;
  channelId: string;
  title: string;
  messages: ChannelChatMessage[];
  createdAt: string;
  updatedAt: string;
}


