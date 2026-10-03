import { checkDesign, findingsBrief } from './slopCheck'

/**
 * One-click design passes from the Style tab.
 *
 * Each is an ordinary build with a fixed brief, so it lands in the app's thread,
 * can be undone like any other build, and goes through the same guards that stop a
 * rewrite from dropping a feature. The briefs live on the server: the client says
 * which pass, never what it says.
 */

export type StylePass = 'restyle' | 'polish' | 'bolder' | 'quieter' | 'fix' | 'payments'

export const STYLE_PASSES: StylePass[] = ['restyle', 'polish', 'bolder', 'quieter', 'fix']

/** Every pass a build accepts, including the payment fix, whose brief is written in generateApp. */
export const BUILD_PASSES: StylePass[] = [...STYLE_PASSES, 'payments']

const VISUAL_ONLY = `This is a VISUAL pass. You may change classes, spacing, typography, layout and component markup anywhere in the app. You must NOT change behaviour: same features, same state shape, same window.kanthinkData keys, same calculations, same flows, and copy that means the same thing. Every feature that works now must still work.`

export function isStylePass(value: unknown): value is StylePass {
  return typeof value === 'string' && (BUILD_PASSES as string[]).includes(value)
}

/** The message that appears in the thread, in the owner's voice. */
export const PASS_LABEL: Record<StylePass, string> = {
  restyle: 'Restyle the app to match its style',
  polish: 'Polish the design',
  bolder: 'Make the design bolder',
  quieter: 'Make the design quieter',
  fix: 'Fix what the design check found',
  payments: 'Fix how the app takes payment',
}

export function passPrompt(pass: StylePass, code: string | null | undefined, look?: string | null): string {
  switch (pass) {
    case 'restyle':
      return `${PASS_LABEL.restyle}.

${VISUAL_ONLY}

Rebuild the look on the STYLE SYSTEM: the colour tokens instead of raw Tailwind colours, font-heading and font-sans, the radius scale, the density, and kit components in place of hand-rolled buttons, inputs, cards, tabs, dialogs and toasts. Follow the look's direction and the design quality rules. Replace the ESTABLISHED DESIGN DECISIONS about palette, fonts and corners with the new style.`
    case 'polish':
      return `${PASS_LABEL.polish}.

${VISUAL_ONLY}

A finishing pass, done the way a careful designer would before launch. Small refinements, not a redesign:
- One consistent spacing scale; align edges that almost line up.
- A clear type scale: one page title in font-heading, clear section headings, readable body text. No more than three sizes on a screen.
- Button hierarchy: one primary action per screen, the rest outline or ghost.
- Every state looks designed: empty, loading, error and success.
- Visible focus states, tap targets at least 44px, tabular-nums on numbers.
- Remove leftovers: stray colours, inconsistent corners, unneeded borders and shadows.`
    case 'bolder':
      return `${PASS_LABEL.bolder}.

${VISUAL_ONLY}

Increase the confidence, not the decoration: a bigger, heavier font-heading scale with more contrast between levels; the key content (the board, the total, the result) noticeably larger; bg-primary used decisively for the main action and the current selection; tighter, more direct copy. Stay inside the style tokens. No gradients, glows, or new animation.`
    case 'quieter':
      return `${PASS_LABEL.quieter}.

${VISUAL_ONLY}

Turn the volume down: colour only for the primary action and real state; lighter weights; more whitespace; fewer borders, badges, icons and dividers; secondary text in text-muted-foreground. Remove decoration that isn't helping someone use the app.`
    case 'payments':
      // Written in generateApp, which has the app's settings and Kan's review.
      return PASS_LABEL.payments
    case 'fix': {
      const { findings } = checkDesign(code, { hasStyle: true, look })
      const brief = findings.length ? findingsBrief(findings) : '- Nothing flagged. Make no changes.'
      return `${PASS_LABEL.fix}.

${VISUAL_ONLY}

The automatic design check found these. Fix each one everywhere it occurs:
${brief}`
    }
  }
}
