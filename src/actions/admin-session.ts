'use server';

import { getAdminSession } from '@/lib/session';

export async function isAdminAuthenticated(): Promise<boolean> {
  const session = await getAdminSession();
  return session?.role === 'admin';
}
