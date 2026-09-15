'use client';

import { useEffect } from 'react';
import { startProfileSync } from '@/lib/profile-sync';

// Keeps the anonymous server profile (W4a) in step with this device. Renders
// nothing; mounted once in the root layout. Inert unless
// NEXT_PUBLIC_PROFILE_SYNC=1 and cookie consent — see lib/profile-sync.js.
export function ProfileSync() {
  useEffect(() => startProfileSync(), []);
  return null;
}
