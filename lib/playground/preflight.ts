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
  /**
   * Features the user has explicitly asked to REMOVE on this turn.
   *
   * Decided here, before a line of code is written, and nowhere else. The builder
   * cannot add to this list: a generator that has just deleted something is the
   * least reliable witness to whether deleting it was wanted.
   *
   * Empty whenever there is any doubt. Keeping a feature nobody wants costs one
   * more sentence; deleting one somebody still needs costs their work.
   */
  requestedRemovals?: string[];
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

   The apps run as a single React file in a sandboxed browser iframe, with no server
   you can write and no secret storage.

   Two kinds of storage exist, and the difference decides most of these calls:
   - window.kanthinkData — real per-customer storage on the server, keyed to the
     email someone signs in with. It DOES follow a person between devices, it is
     private to them, and two customers of the same app never see each other's
     data. "Remember where I got to on my phone and pick it up on my laptop" is
     SUPPORTED. "Only I can see my entries" is SUPPORTED.
   - localStorage — per-device and per-browser, for throwaway convenience only.

   Return UNSUPPORTED when the request's CENTRAL promise needs one of:
   - multi-user sync or shared live state — several DIFFERENT people seeing each
     other's changes, a shared board, a chat room, presence, a leaderboard across
     customers
   - signing in with someone else's identity provider, or reading another service's
     account (Google Drive, a bank, a work SSO)
   - a secret API key, or an API that blocks browser origins
   - work that happens while the app is closed — scheduling, reminders, email,
     push notifications

   Judge the WHOLE conversation, not only the latest message. A requirement stated
   several turns ago still counts — "and it should remember where I got to on my
   phone" said early, then elaborated on, is still the promise being made. Equally,
   a requirement the user later dropped is dropped.

   Do NOT return UNSUPPORTED for something merely adjacent, and do NOT return it for
   anything customer storage now covers. A game that keeps progress per player is
   fine. A journal only its author can read is fine. Somebody signing in and finding
   their work on a second device is fine — that is the runtime working as intended.
   What is not fine is two different people needing to see each other's data.

   ANYTHING THE BROWSER ITSELF DOES IS SUPPORTED, and is never a reason for
   UNSUPPORTED. That includes, and is not limited to:
   - downloading a file the app made — PNG, CSV, JSON, SVG, PDF bytes, a whole
     export. window.kanthinkDownload does this and the frame is granted
     allow-downloads. "Export", "save to my device", "download my logo" are all ACT.
   - the clipboard, canvas and image manipulation, audio and video playback, the
     camera and microphone, a file picker, drag-and-drop, printing, fullscreen,
     geolocation, vibration, speech synthesis
   - taking payment for something inside the app (window.kanthinkPay)
   This has been got wrong before in exactly one direction: an app was told it could
   not offer a download, and shipped instructions to right-click an image to save it
   — to somebody on a phone. If the browser can do it, build it.

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

4. REMOVALS — has the user, on THIS turn, explicitly asked for an existing feature to be taken OUT?

   Fill "requestedRemovals" only for features they have asked you to delete. This is
   the only place a removal can be authorised, so read it strictly:

   - An instruction to KEEP something is not a removal. "Do not remove the AI
     comments", "keep the share link", "leave the upload alone" — all of these mean
     the feature STAYS. They are the opposite of a removal and must never appear here.
   - A removal of one feature says nothing about any other. "Get rid of the image
     upload" authorises removing the upload and nothing else.
   - A request the user later took back is not a removal. If they asked for something
     to go and then changed their mind — "actually keep it", "ignore that", "put it
     back" — the reversal wins, and the list is empty.
   - Talking ABOUT a feature is not asking for its removal. Complaints, questions and
     descriptions of how it behaves are not instructions to delete it.
   - If you are not sure, leave it empty. An unremoved feature is a sentence of
     inconvenience; a wrongly removed one is lost work.

   NAME IT FROM THIS LIST, EXACTLY. When the thing being removed is one of the
   runtime features, copy its name character for character:
     "AI text generation", "AI image generation", "saving customer work",
     "loading saved customer work", "image upload", "shareable save links",
     "opening a shared link"
   The user will not use these words — they will say "the AI comments" or "the
   upload button". Your job is to map what they said onto the right name above. A
   name you invent matches nothing and silently preserves the feature, so a removal
   the user clearly asked for would be refused every time they tried it.

   For a requirement rather than a runtime feature, quote the contract line being
   dropped verbatim instead.

ONE VERDICT. The sections above are things to think about, not fields to fill in.
Put a single value in "decision": UNSUPPORTED if the runtime cannot do the central
thing, else ASK if clarity genuinely requires it, else ACT. UNSUPPORTED outranks ASK,
which outranks ACT. Do NOT return separate "clarity" and "capability" fields.

"unsupported" is an ARRAY of strings, even when there is one item.

