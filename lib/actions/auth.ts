'use server'

import { signIn } from '@/lib/auth'

export async function signInWithGoogle(formData: FormData) {
  const redirectTo = formData.get('redirectTo') as string || '/'
  await signIn('google', { redirectTo })
}
