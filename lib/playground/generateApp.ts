import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { db } from '@/lib/db';
import { cards, tasks, playgroundApps } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { requirePermission, PermissionError } from '@/lib/api/permissions';
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
import { signAppToken } from '@/lib/playground/appToken';
import { runPreflight } from '@/lib/playground/preflight';
import {
  resolveDeps,
  describeDepsForPrompt,
  MAX_RUNTIME_DEPS,
  type ResolvedDep,
} from '@/lib/playground/runtime';
import { stripOptimistic } from '@/lib/playground/thread';

// Long generations on Gemini 2.5 Pro / 3.x Pro with high thinking budgets can
// cleanly exceed 60s. 800s is the Vercel Pro ceiling (300s is only the default),
// so this buys the most headroom the plan allows before the gateway 504s.

// Abort the Gemini call just short of the function ceiling. Without this, the
// platform kills the request mid-flight and the browser gets an HTML 504 that
// JSON.parse chokes on — the user sees "unexpected response" instead of a real
// explanation. Aborting ourselves means we always own the error message.
const GENERATION_DEADLINE_MS = 760_000;

/** What the generator reads off a thread message. */
interface ThreadMessage {
  id?: unknown;
  type?: string;
  content?: string;
  imageUrls?: string[];
  whiteboards?: { snapshotImageUrl?: string }[];
}

interface PlaygroundUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const SYSTEM_PROMPT = `You generate complete single-file React applications that run in a sandboxed iframe with this exact runtime:
- React 19 via esm.sh import map (already configured in the host page)
- Tailwind CSS via Play CDN (already loaded in the host page)
- lucide-react icons via esm.sh (use sparingly)
- NO process.env. NO Node APIs. Additional libraries ONLY as listed under "AVAILABLE LIBRARIES" at the end of this prompt — if that section says none are loaded, use no third-party libraries beyond the ones above.
- localStorage and sessionStorage ARE available (host installs a same-shape shim because the iframe runs in an opaque-origin sandbox). Treat them as per-session — values may not persist across iframe reloads. Use them freely; access never throws. Do NOT add try/catch around .getItem/.setItem to "guard" against the sandbox — that crash is already prevented by the host.
- fetch() works for public CORS-enabled APIs only.

CODE RULES (strict — your output runs unmodified):
1. ONE file. Output JSX (NOT TypeScript types — plain modern React).
2. Imports allowed: react (named imports only — useState/useEffect/etc.), lucide-react, plus anything listed under "AVAILABLE LIBRARIES". NEVER write \`import React from 'react'\` or \`import * as React from 'react'\` — React is already in scope as a global from the host runtime; redeclaring it will fail with "Identifier 'React' has already been declared". Use \`import { useState, useEffect } from 'react';\` only when you need named hooks. Don't import react-dom — the runtime mounts your App component automatically.
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

IMAGE GENERATION (Gemini Nano Banana, already wired up):
You CAN generate images. Use \`window.kanthinkAI.generateImage({ prompt, imageUrl? })\` for any "draw X", "make a picture of Y", "generate an avatar/illustration/logo", style-transfer, or photo-edit feature ("turn this photo into a watercolor"). It routes through the owner's Gemini key to the image model (Nano Banana / gemini-2.5-flash-image-preview). NEVER tell the user "I can't generate images" — you can. NEVER use external image APIs like DALL-E, Stable Diffusion, Unsplash placeholder URLs, or via.placeholder.com — use this helper.

Usage:
\`\`\`jsx
// Text-to-image
const { dataUrl } = await window.kanthinkAI.generateImage({
  prompt: 'A cozy mushroom cottage in a forest, soft watercolor style, warm light',
});
setImage(dataUrl);  // drop straight into <img src={dataUrl} />

// Image edit — pass the source via imageUrl (CDN/Cloudinary) or imageData (data: URL)
const { dataUrl } = await window.kanthinkAI.generateImage({
  prompt: 'Make the sky a dramatic sunset and add a flock of birds',
  imageUrl: sourceCloudinaryUrl,
});
\`\`\`

Returns \`{ dataUrl, mimeType, text?, model }\`. The dataUrl is base64 — use it directly in \`<img src>\`, or pass to \`window.kanthinkUpload\` (convert to a File first) if you need a permanent CDN URL.

ALWAYS wrap calls in try/catch with a loading state. On error, show a SHORT friendly inline message ("Couldn't generate that — try a different prompt") with a retry button. NEVER render \`err.message\` verbatim in the UI — it may contain raw API JSON that looks like garbage to users. If you must show details, render them small/secondary and never as the primary error.

SAVE & SHARE — turn outputs into shareable URLs (already wired up):
The host runtime exposes \`window.kanthinkSave(data, label?)\` for any "save this", "share this", "publish", "send to a friend", "I want a link to this" feature. Each call persists an arbitrary JSON record server-side and returns a real shareable URL like \`https://kanthink.com/play/{token}/r/{slug}\`. Recipients open the URL, see the app, and your code can hydrate them straight into that saved state via \`window.kanthinkInitial.record\`.

ALWAYS use this for: saved ideas, generated artifacts the user wants to keep, "create a public page for this", "send this to my friend", per-item permalink features, anything that should outlive the current session. Do NOT use localStorage for this — localStorage is in-memory per-session and is invisible to anyone else.

Usage:
\`\`\`jsx
// Save a record, get back a shareable URL
const handleShare = async (idea) => {
  try {
    const { url } = await window.kanthinkSave(idea, idea.title);
    setShareUrl(url);  // show it as a copy-to-clipboard link
  } catch (err) {
    setError("Couldn't save — try again.");
  }
};

// On mount, hydrate from a saved record if one was provided in the URL
const [item, setItem] = useState(() => window.kanthinkInitial?.record?.data || null);
\`\`\`

Returns \`{ slug, url, shareToken }\`. The url is absolute https — give it to users via a "Copy link" button, navigator.share, an anchor tag, etc. First save also auto-publishes the playground so the URL works immediately.

Hydration: when the app loads from \`/play/{token}/r/{slug}\`, \`window.kanthinkInitial.record\` is \`{ slug, data, label? }\`. In all other contexts it's \`null\`. ALWAYS check it on mount when the app has a "view a saved thing" mode — that's how a recipient sees what was shared with them.

Limits: ≤ 32 KB per record (after JSON.stringify). For big media, upload via window.kanthinkUpload and save the returned url string. ≤ 200 records per playground (oldest gets dropped).

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

/**
 * The runtime section, appended to the system prompt at call time.
 *
 * This is what makes "build a three.js visual" or "use this GitHub library" possible.
 * The import map is built from the same resolved list, so what the model is told is
 * available is exactly what the iframe can resolve — the two cannot drift.
 */
function buildRuntimeSection(deps: ResolvedDep[]): string {
  const available = deps.length > 0
    ? `AVAILABLE LIBRARIES (already in the iframe import map — import them directly):
