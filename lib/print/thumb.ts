/**
 * A smaller copy of a stored image, for previews. Cloudinary resizes on the fly;
 * anything else is returned as is. Safe on the server and in the browser.
 */
export function thumb(url: string, width: number): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/image/upload/')) return url
  return url.replace('/image/upload/', `/image/upload/c_limit,w_${width},q_auto,f_auto/`)
}
