'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button, toast } from '@hir/ui';

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Right-of-portability download button (GDPR Art. 20).
 *
 * Takes the already-fetched audit rows from the parent server component
 * plus any device-side LocalStorage state and bundles them as a single
 * downloadable JSON file. Pure client — no extra round-trip.
 */
export function GdprDataExportButton({ entries }: { entries: AuditEntry[] }) {
  const [busy, setBusy] = useState(false);

  function collectLocalStorage(): Record<string, unknown> {
    const collected: Record<string, unknown> = {};
    if (typeof localStorage === 'undefined') return collected;
    // Only HIR-prefixed keys; everything else is third-party.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('hir-courier')) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        collected[key] = JSON.parse(raw);
      } catch {
        collected[key] = raw;
      }
    }
    return collected;
  }

  function download() {
    setBusy(true);
    try {
      const payload = {
        exported_at: new Date().toISOString(),
        gdpr_article: 20,
        notes:
          'Acest fișier conține datele personale ale curierului colectate de aplicația HIR Curier. ' +
          'Drepturile GDPR (rectificare, ștergere, restricționare) se exercită la dpo@hirforyou.ro.',
        audit_log_last_100: entries,
        local_storage_hir_keys: collectLocalStorage(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `hir-curier-date-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Datele tale au fost descărcate.', { duration: 4_000 });
    } catch (e) {
      console.error('[gdpr-export]', e);
      toast('Descărcarea a eșuat. Încearcă din nou sau contactează DPO.', {
        duration: 5_000,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      onClick={download}
      disabled={busy}
      variant="outline"
      size="sm"
      className="self-start"
    >
      <Download className="mr-2 h-4 w-4" aria-hidden />
      {busy ? 'Se pregătește…' : 'Descarcă datele mele (JSON)'}
    </Button>
  );
}
