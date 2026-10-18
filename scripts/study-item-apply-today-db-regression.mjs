import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Requires the migration to be applied to the local development database.
execFileSync(
  'docker',
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
  {
    input: readFileSync(
      new URL('../supabase/tests/study_item_apply_today.sql', import.meta.url),
      'utf8',
    ),
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);