Return JSON matching the schema. Keep "rationale" to one short sentence.`;

const PREFLIGHT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    decision: {
      type: Type.STRING,
      description:
        'ONE overall verdict: "UNSUPPORTED", "ASK", or "ACT". UNSUPPORTED outranks ASK, ' +
        'which outranks ACT. Use UNSUPPORTED whenever the central promise needs something ' +
        'this runtime does not have — several different people seeing each other\'s data, ' +
        'real-time collaboration, another service\'s account, a secret API key, or work ' +
        'that happens while the app is closed. Per-customer storage that follows one ' +
        'person between devices IS supported and is never a reason for UNSUPPORTED. ' +
        'Neither is anything the browser itself does on the device — downloading or ' +
        'exporting a file, the clipboard, canvas, audio, the camera, printing. ' +
        'Judging the request clear does NOT make it ACT ' +
        'if the runtime cannot build it.',
    },
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
    unsupported: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'When decision is UNSUPPORTED: the missing capabilities, in the user\'s own words. ' +
        'Empty array otherwise.',
    },
    smallerScope: {
      type: Type.STRING,
      description:
        'When decision is UNSUPPORTED: one concrete sentence describing the genuinely ' +
        'useful thing that CAN be built instead. Empty string otherwise.',
    },
    requestedRemovals: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        'Features the user explicitly asked to REMOVE on this turn. An instruction to ' +
        'KEEP a feature is never a removal. A removal of one feature never covers ' +
        'another. A request the user later reversed is not a removal. Empty array ' +
        'whenever there is any doubt.',
    },
  },
  required: ['decision', 'editType', 'rationale', 'questions', 'unsupported', 'smallerScope', 'requestedRemovals'],
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
  // A first build still gets checked, but only for whether the runtime can do the
  // thing at all — never for clarity. Asking a clarifying question before the first
  // build is friction at the worst possible moment; discovering afterwards that the
  // app cannot keep anyone's progress is worse than a sentence up front.
  const firstBuild = !opts.hasCurrentCode;

  const images = opts.imageCount ?? 0;
  const firstBuildRider = firstBuild
    ? '\n\nTHIS IS THE FIRST BUILD. There is no existing app. Never return ASK — the user is ' +
      'waiting to see something, and a question here is friction at the worst moment. ' +
      'Return UNSUPPORTED only if the CENTRAL promise needs a capability this runtime ' +
      'does not have; otherwise return ACT with editType "first".'
    : '';
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
        systemInstruction: PREFLIGHT_SYSTEM + firstBuildRider,
        responseMimeType: 'application/json',
        responseSchema: PREFLIGHT_SCHEMA,
        maxOutputTokens: 600,
      },
    });
    const text = response.text || '';
    // Loosely typed on purpose: this is model output, and the fields it actually
    // returns are not always the fields that were asked for.
    const parsed = JSON.parse(text) as Partial<PreflightResult> & {
      questions?: unknown;
      capability?: unknown;
      clarity?: unknown;
      unsupported?: unknown;
      smallerScope?: unknown;
      requestedRemovals?: unknown;
    };
    // Three verdicts now, and anything unrecognised means build — a classifier
  // that returns nonsense should not be able to block work.
    // The prompt reasons in three sections, and a model given three headings will
    // sometimes answer with three fields — clarity: ACT, capability: UNSUPPORTED —
    // rather than the one verdict the schema asks for. Read whichever it used, and
    // let the most restrictive win, because silently reading only 'decision' turned
    // a correct refusal into a build.
    const verdicts = [parsed.decision, parsed.capability, parsed.clarity]
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim().toUpperCase());
    const decision: 'ACT' | 'ASK' | 'UNSUPPORTED' =
      verdicts.includes('UNSUPPORTED') ? 'UNSUPPORTED'
      : verdicts.includes('ASK') ? 'ASK'
      : 'ACT';
    // A first build is 'first' whatever the classifier says — there is no existing
    // app for an edit type to describe, and 'auto' routes on it.
    const editType: EditType = firstBuild
      ? 'first'
      : (['cosmetic', 'behavior', 'structural', 'redesign', 'first'] as const)
          .find((t) => t === parsed.editType) || 'structural';
    const rawQuestions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((q): q is string => typeof q === 'string').slice(0, 2)
      : [];

    // Backstop the instruction above, because the cost of it being ignored is high:
    // an ASK cancels the build, so a question about images both wastes the user's
    // turn and tells them their attachments never arrived — while the builder was
    // holding those very images. A prompt rule is a request; this is not.
    const asksAboutImages = images > 0 && rawQuestions.some(asksForAttachedImages);
    // Never ask before the first build, whatever the classifier decided. The prompt
    // says so; this is the backstop, because an ASK there cancels the build the user
    // is sitting waiting for.
    const questions = asksAboutImages || firstBuild ? [] : rawQuestions;

    // Asked for an array, sometimes given a sentence. Both are usable.
    const unsupported = (
      Array.isArray(parsed.unsupported)
        ? parsed.unsupported
        : typeof parsed.unsupported === 'string' ? [parsed.unsupported] : []
    ).filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
    const smallerScope = typeof parsed.smallerScope === 'string' ? parsed.smallerScope.trim() : '';

    // The only list that can authorise deleting something. Read defensively: a
    // classifier that answers oddly should end up authorising nothing, never
    // authorising something by accident.
    const requestedRemovals = (
      Array.isArray(parsed.requestedRemovals)
        ? parsed.requestedRemovals
        : typeof parsed.requestedRemovals === 'string' ? [parsed.requestedRemovals] : []
    )
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter((r) => r.length > 0 && !/^(none|n\/a|nothing|empty)$/i.test(r));

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
        requestedRemovals,
      };
    }

    return {
      requestedRemovals,
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
      editType: firstBuild ? 'first' : 'structural',
      rationale: `preflight failed: ${err instanceof Error ? err.message : 'unknown'}`,
    };
  }
}
