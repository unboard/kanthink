import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from './db'
import { users, accounts, sessions, verificationTokens } from './db/schema'
import { eq } from 'drizzle-orm'
import { convertPendingInvites } from './api/permissions'

/**
 * Check if the given email is an admin user.
 * Admin email is configured via ADMIN_EMAIL environment variable.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
  if (!adminEmail) return false
  return adminEmail === email.toLowerCase()
}

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
        session.user.isAdmin = isAdmin(dbUser.email)
      }

      return session
    },
  },
  events: {
    async signIn({ user }) {
      // Convert any pending email invites to active shares for this user
      if (user.id && user.email) {
        try {
          await convertPendingInvites(user.id, user.email)
        } catch (err) {
          console.error('Failed to convert pending invites:', err)
        }
      }
    },
  },
  pages: {
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
      byokProvider?: 'openai' | 'google' | null
      hasByok: boolean
      isAdmin: boolean
    }
  }
}
