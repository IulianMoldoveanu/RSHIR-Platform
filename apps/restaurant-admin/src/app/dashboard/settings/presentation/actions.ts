'use server';
// Lane PRESENTATION (2026-05-06) — server actions for the optional brand
// presentation page. All writes target `tenants.settings` JSONB under the
// `presentation_*` keys; no DDL migration is required.
//
// One save action per form submit (savePresentation) plus a separate
// gallery-image upload (uploadPresentationImage) so we don't push raw
// image bytes through every form submit.
//
// All actions verify OWNER role on the active tenant before writing.

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import type {
  PresentationActionResult,
  PresentationGalleryItem,
  PresentationSocials,
  PresentationState,
  PresentationTeamMember,
} from './types';

const BRANDING_BUCKET = 'tenant-branding';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 4 * 1024 * 1024;
const SAFE_URL_RE = /^https?:\/\/[^\s<>"']+$/i;
const MAX_GALLERY = 24;
const MAX_TEAM = 12;
const MAX_ABOUT_LONG = 8000;

function sanitizeStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function sanitizeUrl(v: unknown): string | null {
  const s = sanitizeStr(v, 2000);
  if (!s) return null;
  return SAFE_URL_RE.test(s) ? s : null;
}

function matchesDeclaredMime(mime: string, bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 12));
  if (head.length < 4) return false;
  if (mime === 'image/png') {
    return (
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
      head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
    );
  }
  if (mime === 'image/jpeg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return (
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
    );
  }
  return false;
}

function extFromMime(mime: string): string {
  const sub = mime.split('/')[1];
  return sub === 'jpeg' ? 'jpg' : sub;
}

