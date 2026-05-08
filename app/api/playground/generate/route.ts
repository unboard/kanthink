import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { cards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { getUserByokConfigWithError } from '@/lib/usage';
import { nanoid } from 'nanoid';
import {
  PLAYGROUND_MODELS,
  DEFAULT_PLAYGROUND_MODEL_ID,
  getPlaygroundModel,
  computeGenerationCost,
} from '@/lib/playground/models';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface PlaygroundUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface PlaygroundTypeData {
  code?: string;
  codeTitle?: string;
  codeSummary?: string;
  generationCount?: number;
  lastNotes?: string;
  lastUsage?: PlaygroundUsage;
  lastModelId?: string;
}

const SYSTEM_PROMPT = `You generate complete single-file React applications that run in a sandboxed iframe with this exact runtime:
- React 19 via esm.sh import map (already configured in the host page)
- Tailwind CSS via Play CDN (already loaded in the host page)
- lucide-react icons via esm.sh (use sparingly)
- NO other npm packages. NO process.env. NO Node APIs.
- localStorage and sessionStorage work and persist per-user, scoped to a unique opaque origin per playground.
- fetch() works for public CORS-enabled APIs only.

CODE RULES (strict — your output runs unmodified):
1. ONE file. Output JSX (NOT TypeScript types — plain modern React).
2. Imports allowed: react, react-dom/client, lucide-react. Nothing else. Use esm.sh-friendly named imports.
3. Default-export a single component named App. The host runtime mounts <App/> to #root.
4. Use functional components and hooks only. No class components.
5. Style with Tailwind utility classes only. No <style> tags. No CSS-in-JS.
6. Wrap risky logic in try/catch. If you touch external APIs, audio, or canvas, wrap App in a small inline ErrorBoundary class.
7. Persist state to localStorage when it makes sense (todo lists, mood logs, timer state, game high scores). Use a key prefixed with "kpg_" + a slug derived from the title.
8. Mobile-first: must work in 375px width. Tap targets ≥ 44px tall. No hover-only UI.
9. NEVER use document.write, eval, new Function, or innerHTML with user input.
10. If the user describes something that needs a real backend (auth, multi-user sync, server storage), build the most useful localStorage-only version and add a one-line comment // BACKEND: <what would be needed>
11. Multiple "screens" should use view state in one file, e.g. const [view, setView] = useState('home') with conditional rendering. Do NOT split into multiple files.
12. Prefer beautiful, realistic-feeling screens over fully-working logic. Use placeholder data and clear "Coming soon" labels for unimplemented features. This is a prototype tool.

ERROR FEEDBACK PROTOCOL:
If the user message includes a section "PREVIOUS ERROR:", you have a runtime error from your last iteration. Fix that error specifically. If the same error appeared in two consecutive turns, REWRITE THE WHOLE APP from the original goal in a different way. Do not iterate on broken code more than twice.

CONVERSATIONAL TONE:
The "notes" field is shown in chat. Write it like a teammate, not a changelog.
"Made the cards bigger and added a flip animation" — not "Updated card styling and added transform CSS."

Always return valid JSON matching the response schema. Never wrap output in markdown code fences.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'A short 3-6 word app name (e.g. "Pomodoro Timer")' },
    summary: { type: Type.STRING, description: 'One sentence describing what the app does' },
    code: { type: Type.STRING, description: 'Complete single-file JSX. Default-export App component. No types, no markdown fences.' },
    notes: { type: Type.STRING, description: 'One conversational sentence about what changed in this iteration. Empty for first generation.' },
  },
  required: ['title', 'summary', 'code', 'notes'],
};

interface GenerateRequest {
  cardId: string;
  prompt: string;
  // Optional: if the iframe captured a runtime error, include it so Gemini can fix.
  lastError?: string;
  // Optional: caller can choose a model. Falls back to the default.
  modelId?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const body: GenerateRequest = await request.json();
  if (!body.cardId || !body.prompt) {
    return NextResponse.json({ error: 'cardId and prompt are required' }, { status: 400 });
  }

  // Resolve the user's Google API key (BYOK first, owner fallback).
  const byok = await getUserByokConfigWithError(session.user.id);
  if (byok.error) {
    return NextResponse.json({ error: byok.error }, { status: 400 });
  }
  let apiKey: string | null = null;
  if (byok.config?.provider === 'google' && byok.config.apiKey) {
    apiKey = byok.config.apiKey;
  } else if (process.env.OWNER_GOOGLE_API_KEY) {
    apiKey = process.env.OWNER_GOOGLE_API_KEY;
  } else if (process.env.GOOGLE_API_KEY) {
    apiKey = process.env.GOOGLE_API_KEY;
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Google API key. Add a Gemini API key in Settings → BYOK.' },
      { status: 400 }
    );
  }

  // Load the card so we can include current code + recent thread context for iteration quality.
  const card = await db.query.cards.findFirst({ where: eq(cards.id, body.cardId) });
  if (!card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  }
  const typeData = (card.typeData as PlaygroundTypeData | null) || {};
  const currentCode = typeData.code;
  const generationCount = typeData.generationCount ?? 0;

  // Build the user message: original goal (card title) + current code + last few thread turns + new prompt.
  const recentMessages = (card.messages || []).slice(-6);
  const threadContext = recentMessages.length > 0
    ? recentMessages
        .map(m => `[${m.type}] ${(m.content || '').slice(0, 400)}`)
        .join('\n')
    : '(no prior messages)';

  const userMessage = [
    `ORIGINAL GOAL (card title): ${card.title}`,
    currentCode
      ? `CURRENT CODE:\n\`\`\`jsx\n${currentCode}\n\`\`\``
      : 'CURRENT CODE: (none yet — this is the first generation)',
    `RECENT THREAD CONTEXT:\n${threadContext}`,
    body.lastError ? `PREVIOUS ERROR:\n${body.lastError}` : '',
    `USER REQUEST:\n${body.prompt}`,
  ].filter(Boolean).join('\n\n');

  // Resolve which Gemini model to call. Validate against the allow-list so a bad
  // client param can't make us hit an unsupported endpoint.
  const requestedModelId = body.modelId && PLAYGROUND_MODELS.some(m => m.id === body.modelId)
    ? body.modelId
    : DEFAULT_PLAYGROUND_MODEL_ID;
  const model = getPlaygroundModel(requestedModelId);

  const client = new GoogleGenAI({ apiKey });

  let parsed: { title: string; summary: string; code: string; notes: string } | null = null;
  let usage: { promptTokenCount?: number; candidatesTokenCount?: number } | null = null;
  try {
    const response = await client.models.generateContent({
      model: model.id,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 16000,
        thinkingConfig: model.thinkingBudget > 0 ? { thinkingBudget: model.thinkingBudget } : undefined,
      },
    });
    const text = response.text || '';
    parsed = JSON.parse(text);
    usage = response.usageMetadata
      ? {
          promptTokenCount: response.usageMetadata.promptTokenCount,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
        }
      : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error from Gemini';
    return NextResponse.json({ error: `Gemini error: ${msg}` }, { status: 502 });
  }

  if (!parsed?.code) {
    return NextResponse.json({ error: 'Gemini returned no code' }, { status: 502 });
  }

  // Persist:
  // 1. Latest snapshot in typeData (fast read for preview + public render)
  // 2. A short ai_response message in the thread so the conversation looks natural
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const lastUsage: PlaygroundUsage = {
    modelId: model.id,
    inputTokens,
    outputTokens,
    costUsd: computeGenerationCost(model.id, inputTokens, outputTokens),
  };

  const newTypeData: PlaygroundTypeData = {
    code: parsed.code,
    codeTitle: parsed.title,
    codeSummary: parsed.summary,
    generationCount: generationCount + 1,
    lastNotes: parsed.notes,
    lastUsage,
    lastModelId: model.id,
  };

  // Build the new thread: append user prompt + Kan's notes
  const existingMessages = (card.messages || []) as unknown as Array<Record<string, unknown>>;
  const userMessageObj = {
    id: nanoid(),
    type: 'question' as const,
    content: body.prompt,
    authorId: session.user.id,
    createdAt: new Date().toISOString(),
  };
  const aiMessageObj = {
    id: nanoid(),
    type: 'ai_response' as const,
    content: parsed.notes || (generationCount === 0 ? `Built **${parsed.title}** — ${parsed.summary}` : 'Updated.'),
    createdAt: new Date().toISOString(),
  };
  const newMessages = [...existingMessages, userMessageObj, aiMessageObj];

  // First generation also sets cardType + a friendly title if the card was untitled.
  const updates: Record<string, unknown> = {
    typeData: newTypeData,
    messages: newMessages,
    updatedAt: new Date(),
  };
  if (card.cardType !== 'playground') {
    updates.cardType = 'playground';
  }
  if (generationCount === 0 && (!card.title || card.title.toLowerCase().startsWith('new card'))) {
    updates.title = parsed.title;
  }
  if (!card.summary || generationCount === 0) {
    updates.summary = parsed.summary;
  }

  await db.update(cards).set(updates).where(eq(cards.id, body.cardId));

  return NextResponse.json({
    success: true,
    snapshot: {
      code: parsed.code,
      title: parsed.title,
      summary: parsed.summary,
      notes: parsed.notes,
    },
    typeData: newTypeData,
    messages: newMessages,
    usage,
    lastUsage,
  });
}
