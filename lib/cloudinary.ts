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

/**
 * Build a delivery URL for a recording. We force mp4/h264 so the <video> tag
 * plays everywhere (recordings are captured as webm, which Safari can't play).
 * Cloudinary transcodes on first request and caches the result.
 */
export function recordingDeliveryUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    resource_type: 'video',
    secure: true,
    format: 'mp4',
    transformation: [{ quality: 'auto' }],
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
