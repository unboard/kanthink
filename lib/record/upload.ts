// Client-side publish flow: get a signature, upload the recording blob directly
// to Cloudinary (bypassing our serverless body limit), then create the DB row.

export interface PublishMeta {
  title: string;
  durationMs: number;
  width: number;
  height: number;
  aspectRatio: string;
}

export interface PublishResult {
  id: string;
  url: string;
}

export async function publishRecording(
  blob: Blob,
  meta: PublishMeta,
  onProgress?: (fraction: number) => void
): Promise<PublishResult> {
  // 1. Signature
  const signRes = await fetch('/api/record/sign', { method: 'POST' });
  if (!signRes.ok) {
    const e = await signRes.json().catch(() => ({}));
    throw new Error(e.error || 'Could not authorize upload');
  }
  const { signature, timestamp, apiKey, cloudName, folder } = await signRes.json();

  // 2. Direct upload to Cloudinary (XHR so we get progress events)
  const form = new FormData();
  form.append('file', blob);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);

  const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Bad response from storage'));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(form);
  });

  // 3. Create the recording row
  const createRes = await fetch('/api/record/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId: uploaded.public_id, ...meta }),
  });
  if (!createRes.ok) {
    const e = await createRes.json().catch(() => ({}));
    throw new Error(e.error || 'Could not save recording');
  }
  return createRes.json();
}
