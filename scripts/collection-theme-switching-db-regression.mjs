// Local Docker DB only. The migration and fixtures are rolled back together.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/202610090001_free_collection_theme_switching.sql');
const original = read('../supabase/migrations/202609270001_sprint_4_theme_transition.sql');
const tail = (sql) => sql.replaceAll('\r', '').split('  select exists (\n')[1].trimEnd();
assert.equal(tail(migration), tail(original));
const input = `begin;\n${migration
  .trim()
  .replace(/^begin;\s*/, '')
  .replace(
    /commit;\s*$/,
    '',
  )}\n${read('../supabase/tests/collection_theme_switching.sql')}\nrollback;`;
const result = execFileSync(
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
  { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
assert.match(result, /ROLLBACK/);
console.log(
  'PASS free switching, progress resume, unrevealed completion, pending rewards and ownership; rolled back',
);
