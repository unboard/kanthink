import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  mailingGuide,
  checkEddmEligibility,
  POSTCARD_SIZES,
  type AudienceMode,
} from '@/lib/snailblast/campaign';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'gemini-2.5-flash';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ReviewFinding {
  severity: 'blocker' | 'warning' | 'ok';
  title: string;
  detail: string;
}

interface ReviewRequest {
  imageData: string; // data:image/...;base64,...
  side: 'front' | 'back';
  mode: AudienceMode;
  sizeId: string;
}

/**
 * Reviews uploaded artwork against the mailing rules that actually get a piece
 * rejected. The size/EDDM checks are decided in code before the model is asked
 * anything — those are arithmetic, not judgement, and the model should never be
 * the thing standing between a customer and a correct answer about geometry.
 */
export async function POST(req: Request) {
  let body: ReviewRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { imageData, side, mode, sizeId } = body;
  if (!imageData || typeof imageData !== 'string') {
    return NextResponse.json({ error: 'imageData is required' }, { status: 400 });
  }
  const match = imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'imageData must be a base64 image data URL' }, { status: 400 });
  }
  if (match[2].length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image is larger than 8MB' }, { status: 413 });
  }

  const findings: ReviewFinding[] = [];

  // --- decided in code, not by the model -------------------------------
  const size = POSTCARD_SIZES.find((p) => p.id === sizeId);
  if (size && mode === 'eddm') {
    const check = checkEddmEligibility(size.widthIn, size.heightIn);
    findings.push(
      check.eligible
        ? {
            severity: 'ok',
            title: `${size.label} is EDDM eligible`,
            detail: 'This trim clears the USPS EDDM dimensional minimums.',
          }
        : {
            severity: 'blocker',
            title: `${size.label} cannot be mailed as EDDM`,
            detail: check.reasons.join(' '),
          }
    );
  }

  const guide = mailingGuide(mode);

  const apiKey = process.env.OWNER_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      findings,
      note: 'Visual review is unavailable — no image model configured. Dimensional checks still ran.',
    });
  }

  const sidePrompt =
    side === 'back'
      ? `This is the ADDRESS SIDE. It must satisfy: ${guide.rules.join(' ')}`
      : `This is the FRONT (design side). There are no postal reservations here, so judge it on whether it will actually work as mail: is the offer legible at arm's length, is there a clear call to action, is contact information present and readable, does anything important sit close enough to the trim edge to be cut off?`;

  const prompt = `You are a print production reviewer checking a postcard before it goes on press for a USPS ${
    mode === 'eddm' ? 'EDDM' : 'addressed mail'
  } campaign.

${sidePrompt}

Report only what you can actually see in the image. Do not invent problems, and do not report a rule as violated if the artwork simply does not show that region. If the piece looks fine, say so.

Return ONLY a JSON array, no markdown fence:
[{"severity":"blocker"|"warning"|"ok","title":"short label","detail":"one sentence, plain language, say what to change"}]

Use "blocker" only for something that would get the piece rejected at the dock or ruin the print. Use "warning" for things that will cost response rate. Maximum 6 items.`;

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: match[1], data: match[2] } },
          ],
        },
      ],
      config: { maxOutputTokens: 1200 },
    });

    let raw = (response.text || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) raw = fenced[1].trim();

    let visual: ReviewFinding[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        visual = parsed
          .filter((f) => f && typeof f.title === 'string' && typeof f.detail === 'string')
          .slice(0, 6)
          .map((f) => ({
            severity: ['blocker', 'warning', 'ok'].includes(f.severity) ? f.severity : 'warning',
            title: String(f.title),
            detail: String(f.detail),
          }));
      }
    } catch {
      // Model didn't return the schema — keep the code-decided findings rather
      // than failing the whole review.
    }

    return NextResponse.json({ findings: [...findings, ...visual], guide });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Review failed';
    console.error('[SnailBlast artwork review]', message);
    return NextResponse.json({ findings, guide, note: `Visual review unavailable: ${message}` });
  }
}