${describeDepsForPrompt(deps)}

These are loaded and ready. Use them. Do NOT add <script> tags, do NOT fetch them from a CDN at runtime, and do NOT reimplement what they already do.`
    : `AVAILABLE LIBRARIES: none beyond react and lucide-react.`;

  return `

${available}

DECLARING NEW DEPENDENCIES:
If the app genuinely needs a library that is not listed above, add it to the "dependencies" array in your JSON response AND import it normally in your code. It will be in the import map when your code runs — you do not need a second turn, and you must not write fallback code for its absence.

Declaration format (strict — anything else is dropped):
- npm package: "three", "d3-scale", "@scope/pkg", or pinned "three@0.185.0"
- GitHub repo: "gh:owner/repo" or "gh:owner/repo@ref"
- custom import name: "alias=gh:owner/repo@ref" (use this when the repo name is not a good identifier)
Full URLs are NOT accepted. Maximum ${MAX_RUNTIME_DEPS} dependencies.

Only declare what you actually import. Every extra dependency is another network fetch before the app renders, and a library you use once is worse than the 20 lines it replaced. If the task is genuinely served by react alone, return an empty array.

When dependencies are already listed under AVAILABLE LIBRARIES, echo them back in "dependencies" if you still use them — the list you return replaces the previous one.`;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'A short 3-6 word app name (e.g. "Pomodoro Timer")' },
    summary: { type: Type.STRING, description: 'One sentence describing what the app does' },
    code: { type: Type.STRING, description: 'Complete single-file JSX. Default-export App component. No types, no markdown fences.' },
    notes: { type: Type.STRING, description: 'One conversational sentence about what changed in this iteration. Empty for first generation.' },
    designNotes: { type: Type.STRING, description: 'Updated terse bullet list of established design decisions to carry forward to future iterations. Carry forward what is still true, update what changed this turn.' },
    dependencies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Libraries this code imports beyond react/lucide-react. Format: "three", "three@0.185.0", "@scope/pkg", "gh:owner/repo@ref", or "alias=gh:owner/repo". Empty array if none.',
    },
  },
  required: ['title', 'summary', 'code', 'notes', 'designNotes', 'dependencies'],
};

export interface GenerateRequest {
  /** The playground app being built. Its source card supplies first-build context. */
  appId: string;
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

export async function generatePlaygroundApp(
  body: GenerateRequest,
  session: { user: { id: string } },
  options: { skipPreflight?: boolean } = {}
): Promise<NextResponse> {
  await ensureSchema();
  if (!body.appId || !body.prompt) {
    return NextResponse.json({ error: 'appId and prompt are required' }, { status: 400 });
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

  // Load the app being built, plus the card it is an artifact of.
  const app = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, body.appId) });
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }
  const card = await db.query.cards.findFirst({ where: eq(cards.id, app.cardId) });
  if (!card) {
    return NextResponse.json({ error: 'Source card not found' }, { status: 404 });
  }

  // A build overwrites the app's code and appends to its thread, so it needs edit
  // access to the channel — not merely a signed-in caller holding an app id.
  try {
    await requirePermission(app.channelId, session.user.id, 'edit');
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const currentCode = app.code || undefined;
  const generationCount = app.generationCount ?? 0;
  const isIteration = !!currentCode;

  // Dependencies available for THIS generation: whatever the app already had. The
  // model can add more via its response, applied to the same turn's code — see the
  // dependencies handling after generation.
  const seededDeclarations = [...(app.dependencies || [])];
  const seeded = resolveDeps(seededDeclarations);

  // The app's own thread is the brief. It carries every build request and every bit
  // of discussion since the app was created, so it is passed whole — Gemini's context
  // dwarfs any real thread, and the cap only guards against a runaway one.
  const appMessages = stripOptimistic<ThreadMessage>(app.messages).slice(-40);
  const threadContext = appMessages.length > 0
    ? appMessages
        .map(m => `[${m.type}] ${(m.content || '').slice(0, 6000)}`)
        .join('\n')
    : '(no prior messages)';

  // Source-card context, on the first build only.
  //
  // The card is what the app grew out of: its thread and tasks are the raw brief.
  // After that first build the app owns its own conversation, and re-reading the
  // card every turn would let card edits silently rewrite an app the user had
  // already shaped in its own thread.
  const cardMessages = isIteration
    ? []
    : stripOptimistic<ThreadMessage>(card.messages).slice(-16);

  let sourceContext = '';
  if (!isIteration) {
    const cardThread = cardMessages.length > 0
      ? cardMessages.map(m => `[${m.type}] ${(m.content || '').slice(0, 6000)}`).join('\n')
      : '(no messages on the card)';

    const cardTasks = await db.query.tasks.findMany({
      where: and(eq(tasks.cardId, card.id), eq(tasks.isArchived, false)),
      orderBy: [asc(tasks.position)],
      limit: 30,
    });
    const taskContext = cardTasks.length > 0
      ? cardTasks
          .map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}${t.description ? `: ${t.description.slice(0, 200)}` : ''}`)
          .join('\n')
      : '';

    sourceContext = [
      `SOURCE CARD: ${card.title}`,
      card.summary ? `CARD SUMMARY: ${card.summary}` : '',
      taskContext ? `TASKS ON THE SOURCE CARD (requirements, not a to-do list to render):\n${taskContext}` : '',
      `SOURCE CARD THREAD:\n${cardThread}`,
    ].filter(Boolean).join('\n\n');
  }

  // Images the model should see, newest last.
  //
  // A picture pinned to the thread is a spec — a screenshot of a layout, a photo of
  // a colour scheme, a sketch of a screen. Passing only the images attached to THIS
  // turn meant a reference dropped two messages ago was silently ignored, and on the
  // first build the ones on the source card never arrived at all, even though the
  // card is the brief. Collected here rather than passed by the client so every
  // caller — the drawer, a shroom, voice — gets the same behaviour.
  const collectImages = (messages: ThreadMessage[]): string[] =>
    messages.flatMap((m) => [
      ...(Array.isArray(m.imageUrls) ? m.imageUrls : []),
      // A sketch of a screen is the most direct brief there is, so it counts as an
      // attached image rather than as an aside the model is merely told about.
      ...(Array.isArray(m.whiteboards)
        ? m.whiteboards.map((w) => w?.snapshotImageUrl).filter((u): u is string => !!u)
        : []),
    ]);

  const threadImages = collectImages(appMessages);
  const sourceCardImages = isIteration ? [] : collectImages(cardMessages);
  const cardCover = !isIteration && card.coverImageUrl ? [card.coverImageUrl] : [];

  // Deduped, with this turn's attachments last so they are the freshest thing in
  // view. Capped hard: each image is inlined as base64, so a long illustrated thread
  // would otherwise blow past the request limit before the prompt is even read.
  const attachedImages = Array.from(
    new Set([...cardCover, ...sourceCardImages, ...threadImages, ...(body.imageUrls || [])])
  ).slice(-6);

  const imageNote = attachedImages.length > 0
    ? `\n\n${attachedImages.length} image${attachedImages.length === 1 ? '' : 's'} ${attachedImages.length === 1 ? 'is' : 'are'} attached below — from this thread${isIteration ? '' : ' and the source card'}. Use them as visual reference for style, layout, colour and content.`
    : '';

  // -- Preflight: on iterations, decide whether to ASK or ACT, and classify the edit type
  //    so we can route to the right model when the user picked 'Auto'. First generations
  //    skip preflight to keep the initial momentum.
  const preflight = isIteration && !options.skipPreflight
    ? await runPreflight({
        apiKey,
        prompt: body.prompt,
        cardTitle: card.title,
        cardSummary: card.summary || undefined,
        hasCurrentCode: true,
        recentThread: threadContext,
        designNotes: app.designNotes || undefined,
        imageCount: attachedImages.length,
      })
    : { decision: 'ACT' as const, editType: 'first' as const, rationale: 'first generation' };

  // Short-circuit: when preflight asks for clarification, append the questions as a Kan
  // message and don't burn a full generation. The user can answer in chat next turn.
  if (preflight.decision === 'ASK' && preflight.questions && preflight.questions.length > 0) {
    const questionsText = preflight.questions.length === 1
      ? `Quick question before I make this change: ${preflight.questions[0]}`
      : `Quick questions before I make this change:\n\n${preflight.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

    const existingMessagesForAsk = stripOptimistic(app.messages);
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
    await db.update(playgroundApps).set({
      messages: updatedMessages as unknown as typeof playgroundApps.$inferInsert.messages,
      updatedAt: new Date(),
    }).where(eq(playgroundApps.id, app.id));

    return NextResponse.json({
      success: true,
      clarification: { questions: preflight.questions, rationale: preflight.rationale },
      messages: updatedMessages,
    });
  }

  // Build the prompt for full generation. Inject designNotes verbatim so the
  // model treats prior decisions as locked unless this turn's request changes them.
  const designNotesBlock = app.designNotes
    ? `ESTABLISHED DESIGN DECISIONS (locked unless this request changes one):\n${app.designNotes}`
    : '';

  const iterationReminder = isIteration
    ? `\n\n⚠️ THIS IS AN EDIT, NOT A REDESIGN. Edit type (preflight): ${preflight.editType}. Change only what the request asks. Everything else in the current code must come through unchanged — same classes, copy, structure, colors, behavior. If your diff is bigger than the request implies, you are drifting — shrink it.`
    : '';

  const requestBlock = `USER REQUEST:
${body.prompt}${imageNote}${iterationReminder}`;

  const userMessage = [
    `APP: ${app.title}`,
    currentCode
      ? `CURRENT CODE (this is your starting point — preserve it except for what the user asks to change):\n\`\`\`jsx\n${currentCode}\n\`\`\``
      : 'CURRENT CODE: (none yet — this is the first generation, design freely)',
    designNotesBlock,
    sourceContext,
    `THIS APP'S THREAD:\n${threadContext}`,
    body.lastError ? `PREVIOUS ERROR:\n${body.lastError}` : '',
    requestBlock,
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

  let parsed: {
    title: string;
    summary: string;
    code: string;
    notes: string;
    designNotes?: string;
    dependencies?: string[];
  } | null = null;
  let usage: { promptTokenCount?: number; candidatesTokenCount?: number } | null = null;
  const deadline = AbortSignal.timeout(GENERATION_DEADLINE_MS);
  try {
    const response = await client.models.generateContent({
      model: model.id,
      contents: [{ role: 'user', parts: [{ text: userMessage }, ...imageParts] }],
      config: {
        systemInstruction: SYSTEM_PROMPT + buildRuntimeSection(seeded.deps),
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // A whole single-file app plus design notes. Every model in the picker
        // tops out at 65,536 output tokens, so this is a ceiling for runaway
        // generations, not a budget an ordinary app should ever reach.
        maxOutputTokens: 32000,
        thinkingConfig: model.thinkingBudget > 0 ? { thinkingBudget: model.thinkingBudget } : undefined,
        abortSignal: deadline,
      },
    });

    // Gemini counts thinking against maxOutputTokens, so a run that thinks too
    // hard returns truncated JSON. Say that plainly — JSON.parse would otherwise
    // fail with "Unexpected end of JSON input", which explains nothing.
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      return NextResponse.json(
        {
          error:
            'The app got too long for one response and was cut off. Try asking for it in smaller pieces — build the core first, then add features in follow-up messages.',
        },
        { status: 502 }
      );
    }

    const text = response.text || '';
    parsed = JSON.parse(text);
    usage = response.usageMetadata
      ? {
          promptTokenCount: response.usageMetadata.promptTokenCount,
          candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
        }
      : null;
  } catch (err) {
    if (deadline.aborted) {
      return NextResponse.json(
        {
          error: `${model.label} ran past ${Math.round(GENERATION_DEADLINE_MS / 60_000)} minutes without finishing. Try a smaller change, or switch to Gemini 3.7 Flash — it is the fastest model in the picker.`,
        },
        { status: 504 }
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error from Gemini';
    return NextResponse.json({ error: `Gemini error: ${msg}` }, { status: 502 });
  }

  if (!parsed?.code) {
    return NextResponse.json({ error: 'Gemini returned no code' }, { status: 502 });
  }

  // Persist the build onto the app row, and append the turn to the app's thread.
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const lastUsage: PlaygroundUsage = {
    modelId: model.id,
    inputTokens,
    outputTokens,
    costUsd: computeGenerationCost(model.id, inputTokens, outputTokens),
  };

  // -- Dependencies for the code we just received.
  //    The model declares what it imported, so the import map is built in the same
  //    turn as the code that needs it — no second round trip, no "install then use".
  const declaredByModel = Array.isArray(parsed.dependencies) ? parsed.dependencies : [];
  const merged = resolveDeps(declaredByModel);

  // Invalid declarations cost that library, not the generation. Surface them so the
  // UI can say why an import is missing instead of leaving a silent runtime error.
  const rejectedDeps = merged.rejected;

  // Build the new thread: append user prompt + Kan's notes.
  //
  // Drop any optimistic client messages first. The client shows the user's message
  // immediately and that store write syncs to the server, so by the time we get here
  // the thread can already contain a copy of the prompt we're about to append —
  // which is how user messages ended up rendering twice. The server owns the
  // canonical thread; client placeholders never belong in it.
  const existingMessages = stripOptimistic(app.messages);
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

  const updated = {
    code: parsed.code,
    summary: parsed.summary,
    generationCount: generationCount + 1,
    lastNotes: parsed.notes,
    lastUsage,
    lastModelId: model.id,
    // Persistent design memory — the model returns an updated bullet list each turn
    // and we re-inject it on the next iteration so old decisions don't fade.
    designNotes: typeof parsed.designNotes === 'string' && parsed.designNotes.trim().length > 0
      ? parsed.designNotes.trim()
      : app.designNotes,
    // Store declarations rather than resolved URLs so resolution rules stay changeable.
    dependencies: merged.deps.map(d => d.raw),
    // Stable HMAC of the app id, used by the iframe runtime to authenticate
    // window.kanthinkAI calls back to /api/playground/ai. Same value every time.
    appToken: app.appToken || signAppToken(app.id),
    messages: newMessages,
    // The model names the app on its first build; after that the user's own title wins.
    title: generationCount === 0 ? parsed.title : app.title,
    updatedAt: new Date(),
  };

  await db
    .update(playgroundApps)
    .set(updated as unknown as typeof playgroundApps.$inferInsert)
    .where(eq(playgroundApps.id, app.id));

  return NextResponse.json({
    success: true,
    snapshot: {
      code: parsed.code,
      title: parsed.title,
      summary: parsed.summary,
      notes: parsed.notes,
    },
    app: { ...app, ...updated },
    messages: newMessages,
    usage,
    lastUsage,
    runtime: {
      deps: merged.deps.map(d => ({ specifier: d.specifier, source: d.source, raw: d.raw })),
      rejected: rejectedDeps,
    },
  });
}
