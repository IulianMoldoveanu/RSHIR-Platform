# GloriaFood → HIR migration runbook

**Catalyst.** GloriaFood announced shutdown on **2027-04-30**. Every restaurant on
GloriaFood is a candidate to migrate to HIR before that date. This runbook is
the playbook for resellers + onboarding agents to execute a clean migration in
under 5 minutes per restaurant.

**Importer source.** `apps/restaurant-admin/src/lib/gloriafood/parser.ts`
(pure parser, vitest-covered) wrapped by
`app/dashboard/onboarding/migrate-from-gloriafood/actions.ts` (auth + DB
commit). Two import paths exist:

1. **Master Key API** (recommended) — operator pastes their GloriaFood
   Master Key into `/dashboard/onboarding/migrate-from-gloriafood/master-key`
   and the importer fetches the live menu via
   `https://www.beta.gloriafood.com/v2/master/<KEY>/menus`.
2. **CSV upload** — operator uploads a `.csv` exported from GloriaFood.
   This path is the fallback when the Master Key has expired or the
   account has been read-only-frozen by GloriaFood.

This document covers the **CSV path**. The Master Key path has identical
post-fetch handling (categories + items committed via the same
`commitGloriaFoodImport` function), so all category + price + name
limitations described below apply to both.

---

## 1. Operator export procedure (instructions to give the restaurant)

> **Romanian copy** — paste this verbatim into the restaurant's onboarding
> chat. We assume the operator has GloriaFood Admin access.

```
Pași export meniu din GloriaFood:

1. Conectați-vă la https://admin.gloriafood.com
2. Click pe "Menu" în meniul lateral stâng
3. Click pe butonul "..." din colțul drept-sus → alegeți "Export"
4. Alegeți "Export as CSV" (NU Excel — Excel poate strica caracterele
   diacritice românești)
5. Descărcați fișierul (de obicei "menu-export-YYYY-MM-DD.csv")
6. Trimiteți-l către agentul HIR sau încărcați-l direct la
   https://app.hir.ro/dashboard/onboarding/migrate-from-gloriafood
```

**If the operator has Master Key:** prefer that path — same data, no
file passing, idempotent re-import. Master Key is at
GloriaFood Admin → Settings → API → Master Key.

---

## 2. Known limitations (read before importing)

### 2.1 Comma-CSV with comma decimals — silent price truncation

GloriaFood's default CSV uses **`.`** as decimal separator (US format),
which works fine with comma-delimited columns:

```
Item,Price
Burger,25.50      ← correct: parses as 25.50
```

**However**, if the operator opens the CSV in Excel-RO and re-saves it,
Excel may rewrite prices as RO comma decimals while keeping comma
delimiters:

```
Item,Price
Burger,25,50      ← BAD: parser splits into 3 fields, reads 25, drops .50
```

The parser auto-detects the delimiter (comma vs semicolon) from the
header row but **cannot disambiguate** when both the delimiter and the
decimal separator are commas.

**Mitigation.**
- **Best:** ask the operator to use the original GloriaFood CSV
  (untouched). Default GloriaFood exports use `.` decimals.
- **Acceptable:** if the operator must re-save through Excel, ask them
  to choose semicolon-CSV (`Save As → CSV (Semicolon delimited)`).
- **Last resort:** open the CSV in a text editor and either change
  `.` decimals back, or change the delimiter to `;`.

The parser flags the situation indirectly by importing prices ending in
`.00` for every item where this happened — a sales agent reviewing the
preview should spot it immediately.

### 2.2 EUR / non-RON currency suffixes

The parser strips `RON` / `LEI` suffixes from the price column but
does **not** strip `EUR`, `USD`, etc. A price like `5.00 EUR` parses to
`5` (RON), which is **wrong** for the merchant.

**Mitigation.** HIR is RON-only. Tell the operator to convert all
non-RON prices to RON before exporting. The preview screen shows every
imported price — flag any suspicious round numbers.

### 2.3 Duplicate item names within a category

If a category has two items with the same name (e.g. `Coca-Cola` x2 for
different sizes), the parser keeps both rows. The DB has no uniqueness
constraint on `(tenant_id, category_id, name)`, so the import succeeds
but the storefront will show two identical-looking items.

**Mitigation.** Operator must rename one (e.g. `Coca-Cola 0.33L` /
`Coca-Cola 0.5L`) before export, OR edit the menu after import.

### 2.4 Variants / modifiers / images not imported

GloriaFood CSV may include `Variant`, `Variant Price`, `Image URL`,
`Modifiers` columns. The parser **ignores all of them** — only
`Category`, `Item`, `Description`, `Price` are read.

**Mitigation.** Set expectations: post-import, the operator must
re-add variants in HIR's menu editor. The Master Key API path also has
this limitation (variants not consumed in V1 of the importer).

### 2.5 Long fields truncated

- Item name > 200 chars → truncated to 200, flagged.
- Description > 1000 chars → truncated to 1000 (no flag).

### 2.6 Items with price 0 or unparseable price

- Price `0` or `0,00` → imported with `is_available=false`, flagged
  "Preț 0 — verifică manual".
