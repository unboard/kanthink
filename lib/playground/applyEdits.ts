/**
 * Applying targeted edits to an app instead of rewriting it.
 *
 * Measured on real apps: output tokens are about two thirds of what a build costs,
 * and essentially all of what a build *waits* on — a model emitting 3,800 tokens
 * takes over a minute regardless of how small the change was. Because the generator
 * always asked for the complete file back, changing one colour cost the same as
 * rebuilding the app.
 *
 * So for small edits the model returns find/replace pairs instead. A one-line change
 * becomes a few dozen output tokens rather than several thousand.
 *
 * The whole scheme rests on this module being paranoid. A patch that applies
 * *almost* correctly produces a subtly broken app, which is far worse than a slow
 * rebuild — so every edit must match exactly once, and anything at all suspicious
 * fails the batch and lets the caller fall back to a full rewrite.
 */

export interface CodeEdit {
  /** Exact text to find in the current code. Must appear exactly once. */
  find: string;
  /** What replaces it. */
  replace: string;
}

export type ApplyResult =
  | { ok: true; code: string; applied: number }
  | { ok: false; reason: string };

/** A patched file that no longer looks like a mountable app is a failed patch. */
function looksLikeApp(code: string): boolean {
  return /export\s+default\s+App\b/.test(code) || /export\s+default\s+function\s+App\b/.test(code);
}

/**
 * Apply edits in order, each against the result of the last.
 *
 * Ordering matters: an edit can legitimately target text an earlier edit produced,
 * and checking every `find` against the *original* would reject that.
 */
export function applyCodeEdits(code: string, edits: CodeEdit[]): ApplyResult {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, reason: 'no edits returned' };
  }
  if (!looksLikeApp(code)) {
    // Nothing to be gained from patching something we can't verify afterwards.
    return { ok: false, reason: 'current code has no default-exported App to patch' };
  }

  let working = code;
  let applied = 0;

  for (const [index, edit] of edits.entries()) {
    if (typeof edit?.find !== 'string' || edit.find.length === 0) {
      return { ok: false, reason: `edit ${index + 1} has an empty "find"` };
    }
    if (typeof edit.replace !== 'string') {
      return { ok: false, reason: `edit ${index + 1} has no "replace"` };
    }
    if (edit.find === edit.replace) {
      return { ok: false, reason: `edit ${index + 1} changes nothing` };
    }

    const first = working.indexOf(edit.find);
    if (first === -1) {
      return { ok: false, reason: `edit ${index + 1} did not match the current code` };
    }
    // Ambiguity is the dangerous case: patching the wrong one of two identical
    // snippets silently changes the wrong part of the app.
    if (working.indexOf(edit.find, first + 1) !== -1) {
      return { ok: false, reason: `edit ${index + 1} matched more than once — not specific enough` };
    }

    working = working.slice(0, first) + edit.replace + working.slice(first + edit.find.length);
    applied++;
  }

  if (working === code) {
    return { ok: false, reason: 'edits left the code unchanged' };
  }
  if (!looksLikeApp(working)) {
    return { ok: false, reason: 'edits removed the default-exported App' };
  }

  return { ok: true, code: working, applied };
}

/**
 * Edit types worth patching rather than rewriting.
 *
 * Cosmetic and behaviour changes touch a handful of lines by definition. Structural
 * work and redesigns rearrange enough of the file that a patch would be neither
 * smaller nor safer than simply asking for the file.
 */
export function shouldPatch(editType: string, hasCode: boolean): boolean {
  return hasCode && (editType === 'cosmetic' || editType === 'behavior');
}
