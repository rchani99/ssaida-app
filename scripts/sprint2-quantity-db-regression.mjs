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
  readFileSync(new URL('../supabase/tests/sprint_2_quantity.sql', import.meta.url), 'utf8'),
);
console.log(
  'PASS quantity SQL: ownership/privileges, today/status, numeric bounds, immutable settings/progress, late confirmation protection and growth',
);
const user = randomUUID();
const asUser = (body) =>
  `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; ${body} commit;`;
try {
  await sql(`insert into auth.users(id) values('${user}');`);
  await sql(asUser("select public.complete_parent_onboarding('Quantity concurrency',60,'1234');"));
  const child = await sql(
    `select c.id from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id='${user}'`,
  );
  await sql(
    asUser(
      `select public.add_manual_daily_task('${child}',timezone('Asia/Seoul',clock_timestamp())::date,'ACTIVITY','Quantity A',null,null,null,5::smallint); select public.add_manual_daily_task('${child}',timezone('Asia/Seoul',clock_timestamp())::date,'ACTIVITY','Quantity B',null,null,null,5::smallint);`,
    ),
  );
  const plan = await sql(`select id from public.daily_plans where child_id='${child}'`);
  const id = await sql(
    `select id from public.daily_tasks where daily_plan_id='${plan}' order by sort_order limit 1`,
  );
  const stamp = await sql(`select updated_at from public.daily_tasks where id='${id}'`);
  const edit = (value, version = stamp) =>
    sql(asUser(`select public.update_daily_task_quantity('${id}','${version}',${value});`));
  const outcomes = await Promise.allSettled([edit(10), edit(15)]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(outcomes.find((r) => r.status === 'rejected').reason.message, /Task changed/);
  console.log('PASS independent sessions: two quantity saves reject stale writer');
  const fresh = await sql(`select updated_at from public.daily_tasks where id='${id}'`);
  const payload = await sql(
    `select jsonb_agg(jsonb_build_object('id',id,'expected_updated_at',updated_at,'expected_sort_order',sort_order) order by sort_order desc) from public.daily_tasks where daily_plan_id='${plan}'`,
  );
  const reorderRace = await Promise.allSettled([
    edit(20, fresh),
    sql(asUser(`select public.reorder_daily_tasks('${plan}','${payload}'::jsonb);`)),
  ]);
  assert.equal(reorderRace.filter((r) => r.status === 'fulfilled').length, 1);
  console.log('PASS independent sessions: reorder and quantity share stale-version protection');
  const beforeStart = await sql(`select updated_at from public.daily_tasks where id='${id}'`);
  const race = await Promise.allSettled([
    edit(25, beforeStart),
    sql(asUser(`select public.start_daily_task('${id}');`)),
  ]);
  assert.equal(race[1].status, 'fulfilled');
  assert.equal(await sql(`select status from public.daily_tasks where id='${id}'`), 'IN_PROGRESS');
  await assert.rejects(edit(30, beforeStart), /Task changed/);
  console.log('PASS independent sessions: start/quantity serialize; started task cannot be edited');
} finally {
  await sql(`delete from auth.users where id='${user}';`);
}
