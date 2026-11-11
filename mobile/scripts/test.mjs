// `npm test` entry. On Windows a working directory spelled «c:\…» (lower-case
// drive) makes vitest load its runner twice and every test file fail before
// its first test runs. Re-enter the same directory with an upper-case drive
// letter, then hand over to vitest with whatever arguments were given.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());
const args = process.argv.slice(2);
const res = spawnSync(process.execPath, [`${root}node_modules/vitest/vitest.mjs`, 'run', ...args], { cwd: root, stdio: 'inherit' });
process.exit(res.status ?? 1);
