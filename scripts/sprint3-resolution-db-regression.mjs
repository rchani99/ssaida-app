// Local Supabase only; transaction fixtures roll back and race users are removed.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const docker = process.env.DOCKER_PATH ?? 'docker';
const args = [
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
];
function sql(statement, onOutput) {
  return new Promise((resolve, reject) => {
    const process = execFile(docker, args, { encoding: 'utf8' }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr || error.message)) : resolve(stdout.trim()),
    );
    if (onOutput) process.stdout.on('data', onOutput);
    process.stdin.end(statement);
  });
}
await sql(
  readFileSync(new URL('../supabase/tests/sprint_3_resolution.sql', import.meta.url), 'utf8'),
);
console.log(
  'PASS SQL matrix: 93/94/96/98/99/100, preview read-only, permissions/RLS, stale context, prior pending, generation, other-plan protection, exclusion and duplicate-growth guards',
);

const user = randomUUID();
const asUser = (body) =>
  `begin; set local role authenticated; set local "request.jwt.claim.sub"='${user}'; ${body} commit;`;
try {
  await sql(`insert into auth.users(id) values('${user}');`);
  await sql(asUser("select public.complete_parent_onboarding('Resolution race',60,'1234');"));
  const child = await sql(
    `select c.id from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id='${user}'`,
  );
  await sql(
    asUser(`insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page)
    values('${child}','WORKBOOK','Race book',20,array[1,2,3,4,5,6,7]::smallint[],5,100,93);
    select public.ensure_daily_plan('${child}',timezone('Asia/Seoul',clock_timestamp())::date);`),
  );
  const task = await sql(
    `select dt.id from public.daily_tasks dt join public.daily_plans dp on dp.id=dt.daily_plan_id where dp.child_id='${child}'`,
  );
  const conflict = () =>
    sql(
      `update public.daily_tasks set planned_start_page=95,planned_end_page=99,quantity_manually_adjusted=true,quantity_conflict='GAP' where id='${task}';`,
    );
  const preview = async () =>
    JSON.parse(
      (await sql(asUser(`select public.preview_quantity_conflict_resolution('${task}');`)))
        .split(/\r?\n/)
        .find((line) => line.startsWith('{')),
    );
  await conflict();
  let proposal = await preview();
  const resolve = (token) =>
    sql(asUser(`select public.resolve_quantity_conflict('${task}','${token}');`));
  const outcomes = await Promise.allSettled([
    resolve(proposal.context_token),
    resolve(proposal.context_token),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    await sql(
      `select planned_start_page||':'||planned_end_page from public.daily_tasks where id='${task}'`,
    ),
    '94:98',
  );
  console.log('PASS independent sessions: two resolves serialize with exactly one winner');

  // Prepare an unstarted earlier task before blocking new AUTO generation.
  await sql(
    asUser(
      `select public.ensure_daily_plan('${child}',timezone('Asia/Seoul',clock_timestamp())::date-1);`,
    ),
  );
  await conflict();
  proposal = await preview();
  let announce;
  const locked = new Promise((done) => {
    announce = done;
  });
  const holder = sql(
    asUser(`
    select id from public.children where id='${child}' for update;
    do $$ declare p uuid; t uuid; begin
      p:=public.ensure_daily_plan('${child}',timezone('Asia/Seoul',clock_timestamp())::date-1);
      select id into t from public.daily_tasks where daily_plan_id=p;
      perform public.start_daily_task(t); perform public.complete_daily_task(t);
      perform public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',t,'status','PARTIAL','actual_end_page',96)));
    end $$;
    select 'LOCKED'; select pg_sleep(1);`),
    (chunk) => {
      if (chunk.includes('LOCKED')) announce();
    },
  );
  await Promise.race([
    locked,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Lock timeout')), 10000);
      timer.unref();
    }),
  ]);
  await assert.rejects(resolve(proposal.context_token), /Resolution changed/);
  await holder;
  assert.equal(
    await sql(
      `select quantity_conflict||':'||planned_start_page||':'||planned_end_page from public.daily_tasks where id='${task}'`,
    ),
    'PARTIAL_OVERLAP:95:99',
  );
  console.log(
    'PASS independent sessions: late confirmation holds child lock; stale resolve waits and rejects without overwriting range',
  );
  proposal = await preview();
  const startRace = await Promise.allSettled([
    resolve(proposal.context_token),
    sql(asUser(`select public.start_daily_task('${task}');`)),
  ]);
  assert.equal(startRace[0].status, 'fulfilled');
  if (startRace[1].status === 'rejected')
    assert.match(startRace[1].reason.message, /progress review/);
  assert.equal(
    await sql(
      `select quantity_conflict is null and planned_start_page=97 and planned_end_page=99 from public.daily_tasks where id='${task}'`,
    ),
    't',
  );
  await sql(asUser(`select public.start_daily_task('${task}');`));
  await assert.rejects(resolve(proposal.context_token), /Task changed/);
  console.log(
    'PASS independent sessions: start cannot precede conflict clearance; started snapshot cannot be resolved again',
  );
} finally {
  await sql(`delete from auth.users where id='${user}';`);
}
