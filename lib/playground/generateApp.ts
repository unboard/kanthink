import { NextResponse } from 'next/server';
import { runStructured } from './generateClient';
import { db } from '@/lib/db';
import { cards, tasks, playgroundApps } from '@/lib/db/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ensureSchema } from '@/lib/db/ensure-schema';
import { requirePermission, PermissionError } from '@/lib/api/permissions';
import { createNotification } from '@/lib/notifications/createNotification';
import { resolveProviderKeys } from '@/lib/ai/keys';
import { nanoid } from 'nanoid';
import {
  PLAYGROUND_MODELS,
  DEFAULT_PLAYGROUND_MODEL_ID,
  AUTO_MODEL_ID,
  FALLBACK_GENERATION_MODEL_ID,
  getPlaygroundModel,
  resolveActiveModelId,
  computeGenerationCost,
  type PlaygroundProvider,
} from '@/lib/playground/models';
import { signAppToken, signDraftAppToken } from '@/lib/playground/appToken';
import { runPreflight, type PreflightResult } from '@/lib/playground/preflight';
import { applyCodeEdits, shouldPatch, type CodeEdit } from '@/lib/playground/applyEdits';
import {
  capabilitiesLost,
  preservationInstruction,
  reconcileRequirements,
  type CapabilityLoss,
} from '@/lib/playground/capabilityGuard';
import { backfillRequirements } from '@/lib/playground/backfillRequirements';
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
  /**
   * How this build was produced. Persisted so patch mode's hit rate is a fact we
   * can query rather than a hope — a patch that quietly never lands would
   * otherwise look exactly like one that always does.
   */
  strategy?: 'patch' | 'rewrite';
  /** Why a patch attempt didn't land, when it didn't. */
  patchOutcome?: 'applied' | 'declined' | 'rejected';
}

