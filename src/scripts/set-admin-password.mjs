#!/usr/bin/env node
// Set a new admin password (owner, 2026-11-03: «I can't log in»).
//
//   node src/scripts/set-admin-password.mjs
//
// Asks for the password twice without echoing it (so it never lands on the
// screen, in a chat or in the shell history), then:
//   - writes ADMIN_PASSWORD_HASH_B64 AND ADMIN_PASSWORD_HASH into .env.local
//     (the login reads the B64 one FIRST — updating only the plain one, as
//     init-admin-secrets.mjs prints, leaves the old password in force);
//   - prints the B64 value to paste into Vercel → Settings → Environment
//     Variables → ADMIN_PASSWORD_HASH_B64 (Production), then redeploy.
// Base64 because Next.js mangles the `$` signs of a raw bcrypt hash in env vars.
// The password itself is stored nowhere; a bcrypt hash cannot be reversed.
import fs from 'node:fs';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(question);
      else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const first = await askHidden('New admin password: ');
const second = await askHidden('Type it again: ');
if (first !== second) {
  console.error('\nThe two entries differ — nothing changed.');
  process.exit(1);
}
if (first.length < 10) {
  console.error('\nUse at least 10 characters — nothing changed.');
  process.exit(1);
}

const hash = await bcrypt.hash(first, 12);
const b64 = Buffer.from(hash, 'utf8').toString('base64');

const file = '.env.local';
let env = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const setLine = (text, key, value) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`;
};
env = setLine(env, 'ADMIN_PASSWORD_HASH_B64', b64);
env = setLine(env, 'ADMIN_PASSWORD_HASH', `"${hash}"`);
fs.writeFileSync(file, env);

console.log('\nDone. .env.local updated (this PC).');
console.log('\nFor the live site, set this in Vercel → Settings → Environment Variables (Production),');
console.log('then redeploy:\n');
console.log(`ADMIN_PASSWORD_HASH_B64=${b64}\n`);
