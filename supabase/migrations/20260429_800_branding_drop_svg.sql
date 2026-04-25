-- HIR Restaurant Suite - RSHIR-31 H-3: drop image/svg+xml from
-- tenant-branding bucket allowed_mime_types. SVG can carry <script> /
-- <foreignObject> payloads that execute when the storage URL is opened
-- directly. The branding action now rejects SVG client-side and enforces
-- a magic-byte check on raster uploads (PNG / JPEG / WEBP).
--
-- Pre-existing .svg objects (if any) cannot be deleted via SQL — Supabase
-- protects storage.objects from direct DELETE. Operator should run
-- `supabase storage rm tenant-branding -r --include="*.svg"` (or use the
-- dashboard) once after this migration if any SVGs were uploaded.
--
-- Idempotent: UPDATE only takes effect if the bucket row exists.

update storage.buckets
set allowed_mime_types = array['image/png','image/jpeg','image/webp']
where id = 'tenant-branding';
