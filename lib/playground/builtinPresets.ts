/**
 * Built-in playground presets.
 *
 * These ship in code rather than the database so every user has working presets on
 * day one, with no seeding step and no migration that has to invent an owner for a
 * row. They are read-only: the API refuses to update or delete them, and a user who
 * wants a variant creates their own.
 *
 * Ids are prefixed `builtin:` so they can never collide with a generated uuid, and
 * so the generate route can tell the two sources apart by inspection.
 */

export interface BuiltinPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  recipe?: string;
  designProfile?: string;
  runtime?: { deps: string[] };
}

export const BUILTIN_PRESET_PREFIX = 'builtin:';

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'builtin:first-principles-3d',
    name: 'First-principles 3D',
    description: 'A three.js visual that explains this thread from the ground up.',
    icon: '🧊',
    runtime: { deps: ['three'] },
    recipe: `Build an interactive three.js visualisation that explains the subject of this card from first principles.

Rules for this build:
- Identify the ONE mechanism that makes the subject work. Visualise that, not a summary of it.
- The visual must be manipulable — the user should be able to change something and watch the consequence. A static scene that merely looks like the subject is a failure.
- Start from the simplest possible case, then let the user add complexity via controls. Build up, don't strip down.
- Label what things are directly in the 3D scene or in a legend beside it. An unlabelled abstract shape teaches nothing.
- Include a short text panel that states the underlying principle in plain language, and updates as the user manipulates the scene.
- Render with three.js via a WebGLRenderer sized to its container, and clean up on unmount (dispose geometries/materials, cancel the animation frame). Handle resize.
- If the subject is not physical, invent an honest spatial metaphor and say in the text panel that it is a metaphor.`,
  },
  {
    id: 'builtin:interactive-quiz',
    name: 'Interactive quiz',
    description: 'A quiz built from whatever this thread is actually about.',
    icon: '🎯',
    recipe: `Build an interactive quiz on the topic being discussed in this card and its thread.

Rules for this build:
- Derive every question from the actual content of this card and thread. Do not invent a generic quiz about the broad subject area.
- 8-12 questions, mixed formats: multiple choice, true/false, and at least two that require ordering or matching.
- Questions must test understanding, not recall of phrasing. If a question can be answered by pattern-matching words from the thread, rewrite it.
- Show the answer with a one-sentence explanation immediately after each response — not at the end. The explanation is the teaching moment.
- Track score, allow retry of missed questions only, and show a short summary of which concepts were weak.
- Keyboard accessible: number keys pick options, Enter advances.
- Persist progress to localStorage so a refresh doesn't lose it.`,
  },
  {
    id: 'builtin:build-with-repo',
    name: 'Build with a repo',
    description: 'Use an open-source library from GitHub, in the browser.',
    icon: '📦',
    recipe: `Build something genuinely useful using the open-source library named in this card or thread.

Rules for this build:
- Identify the library from the card/thread. If it names a GitHub repo, declare it in "dependencies" as "gh:owner/repo" (add a version ref if one is mentioned). If it's on npm, declare the package name.
- Build a real working tool that exercises the library's core capability — not a documentation page, not a feature list, not a landing page for it.
- The point is to get the library's benefit in the browser, immediately. Make the main capability usable within one interaction of load.
- Show the user what the library is doing: surface intermediate state, parameters, or output that would otherwise be invisible.
- If the library needs input, provide a sensible worked example preloaded so the app is useful before the user types anything.
- If the library turns out not to work in a browser ES module context, say so plainly in the UI and build the closest useful thing you can without it.`,
  },
];

export function getBuiltinPreset(id: string): BuiltinPreset | null {
  return BUILTIN_PRESETS.find(p => p.id === id) || null;
}

export function isBuiltinPresetId(id: string): boolean {
  return id.startsWith(BUILTIN_PRESET_PREFIX);
}
