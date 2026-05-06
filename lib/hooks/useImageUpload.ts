'use client';

import { useState, useCallback } from 'react';

interface UploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

interface UseImageUploadOptions {
  cardId?: string;
}

const MAX_FILES = 5;
// Vercel's platform body limit is ~4.5MB; compress so phone photos fit.
const MAX_DIMENSION = 2400;
const COMPRESS_THRESHOLD = 1.5 * 1024 * 1024; // skip compression for files already under this
const TARGET_QUALITY = 0.85;

async function downscaleImage(file: File): Promise<File> {
  // Only photos benefit from canvas re-encoding; leave GIFs alone (canvas drops animation).
  if (file.type === 'image/gif') return file;
  if (file.size < COMPRESS_THRESHOLD) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const targetW = Math.round(bitmap.width * scale);
  const targetH = Math.round(bitmap.height * scale);

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(targetW, targetH)
    : Object.assign(document.createElement('canvas'), { width: targetW, height: targetH });
  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  // Prefer JPEG for photos to maximize compression; preserve PNG transparency for screenshots.
  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob: Blob | null = canvas instanceof OffscreenCanvas
    ? await canvas.convertToBlob({ type: outputType, quality: TARGET_QUALITY })
    : await new Promise(resolve => (canvas as HTMLCanvasElement).toBlob(resolve, outputType, TARGET_QUALITY));
  if (!blob) return file;
  if (blob.size >= file.size) return file; // canvas re-encode somehow grew it — bail.

  const ext = outputType === 'image/png' ? '.png' : '.jpg';
  const newName = file.name.replace(/\.[^.]+$/, '') + ext;
  return new File([blob], newName, { type: outputType, lastModified: Date.now() });
}

export function useImageUpload({ cardId }: UseImageUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    const prepared = await downscaleImage(file).catch(() => file);

    const formData = new FormData();
    formData.append('file', prepared);
    if (cardId) {
      formData.append('cardId', cardId);
    }

    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      if (response.status === 413) {
        throw new Error("That image is too large to upload. Try a smaller photo (under ~4MB).");
      }
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to upload image');
    }

    const data = await response.json();
    return {
      url: data.url,
      publicId: data.publicId,
      width: data.width,
      height: data.height,
    };
  }, [cardId]);

  const uploadFiles = useCallback(async (files: File[]): Promise<UploadResult[]> => {
    const filesToUpload = files.slice(0, MAX_FILES);
    setIsUploading(true);
    setError(null);

    const results: UploadResult[] = [];

    try {
      for (const file of filesToUpload) {
        const result = await uploadFile(file);
        results.push(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }

    return results;
  }, [uploadFile]);

  return {
    uploadFile,
    uploadFiles,
    isUploading,
    error,
    clearError,
  };
}