const SYSTEM_PROMPT = `You generate complete single-file React applications that run in a sandboxed iframe with this exact runtime:
- React 19 via esm.sh import map (already configured in the host page)
- Tailwind CSS via Play CDN (already loaded in the host page)
- lucide-react icons via esm.sh (use sparingly)
- NO process.env. NO Node APIs. Additional libraries ONLY as listed under "AVAILABLE LIBRARIES" at the end of this prompt — if that section says none are loaded, use no third-party libraries beyond the ones above.
- localStorage and sessionStorage ARE available (host installs a same-shape shim because the iframe runs in an opaque-origin sandbox). They are per-device and per-browser. Use them freely; access never throws. Do NOT add try/catch around .getItem/.setItem to "guard" against the sandbox — that crash is already prevented by the host.
- window.kanthinkData IS available: real per-customer storage on the server, which follows a person to any device they sign in on. See CUSTOMER STORAGE below. This is the one that lets you honestly say "your progress is saved".
- window.kanthinkDownload IS available: saves a file to the person's device — PNG, CSV, JSON, SVG, PDF bytes, anything. The iframe has allow-downloads, so this genuinely works. Handing somebody a file is NOT something this runtime lacks — see SAVING A FILE below.
- window.kanthinkPay MAY be available: when the publisher charges for something inside the app rather than for opening it. See CHARGING FOR AN ACTION below. Taking payments is NOT something this runtime lacks — do not write it off as unsupported.
- fetch() works for public CORS-enabled APIs only.

CODE RULES (strict — your output runs unmodified):
1. ONE file. Output JSX (NOT TypeScript types — plain modern React).
2. Imports allowed: react (named imports only — useState/useEffect/etc.), lucide-react, plus anything listed under "AVAILABLE LIBRARIES". NEVER write \`import React from 'react'\` or \`import * as React from 'react'\` — React is already in scope as a global from the host runtime; redeclaring it will fail with "Identifier 'React' has already been declared". Use \`import { useState, useEffect } from 'react';\` only when you need named hooks. Don't import react-dom — the runtime mounts your App component automatically.
3. Default-export a single component named App. The host runtime mounts <App/> to #root.
4. Use functional components and hooks only. No class components.
5. Style with Tailwind utility classes only. No <style> tags. No CSS-in-JS.
6. Wrap risky logic in try/catch. If you touch external APIs, audio, or canvas, wrap App in a small inline ErrorBoundary class.
7. Anything a person would be upset to lose goes in window.kanthinkData, not localStorage. Progress, entries, scores, collections, settings they spent time on — all of it. localStorage is for throwaway per-device convenience only (which tab was open, an uncommitted draft, a dismissed banner); it never follows anyone to another device, so never describe what is in it as saved or synced.
8. Mobile-first: must work in 375px width. Tap targets ≥ 44px tall. No hover-only UI.
9. NEVER use document.write, eval, new Function, or innerHTML with user input.
10. When a requirement needs something this runtime does not have — multi-user sync between different people in real time, server-side secrets, scheduled or background work, sending email — do NOT quietly build a version that pretends. (Accounts and per-customer storage that survives a device change ARE supported: use window.kanthinkData. Charging for something inside the app IS supported: use window.kanthinkPay. Saving a file to the device IS supported: use window.kanthinkDownload.) A capability the BROWSER has is a capability you have — downloading, the clipboard, canvas, audio, camera and file pickers all work here, and none of them is a reason to call something unsupported. Build everything the runtime CAN do, leave a \`// UNSUPPORTED: <the missing capability>\` comment at the relevant code, and say plainly in your notes which promised part is not real and what it would need. A named gap is useful; a convincing fake is not.
11. Multiple "screens" should use view state in one file, e.g. const [view, setView] = useState('home') with conditional rendering. Do NOT split into multiple files.
12. The app must actually do its job. See COMPLETENESS below — it is the standard your output is judged against, and it outranks looking finished.

COMPLETENESS — what counts as a finished build:

The app reliably performs the core job described in the conversation. Not a
convincing picture of doing it. This applies equally to a first build, an update, a
redesign, and a rewrite after a failed edit.

1. WORK OUT WHAT WAS PROMISED. Read the thread for the outcome the person actually
   wants — "practise times tables", "track what I ate", "split a bill" — and the
   handful of actions that outcome depends on. Those actions are the build.

2. USE THE LATEST AGREED VERSION. A conversation contains changes of mind. Build what
   was settled on most recently. Keep decisions that were accepted; do not reintroduce
   an idea that was considered and dropped, however good it looked.

3. FINISH THE CORE ACTIONS. Every control central to the promised outcome does the
   thing it is labelled with. A button that says Save saves. A score that says 3/5
   counted five answers. A message that says "Saved" appears only after the save
   actually happened — never on a timer, never optimistically for something that did
   not occur.

4. HANDLE THE STATES A REAL USER HITS. Anything that can be slow shows that it is
   working. Anything that can be empty says so and says what to do about it. Anything
   that can fail says what went wrong in plain words and leaves a way forward. These
   are part of the core job, not polish to add later.

5. SAMPLE DATA IS LABELLED AS SAMPLE. Seeding a list so the first screen is not empty
   is good. Presenting invented output as the result of work the app did not do is
   not. If a number was made up, the screen says so.

6. NEVER SIMULATE A PROMISED CAPABILITY. No setTimeout standing in for a real
   operation. No hard-coded "result" where a computation belongs. No "Coming soon"
   on something the person asked for — either build it, or name it as unsupported
   under rule 10 and build the rest.

Smaller and complete beats larger and pretend. If the full idea will not fit, build
the part that works end to end and say what you left out.

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

IMAGE GENERATION (already wired up, both providers):
You CAN generate images. Use \`window.kanthinkAI.generateImage({ prompt, imageUrl?, model?, background?, size? })\` for any "draw X", "make a picture of Y", "generate an avatar/illustration/logo", sticker, style-transfer, or photo-edit feature ("turn this photo into a watercolor"). It routes through the owner's key. NEVER tell the user "I can't generate images" — you can. NEVER use external image APIs like DALL-E, Stable Diffusion, Unsplash placeholder URLs, or via.placeholder.com — use this helper.

Models (omit \`model\` to use the owner's account default):
- \`gemini-3.1-flash-image-preview\` / \`gemini-2.5-flash-image\` — Nano Banana. Best at editing a photo you hand it. NO transparency.
- \`gpt-image-2.5-flare\` — fast, and supports \`background: 'transparent'\`.
- \`gpt-image-2.5-sunburst\` — most capable, also transparent, slower and dearer.

TRANSPARENT BACKGROUNDS — this is what makes sticker, cut-out, icon and overlay apps
possible. \`background: 'transparent'\` returns a real alpha-channel PNG, so the subject
composites over any backdrop with no white box and no halo. It requires a gpt-image
model, so pass BOTH \`model\` and \`background\` together — asking a Gemini model for a
transparent background gets you a picture of a checkerboard. Do not describe a
backdrop in the prompt when you want a cut-out; a scene in the words overrides the
parameter.

Usage:
\`\`\`jsx
// Text-to-image
const { dataUrl } = await window.kanthinkAI.generateImage({
  prompt: 'A cozy mushroom cottage in a forest, soft watercolor style, warm light',
});
setImage(dataUrl);  // drop straight into <img src={dataUrl} />

// A sticker: die-cut subject, no background at all
const { dataUrl } = await window.kanthinkAI.generateImage({
  prompt: 'A fluffy orange tabby cat wearing tiny sunglasses, die-cut sticker art, bold clean outline, flat vibrant colors',
  model: 'gpt-image-2.5-flare',
  background: 'transparent',
  size: '1:1',
});
// Real alpha — safe over any colour, and ready to save or print as a sticker sheet.

// Image edit — pass the source via imageUrl (CDN/Cloudinary) or imageData (data: URL)
const { dataUrl } = await window.kanthinkAI.generateImage({
  prompt: 'Make the sky a dramatic sunset and add a flock of birds',
  imageUrl: sourceCloudinaryUrl,
});
\`\`\`

Returns \`{ dataUrl, mimeType, text?, model }\`. The dataUrl is base64 — use it directly in \`<img src>\`, or pass to \`window.kanthinkUpload\` (convert to a File first) if you need a permanent CDN URL. When you render a transparent image, put it on a checkerboard or a coloured surface so the user can see the cut-out worked — a transparent PNG on a white card looks identical to an opaque one.

ALWAYS wrap calls in try/catch with a loading state. On error, show a SHORT friendly inline message ("Couldn't generate that — try a different prompt") with a retry button. NEVER render \`err.message\` verbatim in the UI — it may contain raw API JSON that looks like garbage to users. If you must show details, render them small/secondary and never as the primary error.

CUSTOMER STORAGE — each person's own work, on any device (already wired up):

window.kanthinkData is per-customer storage held on the server against the email they
signed in with. It is the difference between an app somebody tries once and an app they
come back to. USE IT for: game progress and high scores, journal or habit entries, saved
collections, a profile, settings worth keeping — anything the person built up over time.

Two customers using the same app see completely separate data. The server derives whose
data it is from the signed-in session, never from anything your code sends, so you cannot
read or write someone else's rows and you never need a user id in a key. Publishing a new
version of the app does not touch any of it.

The API:
\`\`\`jsx
// Synchronous, available on first render. Use it for initial state — do NOT render an
// empty screen and fill it in from an await.
window.kanthinkData.signedIn          // boolean
window.kanthinkData.customer          // { email, name } or null — display only
window.kanthinkData.initial           // { [key]: value } — everything already saved

await window.kanthinkData.set(key, value)   // save; rejects if it fails
await window.kanthinkData.get(key)          // one value, or null
await window.kanthinkData.all()             // { [key]: value }
await window.kanthinkData.remove(key)       // forget one
await window.kanthinkData.usage()           // { bytes, keys, limitBytes, limitKeys }
window.kanthinkData.signIn()                // opens the host's sign-in sheet
\`\`\`

THE PATTERN — seed from initial, save on a real event, never lie about the outcome:
\`\`\`jsx
const [progress, setProgress] = useState(
  () => window.kanthinkData?.initial?.progress ?? { level: 1, score: 0 }
);
const [saveState, setSaveState] = useState("idle");  // idle | saving | saved | error

const save = async (next) => {
  setProgress(next);                       // optimistic in the UI is fine
  if (!window.kanthinkData?.signedIn) { setSaveState("idle"); return; }
  setSaveState("saving");
  try {
    await window.kanthinkData.set("progress", next);
    setSaveState("saved");                 // ONLY after the promise resolves
  } catch (err) {
    setSaveState("error");                 // and say so in the UI
  }
};
\`\`\`

RULES for customer storage — these are judged:
- NEVER show "Saved" unless the set() promise actually resolved. A failed save that looks
  successful is the worst thing an app in this runtime can do. Keep a save state, show
  "Saving…", "Saved", or a real error, and let the person retry.
- If signedIn is false the app must still WORK. Let them play, write or build, hold it in
  React state, and show one honest prompt — "Sign in to keep this" with a button calling
  window.kanthinkData.signIn(). Never block the app behind sign-in, and never claim
  something was kept when nobody was signed in.
- Seed state from window.kanthinkData.initial so a returning customer sees their work in
  the first frame instead of a flash of empty.
- Keys are yours to choose: short, stable, lowercase ("progress", "entries", "profile").
  Do NOT put an email or user id in a key — the storage is already theirs.
- Save whole small objects rather than one key per item. Limits are 128 KB a key, 1 MB a
  customer, 200 keys. A write that would cross a limit is REFUSED and rejects; nothing is
  deleted to make room, so show the error and let them tidy up.
- Do not poll, and do not save on every keystroke. Save on a real event: a level finished,
  an entry committed, a debounce of a second or two.

CHARGING FOR AN ACTION — a paywall inside the app (already wired up):

window.kanthinkPay exists when the publisher has chosen to charge for something INSIDE
this app rather than for opening it. Whoever is reading this is free to use the app; your
code decides which of its own actions costs money and asks for payment at that point.

\`\`\`jsx
window.kanthinkPay.enabled     // boolean — does this app charge for anything inside it?
window.kanthinkPay.entitled    // boolean — has THIS person paid?
window.kanthinkPay.price       // "$4.00" / "$4.00/mo" — already formatted, show it
window.kanthinkPay.recurring   // boolean — a subscription rather than a one-off
window.kanthinkPay.unlock()    // opens the host's purchase sheet. Call from a click.
\`\`\`

THE PATTERN — gate the action, not the app:
\`\`\`jsx
const locked = window.kanthinkPay?.enabled && !window.kanthinkPay?.entitled;

<button onClick={() => { if (locked) { window.kanthinkPay.unlock(); return; } exportIt(); }}>
  {locked ? \`Export · \${window.kanthinkPay.price}\` : "Export"}
</button>
\`\`\`

RULES for charging — these are judged:
- Gate on \`enabled && !entitled\`, never on \`!entitled\` alone. \`entitled\` is false for a
  free app too, so the short version hides paid features from everybody.
- Never block the whole app behind unlock(). If the publisher wanted that they would have
  locked the door, and the runtime would not have given you kanthinkPay at all.
- Say what it costs BEFORE the click, on the button itself, using \`price\`. A button that
  looks free and opens a checkout is a dark pattern.
- \`entitled\` is a flag in a browser the person controls, so treat it as what to SHOW, not
  as security. Anything that costs the publisher money is re-checked on the server.
- AI is one of those things. In an app that charges, \`kanthinkAI\` calls from somebody who
  has not paid are REFUSED server-side with \`err.code === "payment_required"\`. Catch it
  and call unlock() rather than showing an error:
\`\`\`jsx
try {
  const out = await window.kanthinkAI.generate({ prompt });
} catch (err) {
  if (err.code === "payment_required") { window.kanthinkPay.unlock(); return; }
  setError("Couldn't generate that — try again.");
}
\`\`\`
- After a purchase the page reloads and \`entitled\` is true, so you do not have to handle
  the transition yourself. Read it fresh on render rather than copying it into state at
  mount — and if you do hold it in state, listen for the \`kanthink:entitled\` window event,
  which the owner's own preview fires when they try their paywall out.
- A free trial is yours to design: count uses in kanthinkData, and call unlock() when the
  allowance runs out. Say plainly how many are left.

SAVING A FILE — give the person the thing they made (already wired up):

window.kanthinkDownload(data, filename, mimeType?) saves a file to their device and
returns a promise. The iframe is granted allow-downloads, so this is a real download
on desktop AND on mobile — it is not a preview limitation and it is not blocked.

\`\`\`jsx
await window.kanthinkDownload(blobOrCanvasOrString, "logo.png");
\`\`\`

It takes whatever you already have:
- a Blob or File                  — used as-is
- an HTMLCanvasElement            — exported (mimeType defaults to image/png)
- a data: URL                     — what kanthinkAI.generateImage returns; decoded for you
- an http(s) URL                  — fetched into a blob first, which is REQUIRED: the
                                    download attribute is ignored cross-origin, so a
                                    plain link to a remote image navigates to it
                                    instead of saving it
- a string                        — CSV, JSON, SVG markup, plain text
- any other value                 — serialised as pretty JSON

RULES for downloads — these are judged:
- NEVER tell someone to right-click, long-press, or "save the image manually". That is
  not an instruction you can follow on a phone, and it is never necessary here.
- NEVER build your own <a download> by hand, and never set target="_top" or try to
  navigate the top window — the frame is sandboxed, top navigation is blocked, and
  kanthinkDownload already does the part that works.
- ALWAYS give the file a real name with a real extension: "logo.png", "entries.csv".
- Downloading is a CLIENT capability. It needs no server, no storage, no sign-in, and
  no purchase. Never list it as an unsupported capability or leave an
  \`// UNSUPPORTED\` comment on it.
- Wrap it in try/catch like anything else, and show a short inline error if it rejects.

kanthinkDownload vs kanthinkUpload vs kanthinkSave: download gives the file to the
person in front of you. Upload puts it on the CDN and gives you back a URL. Save
creates a public page someone else can open.

SAVE & SHARE — turn outputs into shareable URLs (already wired up):
The host runtime exposes \`window.kanthinkSave(data, label?)\` for any "save this", "share this", "publish", "send to a friend", "I want a link to this" feature. Each call persists an arbitrary JSON record server-side and returns a real shareable URL like \`https://kanthink.com/play/{token}/r/{slug}\`. Recipients open the URL, see the app, and your code can hydrate them straight into that saved state via \`window.kanthinkInitial.record\`.

ALWAYS use this for: "create a public page for this", "send this to my friend", per-item permalink features — anything that produces a link for SOMEBODY ELSE to open.

kanthinkSave vs kanthinkData: kanthinkSave makes a public URL anyone holding the link can open. kanthinkData is that one person's private work, which nobody else can read. A high score the player keeps is kanthinkData; a card they want to text to a friend is kanthinkSave.

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

/**
 * Patch mode: the model returns the lines it is changing, not the file.
 *
 * Output tokens are two thirds of what a build costs and nearly all of what it
 * waits on, so for a small edit this is the difference between a few dozen tokens
 * and several thousand. Everything else the full schema carries — title, summary,
 * dependencies — is unchanged by a cosmetic edit and is simply kept.
 */
// Plain JSON Schema rather than the Gemini SDK's enums, because both providers
// take this shape and a build must mean the same thing on either one.
const PATCH_SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      description: 'The exact changes to make. Each "find" must appear EXACTLY ONCE in the current code — include surrounding lines until it is unique.',
      items: {
        type: 'object',
        properties: {
          find: { type: 'string', description: 'Exact text from the current code, copied character for character.' },
          replace: { type: 'string', description: 'What it becomes.' },
        },
        required: ['find', 'replace'],
      },
    },
    notes: { type: 'string', description: 'One conversational sentence about what changed.' },
    designNotes: { type: 'string', description: 'Updated terse bullet list of established design decisions. Carry forward what is still true.' },
  },
  required: ['edits', 'notes', 'designNotes'],
};

const PATCH_INSTRUCTIONS = `You are making a SMALL, TARGETED edit to an app that already works.

