// Local-only SQL regression + independent-session lock checks. Never reads .env.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const container = 'supabase_db_ssaida-app';
function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      [
        'exec',
        '-i',
        container,
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
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout.trim());
      },
    );
    child.stdin.end(statement);
  });
}
await sql(
  readFileSync(
    new URL('../supabase/tests/sprint_1_planning_override.sql', import.meta.url),
    'utf8',
  ),
);
console.log('Sprint 1 SQL regression: PASS');

const user = randomUUID();
let childId;
let item;
const asUser = (body) =>
  `begin; set local role authenticated; set local "request.jwt.claim.sub" = '${user}'; ${body} commit;`;
try {
  await sql(`insert into auth.users(id) values('${user}');`);
  await sql(asUser("select public.complete_parent_onboarding('Concurrent Sprint1',60,'1234');"));
  childId = await sql(
    `select c.id from public.children c join public.profiles p on p.id=c.parent_id where p.auth_user_id='${user}';`,
  );
  const inserted = await sql(
    asUser(
      `insert into public.study_items(child_id,item_type,name,estimated_minutes,study_weekdays,workbook_pages_per_session,workbook_last_page,workbook_last_completed_page) values('${childId}','WORKBOOK','Concurrent',20,array[1,2,3,4,5,6,7]::smallint[],5,100,0) returning id;`,
    ),
  );
  item = inserted.match(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/)[0];
  await Promise.all(
    [1, 2].map(() => sql(asUser(`select public.ensure_daily_plan('${childId}','2031-01-01');`))),
  );
  assert.equal(
    await sql(
      `select count(*) from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where p.child_id='${childId}' and p.plan_date='2031-01-01';`,
    ),
    '1',
  );

  // Either ordering is legal: a plan created first retains 1; an edit committed
  // first creates 40. Both must retain the override and preserve confirmed progress.
  await Promise.all([
    sql(
      asUser(
        `select public.update_study_item('${item}',(select updated_at from public.study_items where id='${item}'),'{"next_start_page":40}');`,
      ),
    ),
    sql(asUser(`select public.ensure_daily_plan('${childId}','2031-01-02');`)),
  ]);
  assert.equal(
    await sql(
      `select workbook_last_completed_page || ':' || workbook_next_start_page_override from public.study_items where id='${item}';`,
    ),
    '0:40',
  );
  const snapshot = await sql(
    `select t.planned_start_page from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where t.study_item_id='${item}' and p.plan_date='2031-01-02';`,
  );
  assert.ok(['1', '40'].includes(snapshot));
  await sql(asUser(`select public.ensure_daily_plan('${childId}','2031-01-02');`));
  assert.equal(
    await sql(
      `select t.planned_start_page from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where t.study_item_id='${item}' and p.plan_date='2031-01-02';`,
    ),
    snapshot,
  );

  // Ensure and confirmation contend for the same child lock in separate sessions.
  await sql(
    asUser(
      `select public.ensure_daily_plan('${childId}','2031-01-03'); select public.start_daily_task((select t.id from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where t.study_item_id='${item}' and p.plan_date='2031-01-03')); select public.complete_daily_task((select t.id from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where t.study_item_id='${item}' and p.plan_date='2031-01-03'));`,
    ),
  );
  await Promise.all([
    sql(
      asUser(
        `select public.confirm_daily_tasks(jsonb_build_array(jsonb_build_object('daily_task_id',(select t.id from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where t.study_item_id='${item}' and p.plan_date='2031-01-03'),'status','PARTIAL','actual_end_page',42)));`,
      ),
    ),
    sql(asUser(`select public.ensure_daily_plan('${childId}','2031-01-04');`)),
  ]);
  assert.equal(
    await sql(
      `select t.planned_start_page || ':' || t.planned_end_page from public.daily_tasks t join public.daily_plans p on p.id=t.daily_plan_id where t.study_item_id='${item}' and p.plan_date='2031-01-04';`,
    ),
    '43:47',
  );
  console.log(
    'Sprint 1 independent-session regression: PASS (ensure/ensure, edit/ensure, confirm/ensure)',
  );
} finally {
  // Only the unique test user created by this run; ownership FKs cascade its fixtures.
  await sql(`delete from auth.users where id='${user}';`);
}
