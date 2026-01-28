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

export function useImageUpload({ cardId }: UseImageUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', file);
    if (cardId) {
      formData.append('cardId', cardId);
    }

    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
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
