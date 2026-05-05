#!/usr/bin/env node
// Lane X — inventory all materialized views + their refresh strategy
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const vault = JSON.parse(readFileSync(join(homedir(), '.hir', 'secrets.json'), 'utf8'));
const PROJECT_REF = vault.supabase.project_ref || vault.supabase.projectRef;
const PAT = vault.supabase.management_pat || vault.supabase.managementPat;

async function runSql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const mvs = await runSql(`
  select schemaname, matviewname,
         pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, matviewname)::regclass)) as size
  from pg_matviews
  where schemaname = 'public'
  order by matviewname;
`);
console.log('--- MATERIALIZED VIEWS ---');
console.table(mvs);

const cron = await runSql(`
  select jobid, jobname, schedule, command, active
  from cron.job
  order by jobid;
`).catch(e => ({ error: String(e) }));
console.log('--- CRON JOBS ---');
console.log(JSON.stringify(cron, null, 2));

const uniq = await runSql(`
  select c.relname as matview,
         i.relname as index_name,
         ix.indisunique as is_unique
  from pg_class c
  join pg_index ix on ix.indrelid = c.oid
  join pg_class i on i.oid = ix.indexrelid
  where c.relkind = 'm'
    and c.relnamespace = (select oid from pg_namespace where nspname='public')
  order by c.relname, i.relname;
`);
console.log('--- INDEXES ON MVS (need >=1 unique for CONCURRENTLY) ---');
console.table(uniq);
