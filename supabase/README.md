# Supabase ops notes

Helpers in this directory:

- `apply-sql.mjs <file.sql>` — POSTs SQL to the Management API.
- `deploy-function.mjs <name>` — uploads `functions/<name>/index.ts`.
- `gen-types.mjs` — regenerates `packages/db-types/index.ts`.
- `seed-admin.mjs` — seeds the bootstrap super-admin user.

Both helpers require `SUPABASE_ACCESS_TOKEN` (Personal Access Token);
`SUPABASE_PROJECT_REF` defaults to the prod project.

## RSHIR-22: notify-new-order shared secret

The order-paid email trigger authenticates to the Edge Function via a
function-scoped shared secret (NOT the public anon JWT).

Seed the secret once per project:

```sh
# 1. Generate (any 64-char hex value):
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# 2. Store in Postgres vault — used by the trigger:
node supabase/apply-sql.mjs <(cat <<SQL
select vault.create_secret(
  '$SECRET',
  'notify_new_order_secret',
  'shared secret used by pg_net to authenticate to notify-new-order');
SQL
)

# 3. Set on the Edge Function — used to gate the request:
supabase secrets set HIR_NOTIFY_SECRET=$SECRET \
  --project-ref qfmeojeipncuxeltnvab
```

Rotate by updating both the vault row (`select vault.update_secret(...)`)
and the function secret. The legacy `notify_new_order_auth` vault entry
(public anon JWT) is unused after migration `20260428_600_*` and can be
deleted.
