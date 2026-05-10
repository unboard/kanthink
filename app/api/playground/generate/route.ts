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
  AUTO_MODEL_ID,
  FALLBACK_GENERATION_MODEL_ID,
  getPlaygroundModel,
  resolveActiveModelId,
  computeGenerationCost,
} from '@/lib/playground/models';
import { signCardToken } from '@/lib/playground/cardToken';
import { runPreflight } from '@/lib/playground/preflight';

export const runtime = 'nodejs';
// Long generations on Gemini 2.5 Pro / 3.x Pro with high thinking budgets can
// cleanly exceed 60s; bumping to the Vercel Pro plan max prevents 504 gateway
// timeouts from killing in-flight calls before Gemini responds.
export const maxDuration = 300;

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
  cardToken?: string;
  /** Running list of established design decisions, kept terse, re-injected on each iteration. */
  designNotes?: string;
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
2. Imports allowed: react (named imports only — useState/useEffect/etc.), lucide-react. NEVER write \`import React from 'react'\` or \`import * as React from 'react'\` — React is already in scope as a global from the host runtime; redeclaring it will fail with "Identifier 'React' has already been declared". Use \`import { useState, useEffect } from 'react';\` only when you need named hooks. Don't import react-dom — the runtime mounts your App component automatically.
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

AI / LLM CALLS INSIDE THE APP (Gemini, owner's BYOK):
The host runtime exposes \`window.kanthinkAI.generate(opts)\` for any AI feature in your app — vision (analyze a photo), text generation, classification, structured output, etc. NEVER hardcode a model name like "gemini-1.5-vision", "gemini-pro", or any stale model — those are deprecated. NEVER call the Gemini API directly from the app. Always use this helper, which routes through the playground owner's connected Gemini account and gives them access to current models.

Available models — Gemini 3.x is the frontier and what you should default to:
- 'gemini-3.1-pro-preview'  ★ DEFAULT — frontier reasoning + best vision. Use for image analysis, complex reasoning, multi-step tasks.
- 'gemini-3-flash-preview'  — fast frontier-class. Use for routine text, simple vision, classifications.
- 'gemini-3.1-flash-lite'   — cheapest 3.x. Use for high-volume calls or trivial tasks.
- 'gemini-2.5-pro'          — stable previous-gen fallback if 3.x is unavailable.
- 'gemini-2.5-flash'        — stable fallback for fast tasks.
- 'gemini-2.5-flash-lite'   — stable cheapest fallback.

Always prefer 3.x. Only fall back to 2.5 if you have a specific reason.

Usage:
\`\`\`jsx
// Plain text generation
const { text } = await window.kanthinkAI.generate({
  prompt: 'Suggest 5 names for a coffee shop in Brooklyn.',
  model: 'gemini-3-flash-preview',
});

// Vision — pass a Cloudinary image URL (from kanthinkUpload) or a data URL
const { text } = await window.kanthinkAI.generate({
  prompt: 'What bird is in this photo? Give species, confidence, and 2 fun facts.',
  imageUrl: cloudinaryUrl,  // returned by window.kanthinkUpload
  model: 'gemini-3.1-pro-preview',
});

// Structured output — pass a JSON schema, you get back parsed JSON
const { json } = await window.kanthinkAI.generate({
  prompt: 'Extract todos from: Buy milk, schedule dentist, finish report.',
  jsonSchema: {
    type: 'OBJECT',
    properties: { todos: { type: 'ARRAY', items: { type: 'STRING' } } },
    required: ['todos'],
  },
});
console.log(json.todos);  // ['Buy milk', 'schedule dentist', 'finish report']
\`\`\`

The helper returns \`{ text, json?, model, usage? }\`. Default model is gemini-3.1-pro-preview. Always wrap calls in try/catch and surface a friendly message on failure.

IMAGE & FILE STORAGE (Cloudinary, already wired up):
The host runtime exposes \`window.kanthinkUpload(file)\` for uploading images to the Kanthink Cloudinary account. ALWAYS use this helper for any "upload an image", "user avatar", "photo upload", "attach a file", or "save image" feature. Do NOT use base64 data URLs in localStorage for images (they bloat storage and break with large files). Do NOT prompt users to set up their own storage.

Usage:
\`\`\`jsx
const handleUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const { url, width, height } = await window.kanthinkUpload(file);
    // url is a permanent https Cloudinary URL — save it however you persist state
    setImageUrl(url);
  } catch (err) {
    setError(err.message);
  }
};
// JSX: <input type="file" accept="image/*" onChange={handleUpload} />
\`\`\`

The helper accepts JPEG, PNG, WebP, GIF up to ~4MB. It returns \`{ url, publicId, width, height }\`. Persist the url in localStorage / state — it's a stable CDN URL that survives across sessions.

EDIT PRESERVATION (CRITICAL — read every iteration):
You are editing existing code, NOT redesigning the app. The user expects that when they ask for a small change, ONLY that small change happens. Drift kills trust faster than bugs do.

Rules:
1. Identify exactly what the user is asking to change. Then change ONLY that.
2. Everything that was NOT mentioned in the user request must come through to your output unchanged — same Tailwind classes, same copy, same component structure, same colors, same layout, same state shape, same variable names, same comments. Treat unmentioned elements as locked.
3. If the user says "change the button color to red", you change one className on one button. You do NOT also tighten spacing, swap fonts, restructure layouts, rename state, or reword copy elsewhere.
4. If the user describes a small interaction tweak ("the timer should pause on click"), you add or modify the minimum logic needed. The visual layout, palette, typography, and copy stay byte-for-byte identical.
5. NEVER "improve" parts the user didn't mention, even if you spot something you'd do differently. Their existing choices are intentional.
6. Before writing your output, do a mental diff: which lines must change to fulfill the request? If your diff is bigger than the request implies, you're drifting — go back and shrink it.
7. If the user's request truly does require widespread change (e.g. "completely redesign", "start over", "use a different layout style"), then yes, rewrite freely. Otherwise, surgical edits only.
8. The "notes" field should describe the specific change you made, not a redesign summary. "Made the Save button blue" — not "Refined the visual hierarchy and adjusted the action bar."

This rule applies on EVERY iteration after the first generation. The first generation is your one chance to make broad design choices; from then on, every change is a precision edit.

ERROR FEEDBACK PROTOCOL:
If the user message includes a section "PREVIOUS ERROR:", you have a runtime error from your last iteration. Fix that error specifically — touch only what's needed to resolve the error, leave everything else exactly as it was. If the same error appeared in two consecutive turns, REWRITE THE WHOLE APP from the original goal in a different way. Do not iterate on broken code more than twice.

DESIGN NOTES (memory across iterations):
If the user message contains "ESTABLISHED DESIGN DECISIONS:" treat that list as locked. Those are choices the user has already accepted. Don't re-derive them. Don't drift from them. If the current request asks to change one of them, update only that decision and keep the rest.

After generating, you must also output an updated "designNotes" string capturing the current set of established design decisions — palette, typography, layout pattern, copy tone, behaviors, anything load-bearing. Be terse: bullet lines, no fluff. This is a memory store, not documentation. Carry forward everything from the input ESTABLISHED DESIGN DECISIONS that's still true, drop anything the user just changed, add anything new this turn confirms.

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
    designNotes: { type: Type.STRING, description: 'Updated terse bullet list of established design decisions to carry forward to future iterations. Carry forward what is still true, update what changed this turn.' },
  },
  required: ['title', 'summary', 'code', 'notes', 'designNotes'],
};

interface GenerateRequest {
  cardId: string;
  prompt: string;
  // Optional: if the iframe captured a runtime error, include it so Gemini can fix.
  lastError?: string;
  // Optional: caller can choose a model. Falls back to the default.
  modelId?: string;
  // Optional: image URLs (Cloudinary) attached to this prompt for visual context.
  imageUrls?: string[];
}

/** Fetch an image URL and return it as Gemini-compatible inline base64 data. */
async function fetchImageAsInlineData(
  url: string
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return { inlineData: { mimeType: contentType, data: base64 } };
  } catch {
    return null;
  }
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

  const attachedImages = (body.imageUrls || []).slice(0, 6); // hard cap on images per call
  const imageNote = attachedImages.length > 0
    ? `\n\nThe user attached ${attachedImages.length} image${attachedImages.length === 1 ? '' : 's'} below — use them for visual reference (style, layout, colors, content).`
    : '';

  const isIteration = !!currentCode;

  // -- Preflight: on iterations, decide whether to ASK or ACT, and classify the edit type
  //    so we can route to the right model when the user picked 'Auto'. First generations
  //    skip preflight to keep the initial momentum.
  const preflight = isIteration
    ? await runPreflight({
        apiKey,
        prompt: body.prompt,
        cardTitle: card.title,
        cardSummary: card.summary || undefined,
        hasCurrentCode: true,
        recentThread: threadContext,
        designNotes: typeData.designNotes,
      })
    : { decision: 'ACT' as const, editType: 'first' as const, rationale: 'first generation' };

  // Short-circuit: when preflight asks for clarification, append the questions as a Kan
  // message and don't burn a full generation. The user can answer in chat next turn.
  if (preflight.decision === 'ASK' && preflight.questions && preflight.questions.length > 0) {
    const questionsText = preflight.questions.length === 1
      ? `Quick question before I make this change: ${preflight.questions[0]}`
      : `Quick questions before I make this change:\n\n${preflight.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    const existingMessagesForAsk = (card.messages || []) as unknown as Array<Record<string, unknown>>;
    const userMessageObj = {
      id: nanoid(),
      type: 'question' as const,
      content: body.prompt,
      imageUrls: attachedImages.length > 0 ? attachedImages : undefined,
      authorId: session.user.id,
      createdAt: new Date().toISOString(),
    };
    const aiMessageObj = {
      id: nanoid(),
      type: 'ai_response' as const,
      content: questionsText,
      createdAt: new Date().toISOString(),
    };
    const updatedMessages = [...existingMessagesForAsk, userMessageObj, aiMessageObj];
    await db.update(cards).set({
      messages: updatedMessages as unknown as typeof cards.$inferInsert.messages,
      updatedAt: new Date(),
    }).where(eq(cards.id, body.cardId));

    return NextResponse.json({
      success: true,
      clarification: { questions: preflight.questions, rationale: preflight.rationale },
      messages: updatedMessages,
      typeData,  // unchanged
    });
  }

  // Build the prompt for full generation. Inject designNotes verbatim so the
  // model treats prior decisions as locked unless this turn's request changes them.
  const designNotesBlock = typeData.designNotes
    ? `ESTABLISHED DESIGN DECISIONS (locked unless this request changes one):\n${typeData.designNotes}`
    : '';

  const iterationReminder = isIteration
    ? `\n\n⚠️ THIS IS AN EDIT, NOT A REDESIGN. Edit type (preflight): ${preflight.editType}. Change only what the request asks. Everything else in the current code must come through unchanged — same classes, copy, structure, colors, behavior. If your diff is bigger than the request implies, you are drifting — shrink it.`
    : '';

  const userMessage = [
    `ORIGINAL GOAL (card title): ${card.title}`,
    currentCode
      ? `CURRENT CODE (this is your starting point — preserve it except for what the user asks to change):\n\`\`\`jsx\n${currentCode}\n\`\`\``
      : 'CURRENT CODE: (none yet — this is the first generation, design freely)',
    designNotesBlock,
    `RECENT THREAD CONTEXT:\n${threadContext}`,
    body.lastError ? `PREVIOUS ERROR:\n${body.lastError}` : '',
    `USER REQUEST:\n${body.prompt}${imageNote}${iterationReminder}`,
  ].filter(Boolean).join('\n\n');

  // Resolve which Gemini model to call. Validate against the allow-list so a bad
  // client param can't make us hit an unsupported endpoint. 'auto' is virtual —
  // resolveActiveModelId routes to Pro/Flash based on the preflight edit type.
  const requestedModelId = body.modelId && PLAYGROUND_MODELS.some(m => m.id === body.modelId)
    ? body.modelId
    : DEFAULT_PLAYGROUND_MODEL_ID;
  const activeModelId = requestedModelId === AUTO_MODEL_ID
    ? resolveActiveModelId(AUTO_MODEL_ID, preflight.editType)
    : requestedModelId;
  const model = getPlaygroundModel(activeModelId === AUTO_MODEL_ID ? FALLBACK_GENERATION_MODEL_ID : activeModelId);

  const client = new GoogleGenAI({ apiKey });

  // Resolve attached images into inlineData parts so Gemini can see them.
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  for (const url of attachedImages) {
    const part = await fetchImageAsInlineData(url);
    if (part) imageParts.push(part);
  }

  let parsed: { title: string; summary: string; code: string; notes: string; designNotes?: string } | null = null;
  let usage: { promptTokenCount?: number; candidatesTokenCount?: number } | null = null;
  try {
    const response = await client.models.generateContent({
      model: model.id,
      contents: [{ role: 'user', parts: [{ text: userMessage }, ...imageParts] }],
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
    // Stable HMAC of the card id, used by the iframe runtime to authenticate
    // window.kanthinkAI calls back to /api/playground/ai. Same value every time.
    cardToken: typeData.cardToken || signCardToken(body.cardId),
    // Persistent design memory — model returns updated bullet list each turn,
    // we re-inject it on the next iteration so old decisions don't fade.
    designNotes: typeof parsed.designNotes === 'string' && parsed.designNotes.trim().length > 0
      ? parsed.designNotes.trim()
      : typeData.designNotes,
  };

  // Build the new thread: append user prompt + Kan's notes
  const existingMessages = (card.messages || []) as unknown as Array<Record<string, unknown>>;
  const userMessageObj = {
    id: nanoid(),
    type: 'question' as const,
    content: body.prompt,
    imageUrls: attachedImages.length > 0 ? attachedImages : undefined,
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
