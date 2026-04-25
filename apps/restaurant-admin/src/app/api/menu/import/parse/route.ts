import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseMenuImage } from '@/lib/anthropic';
import { checkLimit } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';

// RSHIR-20: per-tenant Claude budget. Soft cost ceiling is 10 parses/hour
// ≈ $0.30 worst case at Claude Sonnet 4.6 vision pricing (8 MB PDF input,
// modest output). This is operational accounting, not a hard guard against
// abuse — Vercel function timeout (60s) plus the Anthropic per-org rate
// already cap the absolute worst case, and the per-tenant key prevents one
// rogue tenant from starving others.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'menu-imports';
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
]);

export async function POST(req: NextRequest) {
  const origin = assertSameOrigin(req);
  if (!origin.ok) {
    return NextResponse.json({ error: 'forbidden_origin', reason: origin.reason }, { status: 403 });
  }

  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

  // 10 parses per tenant per hour: capacity 10, refill ~1/360s.
  const rl = checkLimit(`menu-parse:${auth.tenantId}`, { capacity: 10, refillPerSec: 1 / 360 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Lipseste fisierul.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Fisierul depaseste 8 MB.' }, { status: 400 });
  }
  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { error: `Tip neacceptat: ${file.type}. PDF, JPEG sau PNG.` },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();

  // RSHIR-16 H4: magic-byte sniff. The browser-supplied `file.type` is
  // attacker-controllable, and the Supabase storage `allowed_mime_types`
  // check inspects the same untrusted header. Validate the actual leading
  // bytes match the declared MIME before we upload or call Claude.
  if (!matchesDeclaredMime(file.type, bytes)) {
    return NextResponse.json(
      { error: 'Conținutul fișierului nu corespunde tipului declarat.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const uploadId = randomUUID();
  const path = `${auth.tenantId}/${uploadId}.${ext}`;

  // Audit copy in private storage. Parsing reads the bytes we already have
  // in memory, so the API call does not depend on storage being reachable.
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: `Upload esuat: ${upErr.message}` }, { status: 500 });
  }

  try {
    const parsed = await parseMenuImage(bytes, file.type);
    return NextResponse.json({
      uploadId,
      path,
      parsed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Parsare esuata';
    console.error('[menu-import/parse]', message.slice(0, 1000));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function matchesDeclaredMime(mime: string, bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 8));
  if (head.length < 4) return false;
  if (mime === 'application/pdf') {
    // %PDF-
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  }
  if (mime === 'image/jpeg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a
    );
  }
  return false;
}
