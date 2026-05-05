# Courier — Production Runbook (next-sprint roadmap)

> Distillation of "what's left for 100% production-ready" after today's
> audit + polish PRs. Concrete steps, time-boxed, in dependency order.
> Each item ends with a clear DEFINITION OF DONE so progress is verifiable.

## §A — Bucket flip (audit §3.1, last P0)

**Status**: code-side done. Migration sits in PR #247 awaiting manual apply.

**Steps** (5 min, do them in this order):

1. Apply the bucket flip via Storage Admin REST. From a shell with the
   service-role key in vault:
   ```bash
   cd "C:/Users/Office HIR CEO/.hir/foisorul-a/scripts"
   node --input-type=module -e "
     import { readFileSync } from 'node:fs';
     const v = JSON.parse(readFileSync('C:/Users/Office HIR CEO/.hir/secrets.json','utf8'));
     const r = await fetch('https://' + v.supabase.project_ref + '.supabase.co/storage/v1/bucket/courier-proofs', {
       method: 'PUT',
       headers: {
         apikey: v.supabase.service_role_key,
         Authorization: 'Bearer ' + v.supabase.service_role_key,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ public: false }),
     });
     console.log(r.status, await r.text());
   "
   ```
2. In Supabase Dashboard → SQL Editor (runs as `supabase_admin` which
   owns `storage.objects` — the Mgmt API can't touch this table):
   ```sql
   drop policy if exists "courier_proofs_public_read" on storage.objects;
   drop policy if exists "courier_proofs_assignee_read" on storage.objects;
   create policy "courier_proofs_assignee_read"
     on storage.objects
     for select
     to authenticated
     using (
       bucket_id = 'courier-proofs'
       and exists (
         select 1
         from public.courier_orders co
         where co.id::text = (storage.foldername(name))[1]
           and co.assigned_courier_user_id = auth.uid()
       )
     );
   ```
3. Smoke: open `/fleet/orders/<id>` for an order with a delivered proof
   — the photo still displays (signed URL minted at render). Then try to
   GET the legacy public URL directly — should return 401.

**Definition of done**: direct GET to a `courier-proofs` bucket URL
returns 401 + fleet manager view still renders the proof image.

## §B — Capacitor native build

**Status**: scaffold ready (`capacitor.config.ts` + `NATIVE_SHELL.md`).
Iulian-side work; needs Apple Developer + Google Play Console accounts.

### B.1 — Install Capacitor (~30 min, one-time)
```bash
cd apps/restaurant-courier
pnpm add -D @capacitor/cli @capacitor/core @capacitor/ios @capacitor/android \
  @capacitor/geolocation @capacitor/push-notifications \
  @capacitor/splash-screen @capacitor/status-bar
pnpm exec cap init
# When asked, accept the appId 'ro.hir.courier' and appName 'HIR Curier'
# already pre-configured in capacitor.config.ts.
pnpm exec cap add ios
pnpm exec cap add android
```

### B.2 — iOS (~2-4 hours)
1. Open `apps/restaurant-courier/ios/App/App.xcworkspace` in Xcode.
2. Set the development team in Signing & Capabilities.
3. Update `Info.plist` with the privacy strings:
   - `NSLocationAlwaysAndWhenInUseUsageDescription` —
     "HIR Curier folosește locația pentru a-ți arăta comenzi din apropiere."
   - `NSLocationWhenInUseUsageDescription` — same.
   - `NSCameraUsageDescription` — "Pentru fotografii de livrare."
   - `NSPhotoLibraryUsageDescription` — "Pentru avatar și fotografii."
4. Add Push Notifications capability + Background Modes (Location updates).
5. `cap sync ios` and run on a real device first; simulator can't
   exercise push or background GPS.
6. Archive → upload to App Store Connect.

### B.3 — Android (~2-3 hours)
1. Open `apps/restaurant-courier/android/` in Android Studio.
2. `cap sync android`.
3. Update `app/src/main/AndroidManifest.xml`:
   - Add `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>`,
     `ACCESS_BACKGROUND_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS`.
4. Generate a release keystore (one-time): `keytool -genkey -keystore hir-courier-release.jks ...`
5. Build → Generate Signed Bundle → upload to Google Play Console.

### B.4 — Store listings
- Screenshots × 4 sizes (iOS) / × 3 (Android) — generate from live PWA
  via Browser dev tools mobile emulation.
- App description (RO + EN).
- Privacy policy URL (link to hirforyou.ro/privacy).
- Support email.

**Definition of done**: courier app live on TestFlight + Google Play
Internal Testing track, with Iulian + 1 test courier installed.

## §C — E2E tests (Playwright)

**Status**: not scaffolded. Adding ~1 day of work.

### C.1 — Scaffold (~1h)
```bash
cd apps/restaurant-courier
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```
Create `playwright.config.ts` at the courier-app root pointing at
`http://localhost:3000` (next dev) and `https://courier-beta-seven.vercel.app`
(prod smoke).

### C.2 — Test fixtures (~2h)
- `tests/fixtures/seed-courier.ts` — creates a test courier via Supabase
  service-role key + assigns to the `hir-default` fleet.
- `tests/fixtures/seed-order.ts` — inserts a CREATED order in the test
  courier's fleet so the smoke test has something to accept.

### C.3 — Five smoke scenarios (~3-4h)
1. **Login + go online + go offline** — happy path, no orders.
2. **Accept order → mark delivered** — full lifecycle, photo proof.
3. **Force-end-shift** — with an active order, modal opens, confirm
   cancels + ends.
4. **Avatar upload** — pick file, see in header.
5. **Forgot-password** — request reset, magic link arrives (mock
   inbox).

### C.4 — CI integration (~1h)
- `.github/workflows/courier-e2e.yml` triggers on PRs touching
  `apps/restaurant-courier/`.
- Uses Vercel preview URL or spins next dev locally.
- Fails the PR if any smoke breaks.

**Definition of done**: 5/5 smoke pass on every PR; CI badge on the
courier README.

## §D — Invite token UX (already shipped, polished today)

**Status**: ✅ shipped (Supabase native invite-by-email + courier
self-register retired in #240). Today's polish: invite now redirects
to `/dashboard` instead of the auth confirmation page.

## §E — Open questions for Iulian
1. App Store + Play Store accounts — do we have them or do we need to
   create them?
2. Privacy policy URL — does `hirforyou.ro/privacy` exist? If not,
   we need to ship it before submission.
3. Support email — `suport@hirforyou.ro` per the help page; verify
   inbox is monitored.
4. iOS background-location entitlement — Apple reviews this strictly;
   plan a 5-10 day buffer for review iterations.

---

Ship order I'd recommend:
1. **§A** (5 min, today) — close the last P0.
2. **§C** (1-2 days) — gives confidence for any subsequent change.
3. **§B** (1-2 weeks calendar, mostly Apple/Google review wait time).
