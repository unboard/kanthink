'use server'

import { signIn } from '@/lib/auth'

export async function signInWithGoogle(redirectTo?: string) {
  await signIn('google', { redirectTo: redirectTo || '/' })
}
