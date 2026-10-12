import { createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const DAY = 86400000,
  KST = 9 * 3600000;
const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function summarizePilot({ families, cycles }, asOf) {
  if (!validDate(asOf)) throw new Error('Use an explicit ISO as-of timestamp.');
  const end = Date.parse(asOf),
    seen = new Set();
  const clean = cycles
    .filter((c) => {
      if (
        !validDate(c.parent_verified_at) ||
        !validDate(c.child_completed_at) ||
        !['PARENT_CONFIRMED', 'PARTIAL', 'RETRY'].includes(c.verification_status)
      )
        return false;
      const t = Date.parse(c.parent_verified_at);
      if (t > end || t < Date.parse(c.child_completed_at) || seen.has(c.daily_task_id))
        return false;
      seen.add(c.daily_task_id);
      return true;
    })
    .sort((a, b) => Date.parse(a.parent_verified_at) - Date.parse(b.parent_verified_at));
  if (new Set(families.map((f) => f.family_id)).size !== families.length)
    throw new Error('Duplicate family IDs.');
  return families.map((f) => {
    if (!validDate(f.signed_up_at)) throw new Error('Missing signup time.');
    const signup = Date.parse(f.signed_up_at);
    const own = clean.filter(
      (c) => c.family_id === f.family_id && Date.parse(c.parent_verified_at) >= signup,
    );
    const first = own[0]?.parent_verified_at ?? null;
    const activated = Boolean(first && Date.parse(first) < signup + 7 * DAY);
    let nextStart = null,
      nextEnd = null,
      days = null;
    if (activated) {
      const local = new Date(Date.parse(first) + KST),
        weekday = (local.getUTCDay() + 6) % 7;
      const midnight =
        Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - KST;
      nextStart = midnight + (7 - weekday) * DAY;
      nextEnd = nextStart + 7 * DAY;
      if (end >= nextEnd)
        days = new Set(
          own
            .filter(
              (c) =>
                Date.parse(c.parent_verified_at) >= nextStart &&
                Date.parse(c.parent_verified_at) < nextEnd,
            )
            .map((c) =>
              new Date(Date.parse(c.parent_verified_at) + KST).toISOString().slice(0, 10),
            ),
        ).size;
    }
    return {
      family_id: f.family_id,
      signed_up_at: f.signed_up_at,
      first_cycle_at: first,
      cycle_count: own.length,
      activated,
      retention_observed: days !== null,
      retention_window_end: nextEnd ? new Date(nextEnd).toISOString() : null,
      retention_days: days,
      retained: days === null ? null : days >= 2,
    };
  });
}
async function exportFromServer(asOf) {
  const url = process.env.PILOT_SUPABASE_URL;
  const key = process.env.PILOT_SERVICE_ROLE_KEY;
  const salt = process.env.PILOT_EXPORT_SALT;
  if (!url || !key || !salt || salt.length < 32)
    throw new Error(
      'Set PILOT_SUPABASE_URL, PILOT_SERVICE_ROLE_KEY and a stable private PILOT_EXPORT_SALT (32+ characters).',
    );
  // The operator must explicitly choose the pilot cohort; never export all registered families by default.
  const cohortPath = process.env.PILOT_COHORT_FILE;
  if (!cohortPath)
    throw new Error('Set PILOT_COHORT_FILE to a private JSON array of enrolled profile UUIDs.');
  const ids = JSON.parse(await readFile(cohortPath, 'utf8'));
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 500 ||
    ids.some((v) => !/^[-0-9a-f]{36}$/i.test(v))
  )
    throw new Error('Invalid cohort IDs.');
  const idList = [...new Set(ids)].join(',');
  async function read(table, query) {
    let rows = [];
    for (let offset = 0; ; offset += 500) {
      const response = await fetch(
        `${url.replace(/\/$/, '')}/rest/v1/${table}?${query}&limit=500&offset=${offset}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (!response.ok)
        throw new Error(`Read ${table} failed (${response.status}); no credentials logged.`);
      const page = await response.json();
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  const [profiles, events] = await Promise.all([
    read('profiles', `select=id,created_at&id=in.(${idList})&order=id.asc`),
    read(
      'pilot_core_cycles',
      `select=daily_task_id,parent_id,child_completed_at,parent_verified_at,verification_status&parent_id=in.(${idList})&parent_verified_at=lte.${encodeURIComponent(asOf)}&order=parent_verified_at.asc,daily_task_id.asc`,
    ),
  ]);
  const hash = (id) => createHmac('sha256', salt).update(id).digest('hex').slice(0, 20);
  return {
    families: profiles.map((p) => ({ family_id: hash(p.id), signed_up_at: p.created_at })),
    cycles: events.map((e) => ({ ...e, family_id: hash(e.parent_id), parent_id: undefined })),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, source, output, asOf] = process.argv.slice(2);
  if (!['--file', '--server'].includes(mode) || !output || !validDate(asOf))
    throw new Error(
      'Usage: node scripts/pilot-metrics.mjs --file input.json output.json ISO_AS_OF | --server cohort output.json ISO_AS_OF',
    );
  if (mode === '--server') process.env.PILOT_COHORT_FILE = source;
  const data =
    mode === '--file' ? JSON.parse(await readFile(source, 'utf8')) : await exportFromServer(asOf);
  const result = summarizePilot(data, asOf);
  const metrics = {
    as_of: asOf,
    cohort: result.length,
    activated: result.filter((f) => f.activated).length,
    retention_denominator: result.filter((f) => f.retention_observed).length,
    retained: result.filter((f) => f.retained === true).length,
    families: result,
  };
  await writeFile(output, JSON.stringify(metrics, null, 2) + '\n', { flag: 'wx' });
  console.log('Pilot metrics written. No payment or purchase-intent inference.');
}
