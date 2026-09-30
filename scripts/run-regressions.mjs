import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scripts = readdirSync(new URL('./', import.meta.url))
  .filter((name) => name.endsWith('-regression.mjs'))
  .sort();
let passed = 0;
let failed = 0;
let skipped = 0;
for (const script of scripts) {
  if (
    script.endsWith('-db-regression.mjs') ||
    script === 'sprint4-theme-transition-regression.mjs'
  ) {
    console.log(`SKIP DB: ${script}`);
    skipped++;
    continue;
  }
  console.log(`RUN ${script}`);
  const result = spawnSync(process.execPath, [`scripts/${script}`, '--ui-only'], {
    cwd: root,
    stdio: 'inherit',
    timeout: 120_000,
  });
  if (result.error || result.status !== 0) {
    console.error(`FAIL ${script}: ${result.error?.message ?? result.signal ?? result.status}`);
    failed++;
  } else {
    passed++;
  }
}
console.log(`Regression scripts: ${passed} passed, ${failed} failed, ${skipped} DB-only skipped.`);
console.log('DB portions of mixed scripts are also excluded via --ui-only.');
process.exitCode = failed ? 1 : 0;
