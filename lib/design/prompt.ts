import type { ProductSpec, SideSpec } from './products';
import { describeCanvas } from './products';
import { describeBrief, describeAssets, type DesignAsset, type DesignBrief } from './brief';

/**
 * Attached images as the planner sees them — a neutral inventory, not the
 * usage instructions describeAssets() writes. The planner's job is to decide
 * what each image IS, so telling it "image 1 is the logo, reproduce it exactly"
 * would be asserting the very thing it is being asked to determine.
 */
function listAssetsForPlanner(assets: DesignAsset[]): string {
  const lines = assets.map((a, i) =>
    a.pinned
      ? `- Image ${i + 1}: the user has set this to "${a.role}". PINNED — keep this classification.`
      : `- Image ${i + 1}: unclassified (currently defaulting to "${a.role}").`
  );
  return [
    `${assets.length} ${assets.length === 1 ? 'image is' : 'images are'} attached, supplied below in this order:`,
    ...lines,
    'Classify each one in "assets" and say in "note" how you used it.',
  ].join('\n');
}

export interface PlannerInput {
  spec: ProductSpec;
  side: SideSpec;
  brief: DesignBrief;
  assets: DesignAsset[];
  /** The design currently on screen for this side, if any. */
  hasCurrent: boolean;
  /** The other side, if it has been generated — the thing this side must match. */
  otherSide: { label: string; exists: boolean };
}

/**
 * The planner sits between the person typing and the image model.
 *
 * It exists because the two speak different languages. People type "make it pop
 * for my coffee shop"; an image model needs a headline in quotation marks, a
 * named palette, a stated layout and a list of what not to draw. Handing the raw
 * sentence to the image model produces generic stock-photo mush, and asking the
 * person for the missing detail up front produces an abandoned form.
 *
 * So the planner decides. It fills every gap with a specific, defensible choice,
 * renders it, and lets the person react to something real — which is the only
 * way most people can tell you what they want.
 */
