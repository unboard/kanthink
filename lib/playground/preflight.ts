import { GoogleGenAI, Type } from '@google/genai';
import type { EditType } from './models';

export interface PreflightResult {
  decision: 'ACT' | 'ASK' | 'UNSUPPORTED';
  questions?: string[]; // present when decision === 'ASK', max 2 questions
  editType: EditType;   // the model's read on what kind of edit this is
  rationale: string;    // one short sentence; useful for logs / future routing
  /**
   * Capabilities the request needs that this runtime does not have.
   *
   * Present when decision is UNSUPPORTED. Naming them before the build is the point:
   * the alternative is an app that looks like it saves your progress across devices
   * and silently does not, which is worse than being told up front.
   */
  unsupported?: string[];
  /** What CAN be built well, offered instead. Present with UNSUPPORTED. */
  smallerScope?: string;
}

const PREFLIGHT_SYSTEM = `You are a code-generation gatekeeper for a vibe-coding playground. Before we let the heavy model rewrite the app, you decide TWO things in one shot:

1. CLARITY — is the user's request clear enough to act on, or should we ask 1-2 short clarifying questions first?
   - Bias HARD toward ACT. Building is the user's goal; questions create friction.
   - ACT when the request has an obvious sensible default, even if details aren't specified.
   - ACT for vague style requests like "make it cleaner" or "look more modern" — pick a sensible interpretation.
   - ASK only when there are multiple genuinely-different interpretations that would lead to incompatible code, AND picking the wrong one would waste a generation.
   - Never ask more than 2 questions. Each question must be one short sentence with a concrete option list when possible.
   - Never ask about minor preferences (font shade, exact pixel value).
   - NEVER ask the user for image URLs, image files, or descriptions of images. If the request mentions images and the input says images are attached, the builder can already see them — asking for them is always wrong, and tells the user their attachments were ignored when they were not. Return ACT.

2. CAPABILITY — can this runtime actually deliver what was asked?

   The apps run as a single React file in a sandboxed browser iframe. There is no
   server you can write, no database, no account system, and no secret storage.
   localStorage exists but is per-session and per-device: it does NOT survive a
   device change and must never be described to the user as saving or syncing.

   Return UNSUPPORTED when the request's CENTRAL promise needs one of:
   - data that follows a person across devices, or private per-user storage
   - user accounts, sign-in, or anyone else's login
   - multi-user sync, shared live state, or anything collaborative in real time
   - a secret API key, or an API that blocks browser origins
   - work that happens while the app is closed — scheduling, reminders, email

   Do NOT return UNSUPPORTED for something merely adjacent. A game that keeps a high
   score on one device is fine. A note-taking app is fine. Judge the promise, not the
   vocabulary: "save my score" is local and supported; "my progress on my phone and
   my laptop" is not.

   When you return UNSUPPORTED, fill "unsupported" with the missing capability in the
   user's words, and "smallerScope" with the genuinely useful thing that CAN be built
   — one sentence, concrete, not a consolation prize.

3. EDIT TYPE — classify what kind of change this request is:
   - "cosmetic"    — color, font, spacing, copy, simple visual tweaks. No logic or layout changes.
   - "behavior"    — interaction, state, event handling, validation, animation logic.
   - "structural"  — new component, layout shift, state-shape change, multi-section rework.
   - "redesign"    — user explicitly asks to start over / completely change the look.
   - "first"       — only used for the first generation (no current code).

When the request mixes types, pick the most ambitious one. (If both cosmetic and structural changes are requested, return "structural".)

Return JSON matching the schema. Keep "rationale" to one short sentence.`;

const PREFLIGHT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    decision: { type: Type.STRING, description: 'ACT, ASK, or UNSUPPORTED' },
    questions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'When decision is ASK: 1-2 short clarifying questions. Empty when ACT.',
    },
    editType: {
      type: Type.STRING,
      description: 'cosmetic | behavior | structural | redesign | first',
    },
    rationale: { type: Type.STRING },
  },
  required: ['decision', 'editType', 'rationale', 'questions'],
};

/**
 * Would this clarifying question ask for images the builder already holds?
 *
 * Exported so it can be tested without a model call. The cost of getting this wrong
 * is asymmetric: an ASK cancels the build outright, so a question about images both
 * wastes the user's turn and tells them their attachments never arrived — while the
 * builder was holding those very images.
 */
