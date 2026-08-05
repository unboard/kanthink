// Backfill: pre-bake the mp4 delivery derivative for every existing recording so
// playback streams a cached asset instead of triggering a live webm→mp4 transcode
// on first request. New recordings do this automatically at create time (see
// ensureRecordingTranscoded); this covers the back catalogue.
//
// Re-run this whenever RECORDING_DELIVERY_TRANSFORM changes. The transform is
// imported rather than copied here — when it was duplicated inline, changing the
// encode silently left the whole back catalogue serving the old derivative.
//
// Run: npx tsx scripts/backfill-recording-transcodes.ts

import { createClient } from '@libsql/client'
import { v2 as cloudinary } from 'cloudinary'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { RECORDING_DELIVERY_TRANSFORM } from '../lib/cloudinary'

function loadEnv(): Record<string, string> {
  const scriptDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(scriptDir, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1)
  }
  return env
}

async function main() {
  const env = loadEnv()
  const db = createClient({ url: env.DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN })
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  })

  const { rows } = await db.execute(
    'SELECT id, cloudinary_public_id AS publicId FROM recordings'
  )
  console.log(`Found ${rows.length} recordings to pre-bake.`)

  let ok = 0
  let failed = 0
  for (const row of rows) {
    const publicId = row.publicId as string
    if (!publicId) continue
    try {
      await cloudinary.uploader.explicit(publicId, {
        type: 'upload',
        resource_type: 'video',
        eager: [{ ...RECORDING_DELIVERY_TRANSFORM, format: 'mp4' }],
        eager_async: true,
      })
      ok++
      console.log(`  ✓ queued ${publicId}`)
    } catch (e) {
      failed++
      console.log(`  ✗ ${publicId}: ${(e as Error).message}`)
    }
  }

  console.log(`\nDone. Queued ${ok}, failed ${failed}. Transcodes finish asynchronously on Cloudinary.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