- Price `abc` / empty → imported with `price_ron=0`,
  `is_available=false`, flagged "Preț neidentificabil".

The operator must review and fix flagged items in
`/dashboard/menu` after import.

### 2.7 Encoding: UTF-8 expected, BOM tolerated

The parser strips a leading UTF-8 BOM if present. Other encodings
(Windows-1250, Latin-1) are NOT auto-detected — the operator must save
the CSV as UTF-8. Most modern Excel + LibreOffice exports default to
UTF-8 already.

**Mitigation if Latin-1.** Open in Notepad++ → Encoding → Convert to
UTF-8 → save. Or paste the contents of the file into a Google Sheets
tab and re-export as CSV (Sheets always exports UTF-8).

---

## 3. Time estimate per restaurant size

| Menu size            | Categories | Items   | Estimated import time  |
|----------------------|-----------:|--------:|------------------------|
| Small (café / bar)   |  3 – 8     |  20–60  | < 30 seconds           |
| Medium (restaurant)  |  8 – 20    |  60–250 | < 90 seconds           |
| Large (multi-cuisine)| 20 – 50    | 250–500 | < 4 minutes            |

The parser hard-caps at 2 000 items per import (Zod schema in
`commitGloriaFoodImport`). Restaurants exceeding this should split the
import into multiple CSV files (one per top-level category group).

---

## 4. Rollback procedure

If the import goes wrong (e.g. all prices are off by a factor of 100,
all categories ended up under "Necategorisit", or the operator
reports "this isn't my menu"):

1. **Identify the import.** Query the audit log:
   ```sql
   select created_at, actor_user_id, metadata
     from audit_log
     where tenant_id = '<TENANT_UUID>'
       and action = 'menu.gloriafood_import'
     order by created_at desc
     limit 5;
   ```
   Each row carries `metadata.categories_created`,
   `metadata.items_created`, and `metadata.flagged_count`. Use the
   row's `created_at` as your rollback timestamp.

   > **Note.** The `gloriafood_import_runs` table from migration
   > `20260505_002_gloriafood_imports.sql` is currently **not
   > written to** by `commitGloriaFoodImport` — it is reserved for a
   > future writer that will store per-run progress. Use `audit_log`
   > today.

2. **Identify the rows it created.** Categories + items inserted by
   the run have `created_at` very close to the audit-log
   `created_at`. Use a window of `created_at ± 30s`.
3. **Soft-delete the rows.**
   ```sql
   update restaurant_menu_items
     set is_available = false
     where tenant_id = '<TENANT_UUID>'
       and created_at between
         '<audit_log_created_at>'::timestamptz - interval '30 seconds'
         and '<audit_log_created_at>'::timestamptz + interval '30 seconds';
   ```
4. **(If safe) Hard-delete.** Only do this if the operator has not yet
   taken any orders against the imported menu. Otherwise retain rows
   to keep order history intact (orders reference `menu_item_id`).
   ```sql
   delete from restaurant_menu_items
     where tenant_id = '<TENANT_UUID>'
       and created_at between ...;
   delete from restaurant_menu_categories
     where tenant_id = '<TENANT_UUID>'
       and created_at between ...
       and id not in (select category_id from restaurant_menu_items
                       where tenant_id = '<TENANT_UUID>'
                       and category_id is not null);
   ```
5. **Re-import** with the corrected CSV. The `external_source` +
   `external_id` unique index makes Master Key re-imports idempotent.
   CSV re-imports do NOT have IDs and would create duplicates — clean
   up step 3/4 first.

`logAudit` records `menu.gloriafood_import` with `categories_created` +
`items_created` + `flagged_count` for forensics.

---

## 5. Validation status (2026-05-08)

- **Pure parser** (`parseGloriaFoodCsvText`): **42 unit tests** under
  `apps/restaurant-admin/src/lib/gloriafood/parser.test.ts`,
  all passing. Coverage: header detection (EN + RO + mixed-case),
  price parsing (RO comma, EN dot, RON/LEI suffix, thousands
  separators, negative/empty), CSV quirks (BOM, CRLF, semicolon,
  quoted fields, escaped quotes), 11 stress cases from the lane brief.
- **Real-account export validation**: **PENDING**. No real GloriaFood
  test account export has been run through the importer in V1.
  **Recommendation:** Iulian to provide a real export from any RO
  GloriaFood restaurant within the next 7 days so we can run a
  full-fidelity end-to-end test before the Brașov pilot scales.
- **End-to-end commit path** (`commitGloriaFoodImport`): exercised
  manually during PR #268-#271 (post-demo gaps) for FOISORUL A's
  initial seed; no automated coverage. The pure-parser refactor
  preserves the call signature so existing manual-test results carry
  forward.

---

## 6. References

- Importer wave: PR #268-#271 (post-demo gaps, 2026-05-05).
- Schema: `supabase/migrations/20260505_002_gloriafood_imports.sql`.
- Pure-parser refactor + 42-test stress suite: this PR.
- GloriaFood deep-dive (kept locally): `~/.hir/research/gloriafood-deep-dive.md`.
