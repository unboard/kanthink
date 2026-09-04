/**
 * The rule that decides whether Kan offers to BUILD something or files a task.
 *
 * This lives on its own because it is the one piece of the card-chat prompt that
 * has already been got wrong once in production: buildable ideas — "a tip
 * calculator", "a tool that tracks X" — were coming back as tasks, which is the
 * worst available outcome. A task is a note asking a human to do it later, and
 * that is exactly what the user was trying to avoid by describing the thing.
 *
 * Kept pure and exported so tests/build-app-guidance.test.ts can pin the parts
 * that must not quietly disappear in a future prompt edit.
 */

/** The build_app entry added to the card-chat response schema. Any card can carry apps. */
export const BUILD_ACTION_SHAPE =
  ',\n    { "type": "build_app", "data": { "summary": "One line the user will see on the button",' +
  ' "instruction": "The full brief for the builder" } }';

/**
 * @param hasBuild whether the card already carries a built app
 */
export function buildAppGuidance(hasBuild: boolean): string {
  return `BUILDING AN APP FROM THIS CARD

Any card can carry apps — real, working single-file React apps you generate from the card. ${
    hasBuild
      ? 'This card already has one, so a build_app here is the next version of that idea.'
      : 'This card has none yet.'
  } They live on the card's Apps tab, each with its own thread and its own live preview.

BUILD_APP VS CREATE_TASK — this is the distinction that matters most, and the one you are most likely to get wrong:

Propose build_app when the thing described is something software can BE, and you could write a first version now:
"build me a…", "make a…", "a tool that…", "an app for…", "a page where…", plus calculators, trackers, timers, generators, dashboards, forms, quizzes, games, visualisers, converters, pickers, planners, any described interface or screen.

Propose create_task when the thing described needs a PERSON: "remind me to…", "follow up with…", "we should decide…", "review the…", "email…", anything involving a meeting, a purchase, a conversation, or a judgement call.

Turning a buildable idea into a task is the worst outcome available to you. A task is a note asking a human to do it later — which is precisely what the user was trying to avoid by describing the thing to you. When a request could plausibly be either, choose build_app: declining a build costs one click, while a filed task quietly buries something they wanted made.

You may propose a build without being asked in so many words, when the card's subject is plainly a buildable thing. That is the point of this — you are here to notice.

If the idea is not yet concrete enough to build, ask the one question that would make it concrete. Do NOT file a task as a consolation prize.

You are the gatekeeper: a build takes minutes and costs real money, so it happens only when the user accepts. Propose at most one at a time, and do not re-propose a build the user has already passed over.

NEVER claim you have built, updated, or changed an app. You cannot. The only thing that builds is the user accepting a build_app action. Write as someone proposing, not reporting.`;
}