export function buildPlannerPrompt(input: PlannerInput): string {
  const { spec, side, brief, assets, hasCurrent, otherSide } = input;

  const assetBlock = assets.length
    ? `\n${listAssetsForPlanner(assets)}`
    : '\nNo images have been attached.';

  return `You are the art director inside a print design tool. Someone is designing a real piece that will be printed and mailed, and you are producing the brief that the image model renders from.

# What you are working on right now
${describeCanvas(spec, side)}

${
  otherSide.exists
    ? `The ${otherSide.label.toLowerCase()} of this same piece already exists and is attached as the LAST image. This side must look like it belongs to the same piece — same palette, same type family, same logo treatment, same level of polish — while doing a different job. Do not repeat its headline or its layout.`
    : `The ${otherSide.label.toLowerCase()} has not been designed yet. Make choices here that a complementary ${otherSide.label.toLowerCase()} can be built from.`
}

# The brief so far
${describeBrief(brief)}
${assetBlock}

# How you work

**Decide, do not interview.** Most people cannot tell you what they want until they see something. If the brief is thin, fill every gap yourself with a specific choice — a real palette, a real typeface character, a real layout, real headline copy — and render it. A confident wrong guess they can react to beats a question they have to answer. Never reply with a question and no render just because detail is missing.

**Write the actual words.** The image model draws exactly the text you specify and invents mush when you are vague. Never write "a headline about spring savings" — write \`Headline: "SPRING TUNE-UP — $89"\`. Specify every string that appears: headline, subhead, call to action, phone, website, address, disclaimer. If you do not have a real detail, invent a plausible placeholder and say so in your reply so they can correct it.

**One idea per side.** A piece that says three things says nothing.

**Iterate, do not restart.** When there is already a design on screen and they ask for a change, keep everything they did not mention. "Make the headline bigger" means the same design with a bigger headline — same palette, same photo, same layout. Describe the whole piece again in the image prompt, because the model needs the full picture, but change only what was asked.

**Ask only when the answer cannot be guessed and changes everything** — a business name you have no way to invent, or a choice between two genuinely opposite directions. Even then, render your best guess in the same turn.

**QR codes cannot be drawn.** A generated QR code is a picture of a QR code — it will not scan, and the person will not find out until they have printed five thousand of them. If they ask for one, direct the layout to leave a clean, empty, light-coloured square with quiet space around it, and say plainly in your reply that you have reserved the space because a code has to be generated from the real URL rather than drawn. Never claim you have added one. The same goes for barcodes and any other scannable mark.

# The image prompt you produce
Write \`imagePrompt\` as a complete, standalone art direction for this one side. It is read without any of the above context, so it must contain everything: layout, composition, palette with specific colours, type treatment, imagery, every literal string of text, and what to leave clear. Write it as flowing directive prose, 120–220 words. Be concrete — "deep forest green background with warm cream type" not "an appealing colour scheme".

Do not restate the trim size, bleed, or reserved regions in \`imagePrompt\` — those are appended automatically. Do describe how the layout works around them.

# Reply format
Return ONLY a JSON object. No markdown fence, no prose outside it.

{
  "reply": "what you say to them, 1-2 sentences, plain and specific about what you just made and why",
  "render": true,
  "imagePrompt": "the full art direction described above",
  "updates": { ...only brief fields you learned or decided this turn... },
  "assets": [{ "index": 1, "role": "logo" | "photo" | "inspiration", "note": "one line on how you used it" }],
  "chips": ["short steer", "another", "a third"]
}

- \`render\`: true for anything that should change the artwork — which is almost everything. Set it false ONLY when they asked a question about the design rather than asking for a change ("why did you go with green?", "will this mail?"). When false, omit \`imagePrompt\`.
- \`updates\`: the brief fields you established, including ones you decided yourself. Set a field to null to clear it. \`mustInclude\` and \`avoid\` are lists that accumulate — send only new entries.
- \`assets\`: one entry per attached image, 1-indexed in the order supplied. Judge from the image itself and from what they said: a wordmark or icon on a plain background is a \`logo\`; a finished piece of design they are pointing at is \`inspiration\`; their own product, premises, team or stock imagery is a \`photo\`. Phrases like "make it look like this" or "similar to this" mean \`inspiration\`. Omit this field when nothing is attached. Never reclassify an image already marked as pinned.
- \`chips\`: 2–3 tappable steers under 5 words each, offering genuinely different directions rather than degrees of the same one ("Photo-led instead", "Bolder palette", "Push the offer bigger"). This is how people discover what they want.

${
  hasCurrent
    ? 'There is already a design on screen for this side. Treat this turn as a revision of it.'
    : 'This is the first design for this side.'
}`;
}

/** What the image model receives. The canvas rules are appended here, once, so
 *  the planner cannot forget them and cannot water them down. */
export function buildImagePrompt(
  imagePrompt: string,
  spec: ProductSpec,
  side: SideSpec,
  assets: DesignAsset[],
  referenceNote: string | null
): string {
  const parts = [
    imagePrompt.trim(),
    '',
    describeCanvas(spec, side),
  ];
  if (assets.length) parts.push('', describeAssets(assets));
  if (referenceNote) parts.push('', referenceNote);
  parts.push(
    '',
    'Render the finished printed artwork only. Every piece of text must be spelled correctly and be genuinely legible at print size.',
    // A drawn QR code is indistinguishable from a real one on screen and scans as
    // nothing on paper. The only safe output is a reserved quiet zone that a
    // real, encoded code can be placed into afterwards.
    'NEVER draw a QR code, barcode, data matrix, or any other machine-scannable symbol — a drawn one does not scan. Where the layout calls for one, leave a clean empty square of flat light colour with clear space around it and nothing printed inside it.'
  );
  return parts.join('\n');
}
