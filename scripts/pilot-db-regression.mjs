// Only the named local Docker database; migration and fixtures always roll back.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/202610090002_pilot_core_cycles.sql');
const sql = `begin;\n${migration
  .trim()
  .replace(/^begin;\s*/, '')
  .replace(/commit;\s*$/, '')}\n${read('../supabase/tests/pilot_core_cycles.sql')}\nrollback;`;
const output = execFileSync(
  process.env.DOCKER_PATH ?? 'docker',
  [
    'exec',
    '-i',
    'supabase_db_ssaida-app',
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  { input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
assert.match(output, /ROLLBACK/);
console.log(
  'PASS core-cycle capture, retry deduplication, skipped exclusion, restricted access, account deletion; rolled back.',
);
