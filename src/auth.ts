import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Resend from 'next-auth/providers/resend';
import prisma from '@/lib/prisma';

// Auth.js v5. Login is OPTIONAL — the app builds and runs with NO providers
// configured (anonymous browsing/list/favorites are unaffected); each method
// turns on only when its credentials exist. Env names (Auth.js convention):
//   AUTH_SECRET                      — required to enable auth at all
//   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
//   AUTH_APPLE_ID / AUTH_APPLE_SECRET   (Apple sign-in JWT; needs paid Apple dev)
//   RESEND_API_KEY                   — enables the email magic-link provider
// Database sessions (revocable, stored in the Session table) via the Prisma
// adapter, reusing the driver-adapter singleton from lib/prisma.
const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}
if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) {
  providers.push(Apple);
}
if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || 'Prosfores Pantou <onboarding@resend.dev>',
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  providers,
  trustHost: true,
});
