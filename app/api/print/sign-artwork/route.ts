import { NextResponse } from 'next/server'
import { isCloudinaryConfigured, signVideoUpload } from '@/lib/cloudinary'
import { printUser } from '@/lib/print/server/store'

/**
 * POST /api/print/sign-artwork — a short-lived signature so the studio can upload an
 * artwork file (PDF, TIFF, large image) straight to storage. Print files are routinely
 * bigger than a serverless request body allows, so they never pass through one.
 */
export async function POST() {
  const userId = await printUser()
  if (!userId) return NextResponse.json({ error: { message: 'Sign in.' } }, { status: 401 })
  if (!isCloudinaryConfigured()) return NextResponse.json({ error: { message: 'File storage isn’t configured.' } }, { status: 500 })
  return NextResponse.json(signVideoUpload({ folder: `kanthink/print/${userId}/incoming` }))
}
