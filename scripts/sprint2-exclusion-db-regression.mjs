// Local PostgreSQL only. Temporary users are removed even if assertions fail.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

function sql(statement) {
  return new Promise((resolve, reject) => {
    const process = execFile(
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
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { encoding: 'utf8' },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim()),
    );
    process.stdin.end(statement);
  });
}
await sql(
  readFileSync(new URL('../supabase/tests/sprint_2_exclusion.sql', import.meta.url), 'utf8'),
);
console.log(
  'PASS exclusion SQL: ownership/ACL, snapshot/progress preservation, guards, next-day AUTO, late confirm, manual/reschedule',
);
const user = randomUUID();
const asUser = (body) =>
  `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; ${body} commit;`;
try {
  await sql(`insert into auth.users(id) values('${user}');`);
  await sql(asUser("select public.complete_parent_onboarding('Exclude concurrency',60,'1234');"));
  const child = await sql(
    `select c.id from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id='${user}'`,
  );
  await sql(
    asUser(`insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays)
    values('${child}','ACTIVITY','A',5,array[1,2,3,4,5,6,7]::smallint[]),
    ('${child}','ACTIVITY','B',5,array[1,2,3,4,5,6,7]::smallint[]);
    select public.ensure_daily_plan('${child}',timezone('Asia/Seoul',clock_timestamp())::date);`),
  );
  const plan = await sql(`select id from public.daily_plans where child_id='${child}'`);
  const ids = (
    await sql(`select id from public.daily_tasks where daily_plan_id='${plan}' order by sort_order`)
  ).split(/\r?\n/);
  const [a, b] = ids;
  const stamp = await sql(`select updated_at from public.daily_tasks where id='${a}'`);
  // Hold the child lock in the start transaction, then submit an old exclusion.
  let announce;
  const locked = new Promise((resolve) => {
    announce = resolve;
  });
  const holder = new Promise((resolve, reject) => {
    const p = execFile(
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
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { encoding: 'utf8' },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr || error.message)) : resolve(stdout),
    );
    p.stdout.on('data', (chunk) => {
      if (chunk.includes('LOCKED')) announce();
    });
    p.stdin.end(`begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}';
      select public.start_daily_task('${a}'); select 'LOCKED'; select pg_sleep(1); commit;`);
  });
  await Promise.race([
    locked,
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error('Lock not acquired')), 10000);
      t.unref();
    }),
  ]);
  await assert.rejects(
    sql(asUser(`select public.exclude_daily_task('${a}','${stamp}');`)),
    /Task changed/,
  );
  await holder;
  assert.equal(
    await sql(`select status||':'||excluded_for_today from public.daily_tasks where id='${a}'`),
    'IN_PROGRESS:false',
  );
  console.log(
    'PASS independent sessions: start holds child lock; stale exclusion waits then rejects',
  );
  const bStamp = await sql(`select updated_at from public.daily_tasks where id='${b}'`);
  const attempts = await Promise.allSettled([
    sql(asUser(`select public.exclude_daily_task('${b}','${bStamp}');`)),
    sql(asUser(`select public.exclude_daily_task('${b}','${bStamp}');`)),
  ]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  await assert.rejects(sql(asUser(`select public.start_daily_task('${b}');`)), /Task excluded/);
  assert.equal(
    await sql(`select status||':'||excluded_for_today from public.daily_tasks where id='${b}'`),
    'PLANNED:true',
  );
  console.log('PASS independent sessions: duplicate exclusion has one winner; later start blocked');
} finally {
  await sql(`delete from auth.users where id='${user}';`);
}