export function asksForAttachedImages(question: string): boolean {
  return /image|photo|picture|screenshot|artwork|graphic/i.test(question);
}

export async function runPreflight(opts: {
  apiKey: string;
  prompt: string;
  cardTitle: string;
  cardSummary?: string;
  hasCurrentCode: boolean;
  recentThread?: string;
  designNotes?: string;
  /**
   * How many images the builder will be given for this turn.
   *
   * Preflight is text-only and cheap, deliberately — but it used to have no idea
   * images existed, so a request like "use these images" read as underspecified and
   * it asked the user to supply image URLs. The build then short-circuited on that
   * question, so attachments the builder would have received were never used and the
   * user was told their images had not come through.
   */
  imageCount?: number;
}): Promise<PreflightResult> {
  if (!opts.hasCurrentCode) {
    // First generation never asks — get out of the way.
    return { decision: 'ACT', editType: 'first', rationale: 'first generation' };
  }

  const images = opts.imageCount ?? 0;
  const userMsg = [
    `APP TITLE: ${opts.cardTitle}`,
    images > 0
      ? `ATTACHED IMAGES: ${images} image${images === 1 ? '' : 's'} from this thread and its source card are attached to this request and WILL be given to the builder, which can see them. Do not ask for image URLs or descriptions.`
      : '',
    opts.cardSummary ? `APP SUMMARY: ${opts.cardSummary}` : '',
    opts.designNotes ? `ESTABLISHED DESIGN DECISIONS:\n${opts.designNotes}` : '',
    opts.recentThread ? `RECENT THREAD (last few turns):\n${opts.recentThread}` : '',
    `USER REQUEST: ${opts.prompt}`,
  ].filter(Boolean).join('\n\n');

  const client = new GoogleGenAI({ apiKey: opts.apiKey });
  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      config: {
        systemInstruction: PREFLIGHT_SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: PREFLIGHT_SCHEMA,
        maxOutputTokens: 600,
      },
    });
    const text = response.text || '';
    const parsed = JSON.parse(text) as Partial<PreflightResult> & { questions?: unknown };
    // Three verdicts now, and anything unrecognised means build — a classifier
  // that returns nonsense should not be able to block work.
    const decision: 'ACT' | 'ASK' | 'UNSUPPORTED' =
      parsed.decision === 'ASK' ? 'ASK'
      : parsed.decision === 'UNSUPPORTED' ? 'UNSUPPORTED'
      : 'ACT';
    const editType: EditType = (
      ['cosmetic', 'behavior', 'structural', 'redesign', 'first'] as const
    ).find((t) => t === parsed.editType) || 'structural';
    const rawQuestions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((q): q is string => typeof q === 'string').slice(0, 2)
      : [];

    // Backstop the instruction above, because the cost of it being ignored is high:
    // an ASK cancels the build, so a question about images both wastes the user's
    // turn and tells them their attachments never arrived — while the builder was
    // holding those very images. A prompt rule is a request; this is not.
    const asksAboutImages = images > 0 && rawQuestions.some(asksForAttachedImages);
    const questions = asksAboutImages ? [] : rawQuestions;

    const unsupported = Array.isArray(parsed.unsupported)
      ? parsed.unsupported.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    const smallerScope = typeof parsed.smallerScope === 'string' ? parsed.smallerScope.trim() : '';

    // UNSUPPORTED only counts when it names what is missing. A verdict with no
    // reason attached would stop the build and tell the user nothing, which is a
    // worse outcome than building the runnable part.
    if (decision === 'UNSUPPORTED' && unsupported.length > 0) {
      return {
        decision: 'UNSUPPORTED',
        editType,
        unsupported,
        smallerScope: smallerScope || undefined,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
      };
    }

    return {
      decision: decision === 'ASK' && questions.length > 0 ? 'ASK' : 'ACT',
      questions: questions.length > 0 ? questions : undefined,
      editType,
      rationale: asksAboutImages
        ? 'preflight asked for images that were already attached; proceeding'
        : typeof parsed.rationale === 'string' ? parsed.rationale : '',
    };
  } catch (err) {
    // If preflight fails, just act — we don't want a broken classifier to block work.
    return {
      decision: 'ACT',
      editType: 'structural',
      rationale: `preflight failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}
