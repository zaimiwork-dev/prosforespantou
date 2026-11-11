// `npm test` / `npm run test:run` entry. On Windows a working directory spelled
// «c:\…» (lower-case drive — VS Code terminals do this) makes vitest load its
// runner twice, and every test file fails before its first test with «Cannot
// read properties of undefined (reading 'config')». Found 2026-11-11 when a
// whole green suite went red from one terminal and not another. Re-enter the
// repo with an upper-case drive letter, then hand over to vitest unchanged.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase());
const res = spawnSync(process.execPath, [`${root}node_modules/vitest/vitest.mjs`, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(res.status ?? 1);
