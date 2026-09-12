import type { Card, Channel, Folder, Task } from '@/lib/types';
import { buildProductUpdateContext } from '@/lib/productUpdates';

interface SessionLike {
  user?: { id?: string | null; name?: string | null; email?: string | null } | null;
}

export interface VoicePromptFocus {
  channelId?: string;
  channelName?: string;
  cardId?: string;
  cardTitle?: string;
}

export interface BuildVoicePromptInput {
  channelList: Channel[];
  cards: Record<string, Card>;
  tasks: Record<string, Task>;
  folders: Record<string, Folder>;
  folderOrder: string[];
  channelOrder?: string[];
  session?: SessionLike | null;
  focus?: VoicePromptFocus;
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function formatChannel(ch: Channel, cards: Record<string, Card>, focusedChannelId?: string): string {
  const colDetails = ch.columns.map(col => {
    const colCards = col.cardIds.map(cid => cards[cid]).filter(Boolean);
    if (colCards.length === 0) return `  ${col.name}: (empty)`;
    const sorted = [...colCards].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const cardList = sorted.slice(0, 8).map(c => {
      const updated = new Date(c.updatedAt);
      const created = new Date(c.createdAt);
      return `    - "${c.title}" (cardId: ${c.id}) modified: ${fmtDate(updated)}, created: ${fmtDate(created)}`;
    }).join('\n');
    return `  ${col.name} (${colCards.length} cards):\n${cardList}${colCards.length > 8 ? `\n    ... and ${colCards.length - 8} more` : ''}`;
  }).join('\n');
  const desc = ch.description ? `\n  Description: ${ch.description.slice(0, 150)}` : '';
  const instructions = ch.aiInstructions ? `\n  AI Instructions: ${ch.aiInstructions.slice(0, 150)}` : '';
  const focusMarker = focusedChannelId === ch.id ? ' ⭐ [USER IS HERE]' : '';
  return `  📋 ${ch.name} (channelId: ${ch.id})${ch.isQuickSave ? ' [Bookmarks]' : ''}${focusMarker}${desc}${instructions}\n${colDetails}`;
}

export function buildVoiceSystemPrompt({
  channelList,
  cards,
  tasks,
  folders,
  folderOrder,
  channelOrder,
  session,
  focus,
}: BuildVoicePromptInput): string {
  const channelById = new Map(channelList.map(ch => [ch.id, ch]));
  const usedChannelIds = new Set<string>();
  const sections: string[] = [];

  for (const folderId of folderOrder) {
    const folder = folders[folderId];
    if (!folder || folder.isVirtual) continue;
    const folderChannels = (folder.channelIds ?? [])
      .map(id => channelById.get(id))
      .filter((c): c is Channel => !!c);
    if (folderChannels.length === 0) continue;

    folderChannels.forEach(ch => usedChannelIds.add(ch.id));
    const channelLines = folderChannels.map(ch => formatChannel(ch, cards, focus?.channelId)).join('\n\n');
    sections.push(`📁 ${folder.name} (folder):\n${channelLines}`);
  }

  const unfiledChannels = (channelOrder ?? [])
    .map(id => channelById.get(id))
    .filter((ch): ch is Channel => !!ch && !usedChannelIds.has(ch.id));
  const remainingChannels = channelList.filter(ch => !usedChannelIds.has(ch.id) && !unfiledChannels.some(u => u.id === ch.id));
  const allUnfiled = [...unfiledChannels, ...remainingChannels];
  if (allUnfiled.length > 0) {
    allUnfiled.forEach(ch => usedChannelIds.add(ch.id));
    const channelLines = allUnfiled.map(ch => formatChannel(ch, cards, focus?.channelId)).join('\n\n');
    if (sections.length > 0) {
      sections.push(`(No folder):\n${channelLines}`);
    } else {
      sections.push(channelLines);
    }
  }

  const workspaceSection = sections.join('\n\n') || '(no channels)';

  const taskList = Object.values(tasks);
  const notDone = taskList.filter(t => t.status !== 'done');
  const userId = session?.user?.id;
  const myTasks = userId ? notDone.filter(t => t.assignedTo?.includes(userId)) : [];

  let taskSection = '';
  if (notDone.length > 0) {
    const taskLines = notDone.slice(0, 20).map(t => {
      const chName = channelList.find(c => c.id === t.channelId)?.name || '?';
      const cardTitle = t.cardId ? cards[t.cardId]?.title : null;
      const dates = `created: ${fmtDate(new Date(t.createdAt))}${t.updatedAt !== t.createdAt ? `, modified: ${fmtDate(new Date(t.updatedAt))}` : ''}`;
      return `- "${t.title}" (taskId: ${t.id}) [${t.status}] in ${chName}${cardTitle ? ` on card "${cardTitle}"` : ''} ${dates}${t.assignedTo?.includes(userId || '') ? ' [ASSIGNED TO YOU]' : ''}`;
    }).join('\n');
    taskSection = `\n\nTASKS (${notDone.length} not done${myTasks.length > 0 ? `, ${myTasks.length} assigned to you` : ''}):\n${taskLines}`;
  }

  // The card the user is standing on, in full.
  //
  // This used to be a pointer — a title and an instruction to "weight your
  // interpretation" toward it — appended after the entire workspace dump. Kan knew
  // the card's name and nothing about what it said, so opening voice on a card and
  // saying "what do you think?" got a question back rather than an answer.
  //
  // The card's own content goes in, and it goes in FIRST, ahead of the workspace
  // listing. The user opened voice from here; this is the subject until they say
  // otherwise.
  let focusSection = '';
  if (focus?.channelId) {
    const focusedChannel = channelById.get(focus.channelId);
    const channelName = focus.channelName || focusedChannel?.name || 'this channel';

    if (focus.cardId) {
      const focusedCard = cards[focus.cardId];
      const cardTitle = focus.cardTitle || focusedCard?.title || 'this card';

      const cardTasks = taskList.filter((t) => t.cardId === focus.cardId);
      const taskLines = cardTasks.length > 0
        ? cardTasks
            .map((t) => `  ${t.status === 'done' ? '[x]' : '[ ]'} ${t.title}`)
            .join('\n')
        : '';

      const thread = (focusedCard?.messages ?? []).slice(-12);
      const threadLines = thread.length > 0
        ? thread
            .map((m) => `  [${m.type === 'ai_response' ? 'you' : 'them'}] ${(m.content || '').slice(0, 1200)}`)
            .join('\n')
        : '  (nothing written on it yet)';

      focusSection = [
        `THE USER IS ON THIS CARD RIGHT NOW — it is the subject of this conversation:`,
        ``,
        `CARD: "${cardTitle}" (cardId: ${focus.cardId})`,
        `CHANNEL: "${channelName}" (channelId: ${focus.channelId})`,
        focusedCard?.summary ? `SUMMARY: ${focusedCard.summary}` : '',
        taskLines ? `TASKS ON IT:\n${taskLines}` : '',
        `WHAT IS WRITTEN ON IT:\n${threadLines}`,
        ``,
        `You have read the above. Open on it — reference something specific from it rather than asking what they want to talk about, and treat "this", "it", and any open-ended question as being about this card unless they say otherwise. If they take the conversation elsewhere, follow them; this is where to start, not a fence.`,
      ].filter(Boolean).join('\n');
    } else {
      focusSection = `THE USER IS IN THE "${channelName}" CHANNEL RIGHT NOW (channelId: ${focus.channelId}). Treat "this channel", "this column" and open-ended questions as being about it unless they say otherwise. The starred 📋 ⭐ below marks it.`;
    }
  }

  return `You are Kan, the AI operator for Kanthink. The user is ${session?.user?.name || 'the workspace owner'} (email: ${session?.user?.email || 'unknown'}).

Keep voice responses concise — 2-3 sentences max. Be conversational and warm.

${focusSection}

WORKSPACE (${channelList.length} channels, organized into folders):

${workspaceSection}${taskSection}

Channels are organized into folders (📁) in the sidebar. When the user asks about a folder or where a channel is, refer to this structure.

Cards above are a snapshot from session start. IMPORTANT: If the user asks about a card you don't see, or asks about "most recent", "latest", "newest" cards, ALWAYS use the search_cards tool to query live data from the database. Don't say you can't see it — search for it.

When using tools, use the exact IDs shown above when available (taskId, cardId, channelId). For search_cards, you can pass a channel name instead of ID.

CHOOSING WHERE A CARD GOES — get this right, it is the thing you most often get wrong:

Pick the channel by what the card IS FOR, not by what it is ABOUT. An app idea about birds belongs wherever the user builds things — NOT in their bird-watching channel. A maths game for their daughter is personal, and must never land in a work or client channel just because that channel happens to be where software gets discussed.

Before choosing, ask yourself: if the user opened this channel next week, would they expect to find this card here? Topic overlap is not a reason. A channel about a subject is for that subject, not for software about it.

Never put a personal idea in a business channel, or a business item in a personal one. When you cannot tell which side of that line something falls on, ASK — one short question, and wait.

If you are not confident about the channel, ASK BEFORE CREATING. Never create a card and ask which channel in the same breath: it reads as though you did not know what you were doing, because you didn't. Ask, hear the answer, then create once.

Columns: pass a columnName only if you can read that exact name in the workspace listing above, under that specific channel. Copy it character for character. Boards vary and standard Kanban column names are usually not the ones here, so never reach for a name that feels typical. If you are unsure, omit columnName and the card lands in the channel's default column.

ONE IDEA, ONE CARD:

A spoken idea arrives in pieces. The user will describe something, then keep adding — the theme, the mechanic, a joke they want in it. Every one of those additions belongs on the SAME card. Use add_note with that card's cardId. Do NOT create a second card because more detail arrived, and do NOT create a "better" card because you thought of a nicer title. If you want to improve the title, use the existing card.

Before calling create_card, check whether you already made a card for this idea in this conversation. If you did, add to it.

The trap to watch for is a single feature described in parts. Someone lays out an app directory, then five minutes later describes the thumbnails on it, then how it gets published. Those are one idea being told in order, not three ideas, and a fresh title for the newest part does not make it a new card. If the words are different but it is still the same thing, it is the same card.

If create_card comes back saying it might be a duplicate, do not argue with it and do not try again. Ask the user one short question — "want me to add this to X, or start a separate card?" — and wait. If they say add, use add_note. Only if they explicitly say it is separate should you call create_card again with distinct set to true.

APPS — building things from a card:

Any card can carry apps: real single-file React apps generated from the card, living on its Apps tab, each with its own thread and live preview. Publishing one gives a kanthink.com/play/<token> link that works on a phone with no deploy or setup. Generated apps can upload images and make AI calls, so AI-flavoured apps work out of the box.

You CAN build one: use the build_app tool with the card's id. It uses everything on the card's thread as the brief, so make sure the idea is captured on the card first. It takes a minute or two — say you are starting, then confirm when it lands.

When the user mentions wanting to "build", "make an app", "prototype", "vibe code", or "create a tool", capture it on a card and offer to build it.

A published app collects an audience: everyone who opened it, who paid, what they said. Use app_audience to answer anything about how an app is doing — "how is Lennon's Math going", "has anyone bought it", "any feedback" — rather than guessing or saying you cannot see it. It is read-only, so you can look freely, but you cannot grant access, refund anyone, or answer a customer on the user's behalf. If someone is waiting on a reply, say so and tell the user it is on the app's People tab.

${buildProductUpdateContext()}`;
}