function publicUrlFor(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/storage/v1/object/public/${BRANDING_BUCKET}/${path}?v=${Date.now()}`;
}

function readPresentation(rawSettings: Record<string, unknown>): PresentationState {
  const enabled = rawSettings.presentation_enabled === true;
  const aboutLong = sanitizeStr(rawSettings.presentation_about_long, MAX_ABOUT_LONG);
  const rawGallery = Array.isArray(rawSettings.presentation_gallery)
    ? (rawSettings.presentation_gallery as unknown[])
    : [];
  const gallery: PresentationGalleryItem[] = [];
  for (const r of rawGallery) {
    if (gallery.length >= MAX_GALLERY) break;
    if (!r || typeof r !== 'object') continue;
    const it = r as Record<string, unknown>;
    const url = sanitizeUrl(it.url);
    if (!url) continue;
    gallery.push({
      url,
      alt: sanitizeStr(it.alt, 200),
      caption: sanitizeStr(it.caption, 200),
    });
  }

  const rawTeam = Array.isArray(rawSettings.presentation_team)
    ? (rawSettings.presentation_team as unknown[])
    : [];
  const team: PresentationTeamMember[] = [];
  for (const r of rawTeam) {
    if (team.length >= MAX_TEAM) break;
    if (!r || typeof r !== 'object') continue;
    const it = r as Record<string, unknown>;
    const name = sanitizeStr(it.name, 120);
    if (!name) continue;
    team.push({
      name,
      role: sanitizeStr(it.role, 120),
      photo_url: sanitizeUrl(it.photo_url),
    });
  }

  const videoUrl = sanitizeUrl(rawSettings.presentation_video_url);

  const rawSocials = (rawSettings.presentation_socials ?? null) as PresentationSocials | null;
  const socials: PresentationSocials = {
    instagram: sanitizeUrl(rawSocials?.instagram),
    facebook: sanitizeUrl(rawSocials?.facebook),
    tiktok: sanitizeUrl(rawSocials?.tiktok),
    youtube: sanitizeUrl(rawSocials?.youtube),
  };

  return {
    enabled,
    about_long: aboutLong,
    gallery,
    team,
    video_url: videoUrl,
    socials,
  };
}

async function loadSettings(tenantId: string): Promise<{
  rawSettings: Record<string, unknown>;
  state: PresentationState;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .maybeSingle();
  const rawSettings = (data?.settings as Record<string, unknown> | null) ?? {};
  return { rawSettings, state: readPresentation(rawSettings) };
}

export async function getPresentationState(): Promise<PresentationState> {
  const { tenant } = await getActiveTenant();
  const { state } = await loadSettings(tenant.id);
  return state;
}

export async function savePresentation(
  input: PresentationState,
  expectedTenantId: string,
): Promise<PresentationActionResult> {
  if (!expectedTenantId || typeof expectedTenantId !== 'string') {
    return { ok: false, error: 'invalid_input' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  // Sanitize input through the same coercion pipeline as the read path so
  // a malicious / malformed client payload cannot poison the JSONB shape.
  const enabled = input.enabled === true;
  const aboutLong = sanitizeStr(input.about_long, MAX_ABOUT_LONG);
  const gallery: PresentationGalleryItem[] = (Array.isArray(input.gallery) ? input.gallery : [])
    .slice(0, MAX_GALLERY)
    .map((it) => ({
      url: sanitizeUrl(it.url) ?? '',
      alt: sanitizeStr(it.alt, 200),
      caption: sanitizeStr(it.caption, 200),
    }))
    .filter((it) => it.url.length > 0);
  const team: PresentationTeamMember[] = (Array.isArray(input.team) ? input.team : [])
    .slice(0, MAX_TEAM)
    .map((m) => ({
      name: sanitizeStr(m.name, 120) ?? '',
      role: sanitizeStr(m.role, 120),
      photo_url: sanitizeUrl(m.photo_url),
    }))
    .filter((m) => m.name.length > 0);
  const videoUrl = sanitizeUrl(input.video_url);
  const socials: PresentationSocials = {
    instagram: sanitizeUrl(input.socials?.instagram),
    facebook: sanitizeUrl(input.socials?.facebook),
    tiktok: sanitizeUrl(input.socials?.tiktok),
    youtube: sanitizeUrl(input.socials?.youtube),
  };

  const { rawSettings } = await loadSettings(expectedTenantId);
  // Strict allowlist write — explicit keys only, drop any stale presentation_*
  // junk that may have crept in from earlier shapes.
  const merged = {
    ...rawSettings,
    presentation_enabled: enabled,
    presentation_about_long: aboutLong,
    presentation_gallery: gallery,
    presentation_team: team,
    presentation_video_url: videoUrl,
    presentation_socials: socials,
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from('tenants')
    .update({ settings: merged as never })
    .eq('id', expectedTenantId);
  if (error) return { ok: false, error: 'db_error', detail: error.message };

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'tenant.presentation_updated',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: {
      enabled,
      gallery_count: gallery.length,
      team_count: team.length,
      has_video: !!videoUrl,
    },
  });

  revalidatePath('/dashboard/settings/presentation');
  return {
    ok: true,
    state: {
      enabled,
      about_long: aboutLong,
      gallery,
      team,
      video_url: videoUrl,
      socials,
    },
  };
}

export async function uploadPresentationImage(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string; detail?: string }> {
  const file = formData.get('file');
  const expectedTenantId = formData.get('tenantId');
  const kind = formData.get('kind'); // 'gallery' or 'team'
  if (
    !(file instanceof File) ||
    typeof expectedTenantId !== 'string' ||
    !expectedTenantId ||
    (kind !== 'gallery' && kind !== 'team')
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({ user: null, tenant: null }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };
  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  if (!ALLOWED_MIME.has(file.type)) {
    return { ok: false, error: 'invalid_input', detail: `mime_not_allowed:${file.type}` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'invalid_input', detail: 'file_over_4mb' };
  }
  const bytes = await file.arrayBuffer();
  if (!matchesDeclaredMime(file.type, bytes)) {
    return { ok: false, error: 'invalid_input', detail: 'mime_content_mismatch' };
  }

  const path = `${expectedTenantId}/presentation/${kind}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${extFromMime(file.type)}`;
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from(BRANDING_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: 'storage_error', detail: upErr.message };

  return { ok: true, url: publicUrlFor(path) };
}
