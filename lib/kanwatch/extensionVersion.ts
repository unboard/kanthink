import manifest from '@/extensions/kanwatch/manifest.json';

/** The extension version in this build — what a reloaded extension reports. */
export const CURRENT_EXTENSION_VERSION: string = manifest.version;

/** True when a reported version is older than this build's, or missing entirely. */
export function isExtensionOutdated(reported: string | null | undefined): boolean {
  if (!reported) return true;
  const a = reported.split('.').map(Number);
  const b = CURRENT_EXTENSION_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  }
  return false;
}
