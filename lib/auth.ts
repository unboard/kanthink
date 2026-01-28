import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from './db'
import { users, accounts, sessions, verificationTokens } from './db/schema'
import { eq } from 'drizzle-orm'

// Only include Google provider if credentials are configured
const providers = []
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: {
    strategy: 'database',
  },
  callbacks: {
    async session({ session, user }) {
      // Fetch full user data including subscription info
      const dbUser = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      })

      if (dbUser) {
        session.user.id = dbUser.id
        session.user.tier = dbUser.tier || 'free'
        session.user.subscriptionStatus = dbUser.subscriptionStatus || 'free'
        session.user.byokProvider = dbUser.byokProvider
        session.user.hasByok = !!dbUser.byokApiKey
      }

      return session
    },
  },
  pages: {
    signIn: '/settings',
    error: '/settings',
  },
})

// Extend session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      tier: 'free' | 'premium'
      subscriptionStatus: 'free' | 'active' | 'canceled' | 'past_due'
      byokProvider?: 'anthropic' | 'openai' | null
      hasByok: boolean
    }
  }
}
