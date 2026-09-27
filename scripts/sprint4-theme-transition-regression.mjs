// Local Docker DB only. Migration and fixtures are rolled back together.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/202609270001_sprint_4_theme_transition.sql');
const original = read('../supabase/migrations/202609030001_step_2_learning_collection.sql');
const selectBody = (sql) =>
  sql.match(/create or replace function public\.select_collection_theme\([\s\S]*?\n\$\$;/)[0];
// After the new gate, selection/randomness/pending behavior must stay byte-equivalent.
const tail = (sql) => selectBody(sql).replaceAll('\r', '').split('  select exists (\n')[1];
assert.equal(tail(migration), tail(original));
const input = `begin;\n${migration.replace(/^begin;\s*/, '').replace(/commit;\s*$/, '')}\n${read('../supabase/tests/sprint_4_theme_transition.sql')}\nrollback;`;
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
  'PASS theme transition, reveal/growth/pending, ownership and permissions; all changes rolled back',
);
