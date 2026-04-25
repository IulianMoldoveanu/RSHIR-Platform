import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireTenantAuth } from '@/lib/api-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseMenuImage } from '@/lib/anthropic';

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
  const auth = await requireTenantAuth();
  if (!auth.ok) return auth.response;

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
