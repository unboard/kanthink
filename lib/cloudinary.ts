import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export async function uploadImageToCloudinary(
  buffer: Buffer,
  options?: { cardId?: string }
): Promise<CloudinaryUploadResult> {
  const folder = options?.cardId
    ? `kanthink/cards/${options.cardId}`
    : 'kanthink/cards';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto' }],
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error('No result from Cloudinary'));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );

    uploadStream.end(buffer);
  });
}

// ===== /record — signed direct-to-Cloudinary video uploads =====
// Recordings can be large (tens of MB), so the browser uploads straight to
// Cloudinary. We only sign the request server-side so api_secret never ships
// to the client and the upload params can't be tampered with.

export interface VideoUploadSignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

export function signVideoUpload(options: { folder: string }): VideoUploadSignature {
  const timestamp = Math.floor(Date.now() / 1000);
  // Only the params Cloudinary signs (alphabetical) — must match the form the
  // client sends exactly, or Cloudinary rejects with "Invalid Signature".
  const signature = cloudinary.utils.api_sign_request(
    { folder: options.folder, timestamp },
    process.env.CLOUDINARY_API_SECRET as string
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY as string,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
    folder: options.folder,
  };
}

export async function destroyVideo(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: 'video', invalidate: true });
}

// The single transform recordings are delivered with. Kept in one place so the
// delivery URL and the eager (pre-baked) derivative stay byte-for-byte identical
// — if they drift, the eager work is wasted and playback falls back to a live
// transcode on first request.
//
// These recordings are screen capture: sharp text, hard edges, large flat areas.
// That is the worst case for a perceptual encoder, and plain `q_auto` treated it
// like camera footage — it crushed a 22 MB source to 287 kbps and smeared every
// bit of UI text. The settings below exist to stop that:
//
//   quality 95         — fixed quality, not a perceptual budget. Measured on a
//                        real 61s capture: q_auto 287 kbps, q_auto:best 491,
//                        q_90 600, q_95 748, q_100 6040. q_auto's tiers all
//                        target "looks fine for video"; 95 targets "text is
//                        still legible". q_100 balloons to 46 MB — 2x the
//                        source — and that genuinely does buffer, so it is not
//                        the safe upper bound it looks like.
//   bit_rate 6m        — a ceiling, not a target. Non-binding at q_95 for normal
//                        captures; it exists so a pathologically busy recording
//                        degrades gracefully instead of shipping a 46 MB file.
//   fps 30             — the studio records at 30. Canvas capture reports a bogus
//                        1000 fps, so Cloudinary guessed 50, and 50 fps cannot be
//                        paced evenly on a 60 Hz display — frames alternate
//                        between one and two refreshes, which reads as stutter
//                        even when nothing is dropped. Pinning 30 divides cleanly.
//   h264:high          — High profile carries fine detail far better than the
//                        baseline profile at the same bitrate, and every browser
//                        we target decodes it in hardware.
export const RECORDING_DELIVERY_TRANSFORM = {
  quality: 95,
  bit_rate: '6m',
  fps: 30,
  video_codec: 'h264:high',
} as const;

/**
 * Build a delivery URL for a recording. We force mp4/h264 so the <video> tag
 * plays everywhere (recordings are captured as webm, which Safari can't play).
 * The derivative is pre-generated by ensureRecordingTranscoded(), so this URL
 * normally hits a cached asset instead of triggering a live transcode.
 *
 * Always derive the URL from the public id at read time — never persist it.
 * The stored copy used to freeze whatever transform was current at upload, so
 * old recordings kept serving the old (bad) encode forever and any fix here
 * silently applied to new uploads only.
 */
export function recordingDeliveryUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    secure: true,
    format: 'mp4',
    transformation: [RECORDING_DELIVERY_TRANSFORM],
  });
}

/**
 * Kick off eager (async) generation of the exact mp4 derivative that
 * recordingDeliveryUrl() serves. Without this the first playback of every
 * recording pays for a synchronous webm→mp4 transcode of the whole clip, which
 * is what makes gallery playback feel heavy. Fire-and-forget: Cloudinary
 * transcodes in the background and caches the result at the CDN edge.
 */
export async function ensureRecordingTranscoded(publicId: string): Promise<void> {
  await cloudinary.uploader.explicit(publicId, {
    type: 'upload',
    resource_type: 'video',
    eager: [{ ...RECORDING_DELIVERY_TRANSFORM, format: 'mp4' }],
    eager_async: true,
  });
}

/**
 * Build a JPG thumbnail from a video frame. `timeSec` picks the moment to grab
 * (0 = first frame), so this covers both the default thumbnail and any
 * user-chosen scene frame without storing an image. Cloudinary renders and
 * caches the frame on first request.
 */
export function recordingFrameUrl(
  publicId: string,
  opts?: { timeSec?: number; width?: number }
): string {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    secure: true,
    format: 'jpg',
    transformation: [
      { start_offset: String(Math.max(0, opts?.timeSec ?? 0)) },
      { width: opts?.width ?? 640, crop: 'limit', quality: 'auto' },
    ],
  });
}
