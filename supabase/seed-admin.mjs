// Seed an admin auth user (admin@hir.local / RSHIRdev2026) and grant OWNER membership
// in tenant_members for both demo tenants. Idempotent.
import { readFileSync } from 'node:fs';

const PROJECT_URL = process.env.SUPABASE_URL ?? 'https://qfmeojeipncuxeltnvab.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'qfmeojeipncuxeltnvab';
if (!SERVICE_ROLE_KEY || !MGMT_TOKEN) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ACCESS_TOKEN must be set in the environment.',
  );
  process.exit(2);
}

const EMAIL = 'admin@hir.local';
const PASSWORD = 'RSHIRdev2026';

async function findOrCreateUser() {
  // Try to find existing user
  const list = await fetch(
    `${PROJECT_URL}/auth/v1/admin/users?per_page=200`,
    {
      headers: {
        apiKey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!list.ok) {
    console.error('list users failed', list.status, await list.text());
    process.exit(1);
  }
  const listBody = await list.json();
  const existing = (listBody.users ?? []).find((u) => u.email === EMAIL);
  if (existing) {
    console.log(`[seed-admin] user already exists: ${existing.id}`);
    return existing.id;
  }

  const create = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apiKey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  });
  if (!create.ok) {
    console.error('create user failed', create.status, await create.text());
    process.exit(1);
  }
  const body = await create.json();
  console.log(`[seed-admin] created user: ${body.id}`);
  return body.id;
}

async function runSql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error('SQL failed', res.status, text);
    process.exit(1);
  }
  return JSON.parse(text);
}

const userId = await findOrCreateUser();

// Insert OWNER memberships for both tenants (idempotent via ON CONFLICT)
const result = await runSql(`
  insert into public.tenant_members (tenant_id, user_id, role)
  select t.id, '${userId}'::uuid, 'OWNER'
  from public.tenants t
  where t.slug in ('tenant1', 'tenant2')
  on conflict (tenant_id, user_id) do update set role = excluded.role
  returning tenant_id, user_id, role;
`);
console.log('[seed-admin] memberships:', result);
console.log('[seed-admin] login: admin@hir.local / RSHIRdev2026');
