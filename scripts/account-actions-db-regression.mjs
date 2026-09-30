// Creates its own Docker network, PostgreSQL and Auth. Never reads .env or an existing DB.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { request } from 'node:http';

const suffix = randomUUID().slice(0, 8);
const network = `ssaida-account-test-${suffix}`;
const db = `${network}-db`;
const auth = `${network}-auth`;
const docker = process.env.DOCKER_PATH ?? 'docker';
const password = randomBytes(24).toString('hex');
const secret = randomBytes(32).toString('hex');
let stage = 'database startup';
const run = (args, input) =>
  execFileSync(docker, args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 4 * 1024 * 1024,
  });
const sql = (input) =>
  run(
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${password}`,
      db,
      'psql',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    input,
  ).trim();
const concurrentSql = (input) =>
  new Promise((resolve, reject) => {
    const process = execFile(
      docker,
      [
        'exec',
        '-i',
        db,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      (error, out) => (error ? reject(new Error('Isolated SQL failed')) : resolve(out.trim())),
    );
    process.stdin.end(input);
  });
const delay = () => new Promise((resolve) => setTimeout(resolve, 500));
const holdTransaction = async (statement, inspect, commit = false) => {
  const process = spawn(docker, [
    'exec',
    '-i',
    db,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
  ]);
  const closed = new Promise((resolve) => process.on('close', resolve));
  try {
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Transaction setup timeout')), 10000);
      let out = '';
      process.stdout.on('data', (data) => {
        out += data;
        if (out.includes('TX_READY')) {
          clearTimeout(timer);
          resolve();
        }
      });
      process.on('error', () => {
        clearTimeout(timer);
        reject(new Error('Transaction process failed'));
      });
    });
    process.stdin.write(`begin; ${statement}; select 'TX_READY';\n`);
    await ready;
    await inspect();
  } finally {
    process.stdin.end(commit ? 'commit;\n' : 'rollback;\n');
    assert.equal(await closed, 0, 'transaction closed');
  }
};
const localFetch = (url, options = {}) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    assert.equal(target.hostname, '127.0.0.1');
    const req = request(
      target,
      { method: options.method ?? 'GET', headers: options.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: async () => JSON.parse(body),
          }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(3000, () => req.destroy(new Error('Local Auth timeout')));
    req.on('error', reject);
    req.end(options.body);
  });
const token = (payload) => {
  const encoded = [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
};
try {
  run(['network', 'create', network]);
  run([
    'run',
    '-d',
    '--name',
    db,
    '--network',
    network,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    'public.ecr.aws/supabase/postgres:17.6.1.167',
  ]);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      sql('select 1');
      ready = true;
      break;
    } catch {
      await delay();
    }
  }
  assert.ok(ready, 'isolated DB ready');
  for (const file of readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    stage = file;
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  stage = 'SQL regression';
  sql(readFileSync('supabase/tests/sensitive_account_actions.sql', 'utf8'));
  sql(readFileSync('supabase/tests/sensitive_action_cleanup.sql', 'utf8'));
  sql(readFileSync('supabase/tests/account_deletion_receipts.sql', 'utf8'));
  console.log(
    'PASS isolated DB: full migration replay; server-only privileges, PIN bcrypt/lock reset, ownership, expiry, cancel, purpose, replay and FK cascade',
  );

  stage = 'concurrent consumption';
  const user = randomUUID();
  sql(`insert into auth.users(id) values('${user}');`);
  const id = sql(
    `select (public.begin_sensitive_action('${user}','delete_account','isolated','${randomUUID()}')).id;`,
  );
  sql(`select public.verify_sensitive_action('${user}','${id}',clock_timestamp());`);
  const race = await Promise.all(
    [1, 2].map(() =>
      concurrentSql(`select public.consume_sensitive_action('${user}','${id}','delete_account');`),
    ),
  );
  assert.deepEqual(race.sort(), ['f', 't']);
  stage = 'cleanup skips locked proof';
  sql(
    `update public.sensitive_action_challenges set expires_at=clock_timestamp()-interval '25 hours' where id='${id}';`,
  );
  const locker = spawn(docker, [
    'exec',
    '-i',
    db,
    'psql',
    '-U',
    'postgres',
    '-d',
    'postgres',
    '-At',
    '-v',
    'ON_ERROR_STOP=1',
  ]);
  const closed = new Promise((resolve) => locker.on('close', resolve));
  try {
    const locked = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Lock setup timeout')), 10000);
      let output = '';
      locker.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('ROW_LOCKED')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      locker.on('error', () => {
        clearTimeout(timeout);
        reject(new Error('Lock process failed'));
      });
    });
    locker.stdin.write(
      `begin; select id from public.sensitive_action_challenges where id='${id}' for update; select 'ROW_LOCKED';\n`,
    );
    await locked;
    assert.equal(sql('select public.cleanup_sensitive_action_challenges();'), '0');
    assert.equal(
      sql(`select count(*) from public.sensitive_action_challenges where id='${id}';`),
      '1',
    );
  } finally {
    locker.stdin.end('rollback;\n');
    await closed;
  }
  assert.equal(sql('select public.cleanup_sensitive_action_challenges();'), '1');
  console.log(
    'PASS proof TTL: expired statuses removed, recent proofs retained and locked rows skipped',
  );
  sql(`delete from auth.users where id='${user}';`);
  console.log('PASS concurrent proof consumption: exactly one transaction wins');

  stage = 'receipt transactions and races';
  const receiptUser = randomUUID();
  const receiptHash = createHash('sha256').update(randomBytes(32)).digest('hex');
  sql(`insert into auth.users(id) values('${receiptUser}');`);
  const receiptProof = sql(
    `select (public.begin_sensitive_action('${receiptUser}','delete_account','isolated','${randomUUID()}')).id;`,
  );
  sql(
    `select public.verify_sensitive_action('${receiptUser}','${receiptProof}',clock_timestamp());`,
  );
  const preparedOperation = JSON.parse(
    sql(
      `select public.prepare_account_deletion('${receiptUser}','${receiptProof}','${receiptHash}');`,
    ),
  );
  const operationId = preparedOperation.operationId;
  const statusQuery = `select public.get_account_deletion_status('${operationId}','${receiptHash}');`;
  const claimRace = await Promise.all(
    [1, 2].map(() =>
      concurrentSql(
        `select public.start_account_deletion('${receiptUser}','${receiptProof}','${operationId}');`,
      ),
    ),
  );
  assert.deepEqual(claimRace.sort(), ['f', 't']);
  await holdTransaction(`delete from auth.users where id='${receiptUser}'`, async () => {
    assert.equal(sql(statusQuery), 'pending', 'uncommitted deletion is never reported as deleted');
  });
  assert.equal(sql(statusQuery), 'pending', 'rollback leaves operation pending');
  await holdTransaction(
    `delete from auth.users where id='${receiptUser}'`,
    async () => {
      assert.equal(sql(statusQuery), 'pending');
    },
    true,
  );
  assert.equal(sql(statusQuery), 'deleted');
  assert.equal(sql(statusQuery), 'deleted');
  assert.equal(
    sql(
      `select count(*) from public.account_deletion_operations where id='${operationId}' and user_id is null and challenge_id is null;`,
    ),
    '1',
  );
  sql(
    `update public.account_deletion_operations set expires_at=clock_timestamp()-interval '25 hours' where id='${operationId}';`,
  );
  await holdTransaction(
    `select id from public.account_deletion_operations where id='${operationId}' for update`,
    async () => {
      assert.equal(sql('select public.cleanup_account_deletion_operations();'), '0');
    },
  );
  assert.equal(sql('select public.cleanup_account_deletion_operations();'), '1');
  console.log(
    'PASS receipts: hash/ownership/expiry/permissions, duplicate claim race, status during delete commit/rollback, cascade survival/PII removal, repeated status and locked TTL cleanup',
  );

  stage = 'Auth startup';
  run(
    ['exec', '-i', db, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    `alter role supabase_auth_admin password '${password}';`,
  );
  run([
    'run',
    '-d',
    '--name',
    auth,
    '--network',
    network,
    '-p',
    '127.0.0.1::9999',
    '-e',
    'GOTRUE_API_HOST=0.0.0.0',
    '-e',
    'GOTRUE_API_PORT=9999',
    '-e',
    'API_EXTERNAL_URL=http://localhost:9999',
    '-e',
    'GOTRUE_SITE_URL=http://localhost',
    '-e',
    'GOTRUE_DB_DRIVER=postgres',
    '-e',
    `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${db}:5432/postgres`,
    '-e',
    `GOTRUE_JWT_SECRET=${secret}`,
    '-e',
    'GOTRUE_JWT_EXP=3600',
    '-e',
    'GOTRUE_JWT_AUD=authenticated',
    '-e',
    'GOTRUE_JWT_ADMIN_ROLES=service_role',
    '-e',
    'GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
    '-e',
    'GOTRUE_MAILER_AUTOCONFIRM=true',
    'public.ecr.aws/supabase/gotrue:v2.196.0',
  ]);
  const port = run(['port', auth, '9999/tcp']).trim();
  assert.match(port, /^127\.0\.0\.1:\d+$/);
  const base = `http://${port}`;
  ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await localFetch(`${base}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* not ready */
    }
    await delay();
  }
  assert.ok(ready, 'isolated Auth ready');
  const adminToken = token({
    role: 'service_role',
    aud: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };
  const email = `isolated-${suffix}@example.test`;
  stage = 'Auth create/login/delete';
  const created = await localFetch(`${base}/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(created.status, 200, 'local admin create');
  const account = await created.json();
  const login = await localFetch(`${base}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  const userHeaders = { Authorization: `Bearer ${session.access_token}` };
  assert.equal((await localFetch(`${base}/user`, { headers: userHeaders })).status, 200);
  sql(
    `begin; set local "request.jwt.claim.sub"='${account.id}'; select public.complete_parent_onboarding('Isolated Auth',60,'1234'); commit;`,
  );
  const authProof = sql(
    `select (public.begin_sensitive_action('${account.id}','delete_account','isolated','${randomUUID()}')).id;`,
  );
  sql(`select public.verify_sensitive_action('${account.id}','${authProof}',clock_timestamp());`);
  const authOperation = JSON.parse(
    sql(`select public.prepare_account_deletion('${account.id}','${authProof}','${receiptHash}');`),
  );
  assert.equal(
    sql(
      `select public.start_account_deletion('${account.id}','${authProof}','${authOperation.operationId}');`,
    ),
    't',
  );
  const removal = await localFetch(`${base}/admin/users/${account.id}`, {
    method: 'DELETE',
    headers: adminHeaders,
    body: JSON.stringify({ should_soft_delete: false }),
  });
  assert.equal(removal.status, 200);
  assert.equal(
    sql(
      `select public.get_account_deletion_status('${authOperation.operationId}','${receiptHash}');`,
    ),
    'deleted',
  );
  assert.equal(
    sql(
      `select count(*) from public.account_deletion_operations where id='${authOperation.operationId}' and user_id is null and challenge_id is null;`,
    ),
    '1',
  );
  assert.notEqual((await localFetch(`${base}/user`, { headers: userHeaders })).status, 200);
  const refresh = await localFetch(`${base}/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  assert.notEqual(refresh.status, 200);
  assert.equal(
    sql(`select count(*) from public.profiles where auth_user_id='${account.id}';`),
    '0',
  );
  console.log(
    'PASS real isolated Auth Admin deletion: profile cascade, deleted user lookup and refresh rejected',
  );
} catch (error) {
  // Do not dump execFile errors: Docker arguments contain throwaway credentials.
  process.exitCode = 1;
  console.error(`FAIL isolated account DB/Auth regression at ${stage} (no credentials logged)`);
  if (stage === 'Auth startup') {
    try {
      const logResult = spawnSync(docker, ['logs', '--tail', '5', auth], { encoding: 'utf8' });
      const logs =
        `${error instanceof assert.AssertionError ? error.message : 'Container startup failed'}\n${logResult.stdout}\n${logResult.stderr}`
          .replaceAll(password, '[redacted]')
          .replaceAll(secret, '[redacted]')
          .replace(/postgres:\/\/[^\s"]+/g, '[database URL]');
      console.error(logs.slice(-350));
    } catch {
      /* container may not have started */
    }
  }
} finally {
  for (const container of [auth, db]) {
    try {
      run(['rm', '-f', '-v', container]);
    } catch {
      /* absent */
    }
  }
  try {
    run(['network', 'rm', network]);
  } catch {
    /* absent */
  }
}
