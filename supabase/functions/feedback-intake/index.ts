// HIR Restaurant Suite — Feedback Intake (Phase 1)
//
// POST /feedback-intake
//   Content-Type: multipart/form-data
//   Authorization: Bearer <user JWT>            (verify_jwt = true)
//   Form fields:
//     metadata (string, JSON):
//       {
//         tenant_id: uuid,
//         category: 'BUG' | 'UX_FRICTION' | 'FEATURE_REQUEST' | 'QUESTION',
//         description: string,
//         url: string,
//         user_agent: string,
//         console_log_excerpt: string
//       }
//     screenshot (File, optional, image/*, ≤2MB)
//
// Behaviour:
//   1. Verify the JWT-bearing user is a member of `tenant_id`.
//   2. Sanitize console_log_excerpt (strip emails, phone numbers, JWTs,
//      Supabase keys). description is user-provided free text and NOT
//      sanitized — Telegram preview truncates to 200 chars.
//   3. Insert feedback_reports row.
//   4. If screenshot present: upload to bucket
//      tenant-feedback-screenshots/<tenant_id>/<feedback_id>.<ext>
//      then UPDATE the row's screenshot_path.
//   5. Return { id }.
//
// The pg_trigger on insert fires `feedback-notify-on-insert` (separate
// function) which dispatches to Telegram.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Category = 'BUG' | 'UX_FRICTION' | 'FEATURE_REQUEST' | 'QUESTION';
const VALID_CATEGORIES: Category[] = ['BUG', 'UX_FRICTION', 'FEATURE_REQUEST', 'QUESTION'];
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
const MAX_DESCRIPTION_CHARS = 4000;
const MAX_CONSOLE_CHARS = 16000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function sanitize(input: string): string {
  if (!input) return '';
  let out = input.slice(0, MAX_CONSOLE_CHARS);
  // Emails
  out = out.replace(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g, '[email]');
  // Phone numbers (international or 10+ consecutive digits with optional +)
  out = out.replace(/\+?\d[\d\s\-().]{9,}\d/g, '[phone]');
  // JWT-ish tokens (eyJ... base64-ish, ≥30 chars)
  out = out.replace(/ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[jwt]');
  // Supabase keys / service-role hints
  out = out.replace(/sbp_[A-Za-z0-9_-]+/g, '[sbp_key]');
  out = out.replace(/service_role/gi, '[service_role]');
  return out;
}

function extFromMime(mime: string | null): string {
  switch ((mime ?? '').toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'POST, OPTIONS',
      },
    });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json(500, { error: 'supabase_env_missing' });
  }

  // Verify JWT — pull user from the Authorization header.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return json(401, { error: 'missing_bearer' });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userRes?.user) return json(401, { error: 'invalid_token' });
  const user = userRes.user;

  // Parse multipart form.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: 'invalid_multipart' });
  }
  const metaRaw = form.get('metadata');
  if (typeof metaRaw !== 'string') return json(400, { error: 'metadata_required' });
  let meta: {
    tenant_id?: unknown;
    category?: unknown;
    description?: unknown;
    url?: unknown;
    user_agent?: unknown;
    console_log_excerpt?: unknown;
  };
  try {
    meta = JSON.parse(metaRaw);
  } catch {
    return json(400, { error: 'metadata_invalid_json' });
  }

  if (!isUuid(meta.tenant_id)) return json(400, { error: 'tenant_id_invalid' });
  if (typeof meta.category !== 'string' || !VALID_CATEGORIES.includes(meta.category as Category)) {
    return json(400, { error: 'category_invalid' });
  }
  if (typeof meta.description !== 'string') return json(400, { error: 'description_required' });
  const description = meta.description.slice(0, MAX_DESCRIPTION_CHARS).trim();
  if (description.length === 0) return json(400, { error: 'description_empty' });

  const tenantId = meta.tenant_id as string;
  const category = meta.category as Category;
  const url = typeof meta.url === 'string' ? meta.url.slice(0, 1000) : null;
  const userAgent = typeof meta.user_agent === 'string' ? meta.user_agent.slice(0, 500) : null;
  const consoleExcerpt =
    typeof meta.console_log_excerpt === 'string'
      ? sanitize(meta.console_log_excerpt)
      : null;

  // Service-role client for membership check + insert (bypasses RLS so we
  // explicitly verify membership ourselves — same pattern as lib/tenant.ts).
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: member, error: memberErr } = await admin
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (memberErr) {
    console.error('[feedback-intake] membership lookup failed:', memberErr.message);
    return json(500, { error: 'membership_check_failed' });
  }
  if (!member) return json(403, { error: 'not_a_member' });

  // Insert feedback row — screenshot_path filled in step 4 if present.
  const { data: inserted, error: insErr } = await admin
    .from('feedback_reports')
    .insert({
      tenant_id: tenantId,
      reporter_user_id: user.id,
      category,
      description,
      url,
      user_agent: userAgent,
      console_log_excerpt: consoleExcerpt,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    console.error('[feedback-intake] insert failed:', insErr?.message);
    return json(500, { error: 'insert_failed' });
  }
  const feedbackId = inserted.id as string;

  // Optional screenshot upload.
  const screenshot = form.get('screenshot');
  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES) {
      return json(413, { error: 'screenshot_too_large', id: feedbackId });
    }
    if (!/^image\//i.test(screenshot.type)) {
      return json(415, { error: 'screenshot_not_image', id: feedbackId });
    }
    const ext = extFromMime(screenshot.type);
    const path = `${tenantId}/${feedbackId}.${ext}`;
    const buf = new Uint8Array(await screenshot.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('tenant-feedback-screenshots')
      .upload(path, buf, {
        contentType: screenshot.type,
        upsert: true,
      });
    if (upErr) {
      console.error('[feedback-intake] storage upload failed:', upErr.message);
      // Row is already inserted; return success but note the upload failure.
      return json(207, { id: feedbackId, screenshot_failed: upErr.message });
    }
    const { error: updErr } = await admin
      .from('feedback_reports')
      .update({ screenshot_path: path })
      .eq('id', feedbackId);
    if (updErr) {
      console.error('[feedback-intake] screenshot_path update failed:', updErr.message);
    }
  }

  return json(200, { id: feedbackId });
});
