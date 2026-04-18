'use server';

import bcrypt from 'bcryptjs';
import { createAdminSession, destroyAdminSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';
import * as Sentry from "@sentry/nextjs";

export async function verifyAdminPassword(password: string) {
  return await Sentry.withServerActionInstrumentation('verifyAdminPassword', { recordResponse: false }, async () => {
    try {
      // 1. Rate Limit Check (5 attempts per minute per IP)
      const clientIp = (await headers()).get('x-forwarded-for') || 'unknown';
      if (!checkRateLimit(`login:${clientIp}`)) {
        return { success: false, error: 'Πολλές προσπάθειες. Δοκιμάστε αργότερα.' };
      }

      let hash = process.env.ADMIN_PASSWORD_HASH;

      // Handle Base64 version to avoid Next.js mangling $ characters
      const hashB64 = process.env.ADMIN_PASSWORD_HASH_B64;
      if (hashB64) {
        hash = Buffer.from(hashB64, 'base64').toString('utf8');
      }

      if (!hash) {
        const err = 'ADMIN_PASSWORD_HASH or ADMIN_PASSWORD_HASH_B64 is not set.';
        console.error(err);
        Sentry.captureMessage(err, 'error');
        return { success: false, error: 'Server configuration error' };
      }

      if (typeof password !== 'string' || password.length === 0) {
        return { success: false, error: 'Λάθος κωδικός πρόσβασης' };
      }

      const ok = await bcrypt.compare(password, hash);
      
      if (!ok) {
        return { success: false, error: 'Λάθος κωδικός πρόσβασης' };
      }

      await createAdminSession();
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      console.error('Auth failure:', error);
      return { success: false, error: 'Internal server error' };
    }
  });
}

export async function logoutAdmin() {
  return await Sentry.withServerActionInstrumentation('logoutAdmin', { recordResponse: true }, async () => {
    try {
      await destroyAdminSession();
      return { success: true };
    } catch (error) {
      Sentry.captureException(error);
      return { success: false };
    }
  });
}
