/**
 * Upload a file straight to storage with a signature from our server, and return its
 * URL. Print files (PDFs, TIFFs, large images) are often bigger than a serverless
 * request can carry, so they go direct and only the link comes back to us.
 */
export async function uploadToStorage(file: File, signUrl: string): Promise<string> {
  const sigRes = await fetch(signUrl, { method: 'POST' })
  const sig = await sigRes.json()
  if (!sigRes.ok) throw new Error(sig?.error?.message ?? 'Couldn’t start the upload.')
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', String(sig.timestamp))
  form.append('signature', sig.signature)
  form.append('folder', sig.folder)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/raw/upload`, { method: 'POST', body: form })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.secure_url) throw new Error(json?.error?.message ?? 'The upload didn’t finish. Try again.')
  return json.secure_url as string
}

/** A file as a data: URL, for small files sent inline. */
export function asDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
