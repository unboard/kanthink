'use client'

import { useEffect } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { useSettingsStore } from '@/lib/settingsStore'

function AuthStateSync({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  useEffect(() => {
    useSettingsStore.getState().setIsSignedIn(!!session)
  }, [session])
  return <>{children}</>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthStateSync>{children}</AuthStateSync>
    </SessionProvider>
  )
}
