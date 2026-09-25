/**
 * The popup and the extension agree on their version.
 *
 * Chrome loads an unpacked extension's popup fresh from disk but keeps its old
 * background worker running until reload. The popup compares its own version with
 * the worker's to tell you to reload; if the two constants drift, it would either
 * nag forever or never notice. Bump both together.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { isExtensionOutdated, CURRENT_EXTENSION_VERSION } from '@/lib/kanwatch/extensionVersion'

describe('Kanwatch extension version', () => {
  it('is the same in the popup and the manifest', () => {
    const popup = fs.readFileSync(path.join(process.cwd(), 'extensions/kanwatch/popup.js'), 'utf8')
    const declared = popup.match(/POPUP_VERSION = '([\d.]+)'/)?.[1]
    expect(declared).toBe(CURRENT_EXTENSION_VERSION)
  })

  it('treats a missing or older version as outdated', () => {
    expect(isExtensionOutdated(null)).toBe(true)
    expect(isExtensionOutdated('0.1.0')).toBe(true)
    expect(isExtensionOutdated(CURRENT_EXTENSION_VERSION)).toBe(false)
    expect(isExtensionOutdated('9.0.0')).toBe(false)
  })
})