Return "edits": a list of find/replace pairs against the CURRENT CODE. Do NOT return the whole file.

Rules — these are strict, a bad edit corrupts a working app:
1. "find" must be copied EXACTLY from the current code, character for character, including indentation.
2. "find" must appear EXACTLY ONCE in the file. If the snippet you want appears more than once, widen it with surrounding lines until it is unique.
3. Keep each "find" as small as it can be while staying unique — usually one line, sometimes a few.
4. Make the smallest set of edits that fully satisfies the request. Do not tidy, reformat, or improve anything you were not asked to touch.
5. If the change genuinely cannot be expressed as a handful of find/replace pairs, return an empty "edits" array and nothing else — the system will rebuild the file instead. That is a valid answer, not a failure.`;

/**
 * Model for reading an existing thread back into a contract.
 *
 * Cheap and deliberately so: pulling requirements out of messages somebody already
 * wrote is extraction, and paying frontier prices for it once per legacy app would
 * be a bad trade for an answer that is then cached forever.
 */
/**
 * What the composer sends when Update is pressed with an empty box.
 *
 * Not a request — the absence of one. Treating it as a request is how a stray click
 * on a finished app spent thirteen cents rewriting twenty-two thousand characters to
 * arrive back where it started.
 */
const EMPTY_UPDATE = 'Update the app based on everything discussed in this thread.';

const REQUIREMENT_RECOVERY_MODEL_ID = 'gemini-3.1-flash-lite';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short 3-6 word app name (e.g. "Pomodoro Timer")' },
    summary: { type: 'string', description: 'One sentence describing what the app does' },
    code: { type: 'string', description: 'Complete single-file JSX. Default-export App component. No types, no markdown fences.' },
    notes: { type: 'string', description: 'One conversational sentence about what changed in this iteration. Empty for first generation.' },
    designNotes: { type: 'string', description: 'Updated terse bullet list of established design decisions to carry forward to future iterations. Carry forward what is still true, update what changed this turn.' },
    dependencies: {
      type: 'array',
      items: { type: 'string' },
      description: 'Libraries this code imports beyond react/lucide-react. Format: "three", "three@0.185.0", "@scope/pkg", "gh:owner/repo@ref", or "alias=gh:owner/repo". Empty array if none.',
    },
    requirements: {
      type: 'string',
      description:
        'The running contract for this app: a terse bullet list of everything it must do, carried forward and updated every turn. Start from the REQUIREMENTS block you were given, keep every line that is still wanted, add whatever this turn asked for, and only drop a line when the user has actually said to. This is what stops an early request being forgotten once it scrolls out of the thread — treat dropping a line as a decision, not tidying.',
    },
  },
  required: ['title', 'summary', 'code', 'notes', 'designNotes', 'dependencies', 'requirements'],
};

export interface GenerateRequest {
  /** The playground app being built. Its source card supplies first-build context. */
  appId: string;
  prompt: string;
  /**
   * Notify the user when this build lands.
   *
   * Set by callers that kick a build off and let the user walk away — accepting
   * Kan's suggestion in a card thread, say. A build runs for minutes, and without
   * this the only way to learn it had finished was to go back and look.
   *
   * Left off where the user is already watching the thing build, which is the app
   * drawer: a notification about the screen you are looking at is just noise.
   */
  notifyWhenDone?: boolean;
  // Optional: if the iframe captured a runtime error, include it so Gemini can fix.
  lastError?: string;
  // Optional: caller can choose a model. Falls back to the default.
  modelId?: string;
  // Optional: image URLs (Cloudinary) attached to this prompt for visual context.
  imageUrls?: string[];
}

/**
 * Ask Cloudinary for a build-sized copy rather than the original.
 *
 * Images are re-sent on every build now that they persist across a thread, so their
 * size compounds: a phone photo is several megabytes, and six of them are inlined as
 * base64 on every single turn. Gemini tiles images for tokenisation, so a 1024px
 * copy is both a fraction of the bytes and a fraction of the input tokens, while
 * staying comfortably legible for reading a screenshot or a sketch.
 *
 * Non-Cloudinary URLs pass through untouched.
 */
export function buildSizedImageUrl(url: string): string {
  // Cloudinary delivery URLs put transformations after /upload/.
  const marker = '/upload/';
  if (!url.includes('res.cloudinary.com') || !url.includes(marker)) return url;
  // Don't stack transformations onto a URL that already carries some.
  const [prefix, rest] = url.split(marker, 2);
  if (!rest || /^[a-z]_[^/]*\//.test(rest)) return url;
  return `${prefix}${marker}c_limit,w_1024,q_auto,f_jpg/${rest}`;
}

/** Fetch an image URL and return it as Gemini-compatible inline base64 data. */
async function fetchImageAsInlineData(
  url: string
): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(buildSizedImageUrl(url));
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
  options: {
    skipPreflight?: boolean;
    /** Force a full rewrite. Used when a caller needs the whole file regenerated. */
    skipPatch?: boolean;
  } = {}
): Promise<NextResponse> {
  await ensureSchema();
  if (!body.appId || !body.prompt) {
    return NextResponse.json({ error: 'appId and prompt are required' }, { status: 400 });
  }

  // Checked before the model is chosen or a key is resolved: there is nothing to
  // build, so there is nothing to bill for either.
  //
  // Only when the app already has code. On a first build the thread IS the request,
  // and an empty composer is the normal way to start.
  const appForEmptyCheck = await db.query.playgroundApps.findFirst({
    where: eq(playgroundApps.id, body.appId),
    columns: { code: true, messages: true },
  });
  if (appForEmptyCheck?.code && body.prompt.trim() === EMPTY_UPDATE) {
    const said = stripOptimistic<ThreadMessage>(appForEmptyCheck.messages);
    let lastBuilt = -1;
    let lastAsked = -1;
    said.forEach((m, i) => {
      const built = (m as { builtVersion?: number }).builtVersion;
      if (typeof built === 'number') lastBuilt = i;
      else if (m.type === 'question' || m.type === 'note') lastAsked = i;
    });
    // Only when we can actually tell. A thread from before builds were marked gets
    // the benefit of the doubt rather than a refusal based on a guess.
    if (lastBuilt > -1 && lastAsked < lastBuilt) {
      return NextResponse.json(
        {
          error:
            'Nothing new to build — everything in this thread has already been built. ' +
            'Describe a change first, then press Update.',
          noChange: true,
        },
        { status: 409 }      );
    }
  }

  // Every provider this account can call. A build is no longer Gemini-only, so the
  // question is not "is there a Google key" but "which models are actually
  // reachable" — the model the user picked decides which key gets used.
  const { keys, error: keyError } = await resolveProviderKeys(session.user.id);
  if (keyError) {
    return NextResponse.json({ error: keyError }, { status: 400 });
  }
  const providers = (Object.keys(keys) as PlaygroundProvider[]).filter((p) => !!keys[p]);
  if (providers.length === 0) {
    return NextResponse.json(
      { error: 'No API key. Add a Gemini or OpenAI key in Settings → AI.' },
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
  // Same cap as the app's own thread. It was smaller, which meant the one build that
  // depends entirely on the card — the first — read less of it than every later build
  // reads of its own thread. A card that had been developed over a long conversation
  // handed the builder only the tail of its own brief.
  const cardMessages = isIteration
    ? []
    : stripOptimistic<ThreadMessage>(card.messages).slice(-40);

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

  // -- Preflight: decide whether to ASK, ACT, or say the runtime cannot do this, and
  //    classify the edit type so 'Auto' routes to the right model.
  //
  //    First builds run it too. They used to skip it for momentum, but the request
  //    most worth catching before spending a build — "keep my progress across my
  //    devices" — usually arrives on the first one, and finding out after the fact
  //    means an app that looks like it saves and does not.
  // Preflight is its own small Gemini call, made before the build model is chosen.
  // An OpenAI-only account simply skips it: the cost of not classifying an edit is
  // that 'auto' routes to the better model, which is the safe direction to be wrong.
  const preflightKey = keys.google?.apiKey;
  const preflight: PreflightResult = !options.skipPreflight && preflightKey
    ? await runPreflight({
        apiKey: preflightKey,
        prompt: body.prompt,
        cardTitle: card.title,
        cardSummary: card.summary || undefined,
        hasCurrentCode: isIteration,
        // Deliberately not the full thread. Preflight decides ACT-vs-ASK and an edit
        // type from a 600-token budget; handing it forty messages at six thousand
        // characters each cost real latency on every single edit and cannot have
        // changed the answer. The last few turns are what the decision turns on.
        recentThread: appMessages
          .slice(-14)
          .map(m => `[${m.type}] ${(m.content || '').slice(0, 500)}`)
          .join('\n'),
        designNotes: app.designNotes || undefined,
        imageCount: attachedImages.length,
      })
    : {
        decision: 'ACT' as const,
        // An iteration that skipped preflight is not a first generation, and calling
        // it one would route 'auto' as though the app did not exist yet.
        editType: isIteration ? ('structural' as const) : ('first' as const),
        rationale: isIteration ? 'preflight unavailable' : 'first generation',
      };

  // An app built before the contract existed has its requirements scattered through
  // a thread instead — and that thread is precisely what the builder cannot see all
  // of, which is the problem the contract solves. Left alone those apps would start
  // empty and keep losing what their owner asked for early on, so the first build
  // after this reads the whole history once and writes it down.
  //
  // On a cheap model: this is extraction, not authorship, and it should not cost
  // frontier tokens. Best effort on purpose — a recovered contract is an improvement,
  // not a precondition, and failing to get one must never block the build.
  let recoveredRequirements: string | null = null;
  if (!app.requirements?.trim() && isIteration && appMessages.length > 0 && preflightKey) {
    recoveredRequirements = await backfillRequirements({
      messages: appMessages,
      appTitle: app.title,
      cardTitle: card.title,
      model: getPlaygroundModel(REQUIREMENT_RECOVERY_MODEL_ID),
      apiKey: preflightKey,
      signal: AbortSignal.timeout(90_000),
    });
    if (recoveredRequirements) {
      console.log('[playground] recovered a contract from the thread for', app.id);
      await db.update(playgroundApps)
        .set({ requirements: recoveredRequirements, updatedAt: new Date() })
        .where(eq(playgroundApps.id, app.id));
    }
  }
  /** The contract in force for this build — the stored one, or the one just recovered. */
  const activeRequirements = app.requirements?.trim() || recoveredRequirements || null;

  // Short-circuit: the runtime cannot do the central thing that was asked for. Say
  // which capability is missing and what can be built instead, and build nothing —
  // an app that pretends to save your progress is worse than being told it cannot.
  if (preflight.decision === 'UNSUPPORTED' && preflight.unsupported?.length) {
    const missing = preflight.unsupported.map((u) => `- ${u}`).join('\n');
    const offer = preflight.smallerScope?.trim();
    const explanation =
      `I can't build that as described. These apps run as a single page in a sandboxed browser tab. ` +
      `Customers can sign in and their own work is kept across devices, but there is no shared ` +
      `real-time state between different people, no background jobs and no server-side secrets.\n\n` +
      `What's missing:\n${missing}\n\n` +
      (offer
        ? `What I can build instead: ${offer}\n\nSay the word and I'll build that, or tell me to go ahead anyway and I'll make the rest work with the limitation clearly marked in the app.`
        : `Tell me which part matters most and I'll build as much of it as actually works.`);

    const existingForUnsupported = stripOptimistic(app.messages);
    const askUserMessage = {
      id: nanoid(),
      type: 'question' as const,
      content: body.prompt,
      imageUrls: attachedImages.length > 0 ? attachedImages : undefined,
      authorId: session.user.id,
      createdAt: new Date().toISOString(),
    };
    const answer = {
      id: nanoid(),
      type: 'ai_response' as const,
      content: explanation,
      createdAt: new Date().toISOString(),
    };
    const merged = [...existingForUnsupported, askUserMessage, answer];

    await db.update(playgroundApps)
      .set({ messages: merged as typeof playgroundApps.$inferInsert.messages, updatedAt: new Date() })
      .where(eq(playgroundApps.id, app.id));

    const after = await db.query.playgroundApps.findFirst({ where: eq(playgroundApps.id, app.id) });
    return NextResponse.json({ app: after, unsupported: preflight.unsupported, asked: true });
  }

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

  // The contract, ahead of the request, because a new request is an addition to it
  // rather than a replacement for it. Without this the only memory of an early
  // requirement is the thread, and the thread is a window.
  const requirementsBlock = activeRequirements
    ? `REQUIREMENTS — everything this app must do. All of it still applies; this turn's request is IN ADDITION unless it explicitly replaces a line. Do not regress any of these:\n${activeRequirements}`
    : 'REQUIREMENTS: (none recorded yet — start the list from what this turn asks for)';

  // The only thing that can authorise deleting anything, decided by preflight from
  // the request itself before a line of code existed. Scoped to this turn, and not
  // re-derived from text anywhere downstream — reading intent out of a transcript
  // after the fact is what let "do not remove the AI comments" authorise removing
  // the AI comments.
  const authorisedRemovals = preflight.requestedRemovals ?? [];
  if (authorisedRemovals.length > 0) {
    console.log('[playground] user asked to remove:', authorisedRemovals.join(' | '));
  }

  const requestBlock = `USER REQUEST:
${body.prompt}${imageNote}${iterationReminder}`;

  const userMessage = [
    `APP: ${app.title}`,
    requirementsBlock,
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
    ? resolveActiveModelId(AUTO_MODEL_ID, preflight.editType, providers)
    : requestedModelId;
  let model = getPlaygroundModel(activeModelId === AUTO_MODEL_ID ? FALLBACK_GENERATION_MODEL_ID : activeModelId);

  // A model pinned to a provider with no key would fail at call time with a
  // provider error nobody can act on. Route it like 'auto' instead and say so.
  let switchedProvider: string | null = null;
  if (!keys[model.provider]) {
    const original = model.label;
    model = getPlaygroundModel(resolveActiveModelId(AUTO_MODEL_ID, preflight.editType, providers));
    switchedProvider = original;
  }

  const apiKey = keys[model.provider]!.apiKey;



  // Resolve attached images into inlineData parts so Gemini can see them.
  // Fetched together rather than one at a time — six sequential round trips to
  // Cloudinary added seconds to every build for no reason.
  const imageParts = (await Promise.all(attachedImages.map(fetchImageAsInlineData)))
    .filter((p): p is { inlineData: { mimeType: string; data: string } } => p !== null);

  interface ParsedBuild {
    title: string;
    summary: string;
    code: string;
    notes: string;
    designNotes?: string;
    dependencies?: string[];
    /** The running contract, carried forward and updated each turn. */
    requirements?: string;

  }

  let parsed: ParsedBuild | null = null;
  type TokenUsage = { inputTokens?: number; outputTokens?: number };
  // Accumulated rather than reassigned: a turn can make two calls (a patch attempt
  // that missed, then the rewrite), and the user should be billed for both.
  const usage = { promptTokenCount: 0, candidatesTokenCount: 0 };
  let sawUsage = false;
  const deadline = AbortSignal.timeout(GENERATION_DEADLINE_MS);

  /** Sum usage across however many calls a turn ended up taking. */
  const addUsage = (u: TokenUsage | null | undefined) => {
    if (!u) return;
    sawUsage = true;
    usage.promptTokenCount += u.inputTokens ?? 0;
    usage.candidatesTokenCount += u.outputTokens ?? 0;
  };

  const runtimeSection = buildRuntimeSection(seeded.deps);

  // Small edits ask for the changed lines instead of the whole file. When that
  // doesn't work out — the model declines, or an edit doesn't apply cleanly — we
  // fall through to a normal rewrite, so a patch attempt can never leave the user
  // worse off than before, only slower on the turns where it misses.
  const patchMode = !options.skipPatch && shouldPatch(preflight.editType, !!currentCode);
  let patchOutcome: 'applied' | 'declined' | 'rejected' | null = null;
  /** Set when a rewrite came back missing something the current code does. */
  let capabilityLoss: CapabilityLoss | null = null;

  try {
    if (patchMode && currentCode) {
      const patchResponse = await runStructured({
        model,
        apiKey,
        systemInstruction: SYSTEM_PROMPT + runtimeSection + '\n\n' + PATCH_INSTRUCTIONS,
        userText: userMessage,
        images: imageParts.map((p) => p.inlineData),
        schema: PATCH_SCHEMA,
        schemaName: 'code_patch',
        // A handful of find/replace pairs. Generous enough for a real edit, small
        // enough that a model trying to smuggle the whole file through here gets
        // cut off and falls back to the rewrite path.
        maxOutputTokens: 8000,
        signal: deadline,
      });
      addUsage(patchResponse);

      if (!patchResponse.truncated) {
        try {
          const patch = JSON.parse(patchResponse.text || '') as {
            edits?: CodeEdit[];
            notes?: string;
            designNotes?: string;
            requirements?: string;
          };
          const result = applyCodeEdits(currentCode, patch.edits ?? []);
          if (result.ok) {
            patchOutcome = 'applied';
            // Title, summary and dependencies belong to the app, not to this edit —
            // a cosmetic change doesn't rename the app or add a library.
            parsed = {
              title: app.title,
              summary: app.summary ?? '',
              code: result.code,
              notes: patch.notes || 'Updated.',
              designNotes: patch.designNotes,
              requirements: patch.requirements,
              dependencies: app.dependencies ?? [],
            };
          } else if ((patch.edits ?? []).length === 0) {
            // The model looked at the request against the current code and decided
            // there was nothing to do. That is an answer, and the right response to
            // it is to change nothing.
            //
            // It used to fall through to a full rewrite, which is how a turn that
            // concluded "no changes were requested" still regenerated the entire
            // file — and a regeneration is exactly where working features go
            // missing. A no-op that silently rewrites the app is worse than either
            // a no-op or a rewrite.
            patchOutcome = 'declined';
            parsed = {
              title: app.title,
              summary: app.summary ?? '',
              code: currentCode,
              notes: patch.notes?.trim()
                || 'Nothing to change — the app already does what was asked.',
              designNotes: app.designNotes ?? undefined,
              requirements: activeRequirements ?? undefined,
              dependencies: app.dependencies ?? [],
            };
          } else {
            patchOutcome = 'rejected';
            console.warn('[playground] patch not applied, rewriting instead:', result.reason);
          }
        } catch {
          patchOutcome = 'rejected';
        }
      } else {
        patchOutcome = 'rejected';
      }
    }

    if (!parsed) {
      const response = await runStructured({
        model,
        apiKey,
        systemInstruction: SYSTEM_PROMPT + runtimeSection,
        userText: userMessage,
        images: imageParts.map((p) => p.inlineData),
        schema: RESPONSE_SCHEMA,
        schemaName: 'generated_app',
        // A whole single-file app plus design notes. Every model in the picker
        // tops out well above this, so it is a ceiling for runaway generations,
        // not a budget an ordinary app should ever reach.
        maxOutputTokens: 32000,
        signal: deadline,
      });
      addUsage(response);

      // Reasoning counts against the output ceiling on both providers, so a run
      // that thinks too hard returns truncated JSON. Say that plainly — JSON.parse
      // would otherwise fail with "Unexpected end of JSON input", which explains
      // nothing to the person whose app was simply too long.
      if (response.truncated) {
        return NextResponse.json(
          {
            error:
              'The app got too long for one response and was cut off. Try asking for it in smaller pieces — build the core first, then add features in follow-up messages.',
          },
          { status: 502 }
        );
      }

      parsed = JSON.parse(response.text || '') as ParsedBuild;

      // A rewrite regenerates the whole file, which is the one moment a working
      // feature can vanish without anyone asking. Check before persisting, and give
      // the model one chance to put back what it dropped.
      if (currentCode && parsed?.code) {
        capabilityLoss = capabilitiesLost(currentCode, parsed.code, authorisedRemovals);

        if (capabilityLoss) {
          console.warn('[playground] rewrite dropped capabilities, retrying:', capabilityLoss.ids.join(', '));
          const retry = await runStructured({
            model,
            apiKey,
            systemInstruction: SYSTEM_PROMPT + runtimeSection,
            userText: userMessage + preservationInstruction(capabilityLoss),
            images: imageParts.map((p) => p.inlineData),
            schema: RESPONSE_SCHEMA,
            schemaName: 'generated_app',
            maxOutputTokens: 32000,
            signal: deadline,
          });
          addUsage(retry);

          if (!retry.truncated) {
            try {
              const second = JSON.parse(retry.text || '') as ParsedBuild;
              const stillLost = second.code
                ? capabilitiesLost(currentCode, second.code, authorisedRemovals)
                : capabilityLoss;
              if (!stillLost) {
                parsed = second;
                capabilityLoss = null;
              } else {
                parsed = second;
                capabilityLoss = stillLost;
              }
            } catch {
              // Keep the first attempt and let the refusal below stand.
            }
          }
        }
      }
    }
  } catch (err) {
    if (deadline.aborted) {
      return NextResponse.json(
        {
          error: `${model.label} ran past ${Math.round(GENERATION_DEADLINE_MS / 60_000)} minutes without finishing. Try a smaller change, or switch to a flash model — they are the fastest in the picker.`,
        },
        { status: 504 }
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `${model.label} error: ${msg}` }, { status: 502 });
  }

  if (!parsed?.code) {
    return NextResponse.json({ error: `${model.label} returned no code` }, { status: 502 });
  }

  // Two attempts and it still came back without features the app already had. Keep
  // the working app. Shipping this would trade a change nobody can see for a
  // regression they will find later, after building three more turns on top of it.
  if (capabilityLoss) {
    return NextResponse.json(
      {
        error:
          `That build came back missing ${capabilityLoss.labels.join(', ')}, which the app ` +
          `currently does and you didn't ask to remove — so it wasn't saved and your app is ` +
          `untouched. Try again, or ask for a smaller change: big rewrites are where features ` +
          `get dropped.`,
      },
      { status: 409 }
    );
  }

  // Persist the build onto the app row, and append the turn to the app's thread.
  const inputTokens = usage.promptTokenCount;
  const outputTokens = usage.candidatesTokenCount;
  const lastUsage: PlaygroundUsage = {
    modelId: model.id,
    inputTokens,
    outputTokens,
    costUsd: computeGenerationCost(model.id, inputTokens, outputTokens),
    strategy: patchOutcome === 'applied' ? 'patch' : 'rewrite',
    ...(patchOutcome ? { patchOutcome } : {}),
  };

  // Anything the model dropped from the contract without the user asking is put
  // back. Restoring a line they had abandoned costs one sentence to say so again;
  // dropping one they still wanted costs several builds and their patience.
  const reconciledRequirements = reconcileRequirements(
    activeRequirements,
    parsed.requirements,
    authorisedRemovals,
  );
  if (reconciledRequirements.restored.length > 0) {
    console.warn(
      '[playground] restored requirement(s) dropped without the user asking:',
      reconciledRequirements.restored.join(' | ')
    );
  }

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
  // A pinned model we could not call is worth one line in the thread. Silently
  // building on something else is how someone concludes the model picker does
  // nothing, having never been told their key for that provider is missing.
  const providerNote = switchedProvider
    ? `

_Built with ${model.label} — there is no API key for ${switchedProvider}. Add one in Settings → AI._`
    : '';
  const aiMessageObj = {
    id: nanoid(),
    type: 'ai_response' as const,
    content: (parsed.notes || (generationCount === 0 ? `Built **${parsed.title}** — ${parsed.summary}` : 'Updated.')) + providerNote,
    // Marks this reply as a BUILD rather than a chat answer. Both are ai_response,
    // so without it there is no way to ask "has anything been said since the last
    // build?" — and that question is what decides whether Update has work to do.
    builtVersion: generationCount + 1,
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
    // One step back, written on the way past. A build overwrites the draft in
    // place, and an app that has never been published has no other history — so
    // without this a mis-aimed click is simply the end of that work.
    previousBuild: currentCode
      ? {
          code: currentCode,
          designNotes: app.designNotes,
          requirements: activeRequirements,
          notes: app.lastNotes,
          dependencies: app.dependencies ?? null,
          generationCount,
          savedAt: new Date().toISOString(),
        }
      : app.previousBuild,

    // The running contract, reconciled rather than taken at face value. The model
    // rewrites this list every turn, so every turn is a chance for a line to fall
    // off — and a line may only leave when the user asked for it to.
    requirements: reconciledRequirements.requirements || null,
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

  // Tell the user it landed, when they aren't the one watching it land.
  // Not awaited: the build is already saved, and a notification that fails to send
  // must not turn a successful build into an error response.
  if (body.notifyWhenDone) {
    createNotification({
      userId: session.user.id,
      type: 'ai_generation_completed',
      title: generationCount === 0 ? `"${updated.title}" is ready` : `"${updated.title}" was updated`,
      body: parsed.summary || 'Your app finished building.',
      data: { cardId: card.id, appId: app.id, channelId: app.channelId },
    }).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    snapshot: {
      code: parsed.code,
      title: parsed.title,
      summary: parsed.summary,
      notes: parsed.notes,
    },
    // The draft token travels with the build. The drawer bakes it into the preview
    // iframe, and an iframe without one cannot call the AI, save, or upload at all —
    // so a response that omits it can leave a working app looking broken. The client
    // also merges rather than replaces, but the payload should be right on its own.
    app: { ...app, ...updated, draftToken: signDraftAppToken(app.id) },
    messages: newMessages,
    usage: sawUsage ? usage : null,
    // How this turn was produced, so the effect of patch mode is observable rather
    // than a thing we merely hope is helping.
    strategy: patchOutcome === 'applied' ? 'patch' : 'rewrite',
    patchOutcome,
    lastUsage,
    runtime: {
      deps: merged.deps.map(d => ({ specifier: d.specifier, source: d.source, raw: d.raw })),
      rejected: rejectedDeps,
    },
  });
}
