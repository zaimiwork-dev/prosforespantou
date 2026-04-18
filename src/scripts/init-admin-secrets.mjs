#!/usr/bin/env node
/**
 * Generates the two secrets needed for admin auth:
 *   - SESSION_SECRET (32 random bytes, base64)
 *   - ADMIN_PASSWORD_HASH (bcrypt hash of the given password)
 *
 * Usage:
 *   node src/scripts/init-admin-secrets.mjs "<admin-password>"
 *
 * Copy the output lines into .env.local, then remove the old plaintext
 * ADMIN_PASSWORD entry.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node src/scripts/init-admin-secrets.mjs "<admin-password>"');
  process.exit(1);
}

const sessionSecret = crypto.randomBytes(32).toString('base64');
const passwordHash = await bcrypt.hash(password, 12);

console.log('\n# Add these to .env.local (remove the old plaintext ADMIN_PASSWORD):\n');
console.log(`SESSION_SECRET="${sessionSecret}"`);
console.log(`ADMIN_PASSWORD_HASH="${passwordHash}"`);
console.log('');
