import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseMenuImage, MenuParseError, type MenuParseFailureKind } from '@/lib/anthropic';
import { checkLimit } from '@/lib/rate-limit';
import { assertSameOrigin } from '@/lib/origin-check';
import { logAudit } from '@/lib/audit';

// RSHIR-20: per-tenant Claude budget. Soft cost ceiling is 10 parses/hour
// ≈ $0.30 worst case at Claude Sonnet 4.5 vision pricing (8 MB PDF input,
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
    const result = await parseMenuImage(bytes, file.type);

    // Cost observability — best-effort, never blocks the response.
    // Per-tenant token spend lets us see who is exercising the AI menu
    // import surface and refine the 10/h rate-limit if a tenant exceeds it.
    const categoryCount = result.parsed.categories.length;
    const itemCount = result.parsed.categories.reduce((n, c) => n + c.items.length, 0);
    void logAudit({
      tenantId: auth.tenantId,
      actorUserId: auth.userId,
      action: 'menu.ai_parsed',
      entityType: 'menu_import',
      entityId: uploadId,
      metadata: {
        model: result.model,
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
        category_count: categoryCount,
        item_count: itemCount,
        mime: file.type,
        bytes: file.size,
      },
    });
    console.info(
      '[menu-import/parse] ok',
      JSON.stringify({
        tenantId: auth.tenantId,
        uploadId,
        model: result.model,
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
        category_count: categoryCount,
        item_count: itemCount,
      }),
    );

    return NextResponse.json({
      uploadId,
      path,
      parsed: result.parsed,
    });
  } catch (e) {
    const kind: MenuParseFailureKind = e instanceof MenuParseError ? e.kind : 'unknown';
    const internal = e instanceof Error ? e.message : 'Parsare esuata';
    // Log the raw provider message internally; never surface it to the user.
    console.error('[menu-import/parse]', kind, internal.slice(0, 1000));

    const userMessage = userFacingMessage(kind);
    const status = httpStatusFor(kind);
    return NextResponse.json(
      { error: userMessage, kind },
      { status, headers: kind === 'rate_limited' ? { 'Retry-After': '120' } : undefined },
    );
  }
}

// Romanian formal copy mapped from classified failure modes. Keep in sync
// with `MenuParseFailureKind` in src/lib/anthropic.ts.
function userFacingMessage(kind: MenuParseFailureKind): string {
  switch (kind) {
    case 'auth_or_billing':
      return 'AI temporar indisponibil — verificați tokenul Anthropic în panoul administrativ. Codul este pregătit și va funcționa imediat ce tokenul este reactivat.';
    case 'rate_limited':
      return 'Prea multe solicitări AI într-un timp scurt. Vă rugăm să reveniți în câteva minute.';
    case 'model_not_found':
      return 'Configurația AI nu este corectă. Contactați suportul HIR.';
    case 'invalid_input':
      return 'Fișierul nu a putut fi procesat. Verificați că este un meniu lizibil în format PDF, JPEG sau PNG.';
    case 'unknown':
    default:
      return 'Ne pare rău, importul AI a întâmpinat o problemă tehnică. Reîncercați sau contactați suportul.';
  }
}

function httpStatusFor(kind: MenuParseFailureKind): number {
  switch (kind) {
    case 'auth_or_billing':
      return 503;
    case 'rate_limited':
      return 429;
    case 'model_not_found':
      return 503;
    case 'invalid_input':
      return 400;
    case 'unknown':
    default:
      return 502;
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
