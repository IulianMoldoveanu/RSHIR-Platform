'use client';

import { useState, useTransition } from 'react';
import { uploadKyfDocumentAction, saveKyfMetaAction, submitKyfAction, signedUrlAction } from './actions';

type KyfRow = {
  cui: string | null;
  company_name: string | null;
  reg_com: string | null;
  caen_code: string | null;
  address: string | null;
  iban: string | null;
  act_constitutiv_url: string | null;
  extras_cont_url: string | null;
  certificat_inreg_url: string | null;
  kyf_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  submitted_at: string | null;
} | null;

type Slot = {
  key: 'act_constitutiv' | 'extras_cont' | 'certificat_inreg';
  label: string;
  hint: string;
};

const SLOTS: Slot[] = [
  {
    key: 'act_constitutiv',
    label: 'Act constitutiv',
    hint: 'Actul constitutiv al firmei (statut + decizia asociatilor). PDF sau imagine.',
  },
  {
    key: 'extras_cont',
    label: 'Extras de cont (IBAN dovedit)',
    hint: 'Extras recent (sub 30 zile) sau certificat bancar care confirma IBAN-ul.',
  },
  {
    key: 'certificat_inreg',
    label: 'Certificat de inregistrare ONRC',
    hint: 'Certificatul de inregistrare la Registrul Comertului (CUI + Reg. Com.).',
  },
];

export function KyfUploadForm({
  fleetName,
  kyf,
  readOnly,
}: {
  fleetName: string;
  kyf: KyfRow;
  readOnly: boolean;
}) {
  const [regCom, setRegCom] = useState(kyf?.reg_com ?? '');
  const [caenCode, setCaenCode] = useState(kyf?.caen_code ?? '');
  const [iban, setIban] = useState(kyf?.iban ?? '');
  const [address, setAddress] = useState(kyf?.address ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function flashErr(msg: string) {
    setSuccess(null);
    setError(msg);
  }
  function flashOk(msg: string) {
    setError(null);
    setSuccess(msg);
  }

  async function onUpload(slot: Slot['key'], file: File) {
    if (readOnly) return;
    const fd = new FormData();
    fd.set('slot', slot);
    fd.set('file', file);
    startTransition(async () => {
      const res = await uploadKyfDocumentAction(fd);
      if (!res.ok) flashErr(res.error ?? 'Eroare la incarcare.');
      else flashOk('Document incarcat.');
    });
  }

  async function onSaveMeta() {
    if (readOnly) return;
    const fd = new FormData();
    fd.set('reg_com', regCom);
    fd.set('caen_code', caenCode);
    fd.set('iban', iban);
    fd.set('address', address);
    startTransition(async () => {
      const res = await saveKyfMetaAction(fd);
      if (!res.ok) flashErr(res.error ?? 'Eroare la salvare.');
      else flashOk('Date firma salvate.');
    });
  }

  async function onSubmit() {
    if (readOnly) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      // Save meta first so submit validation has fresh DB state.
      const fd = new FormData();
      fd.set('reg_com', regCom);
      fd.set('caen_code', caenCode);
      fd.set('iban', iban);
      fd.set('address', address);
      const metaRes = await saveKyfMetaAction(fd);
      if (!metaRes.ok) {
        flashErr(metaRes.error ?? 'Eroare la salvare.');
        return;
      }
      const res = await submitKyfAction();
      if (!res.ok) flashErr(res.error ?? 'Eroare la trimitere.');
      else flashOk('Trimis spre verificare. Iti raspundem in sub 24h.');
    });
  }

  async function openSigned(slot: Slot['key']) {
    const fd = new FormData();
    fd.set('slot', slot);
    const res = await signedUrlAction(fd);
    if (res.url) window.open(res.url, '_blank', 'noopener');
    else flashErr(res.error ?? 'Document indisponibil');
  }

  return (
    <div className="space-y-6">
      {/* Flash messages */}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {/* Section 1: documents */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">1. Documente firma</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Maxim 10 MB per fisier. Format acceptat: PDF, JPG, PNG, WEBP.
        </p>
        <div className="mt-4 space-y-4">
          {SLOTS.map((slot) => {
            const url = kyf?.[`${slot.key}_url`];
            const uploaded = Boolean(url);
            return (
              <div
                key={slot.key}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900">{slot.label}</span>
                    {uploaded ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Incarcat
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Lipsa
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{slot.hint}</p>
                </div>
                <div className="flex items-center gap-2">
                  {uploaded ? (
                    <button
                      type="button"
                      onClick={() => openSigned(slot.key)}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Vezi
                    </button>
                  ) : null}
                  <label
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold ${
                      readOnly
                        ? 'pointer-events-none bg-zinc-200 text-zinc-500'
                        : uploaded
                          ? 'border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {uploaded ? 'Inlocuieste' : 'Incarca fisier'}
                    <input
                      type="file"
                      hidden
                      disabled={readOnly || pending}
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpload(slot.key, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: meta */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">2. Date firma</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Firma" value={kyf?.company_name ?? fleetName} disabled />
          <Field label="CUI" value={kyf?.cui ?? ''} disabled />
          <div>
            <label className="block text-xs font-medium text-zinc-600">Reg. Comertului</label>
            <input
              type="text"
              value={regCom}
              onChange={(e) => setRegCom(e.target.value)}
              placeholder="J40/123/2020"
              disabled={readOnly || pending}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Cod CAEN</label>
            <input
              type="text"
              value={caenCode}
              onChange={(e) => setCaenCode(e.target.value)}
              placeholder="5320"
              maxLength={4}
              disabled={readOnly || pending}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">Adresa sediu</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Str. ..., nr ..., Bucuresti / Brasov"
              disabled={readOnly || pending}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">
              IBAN (cont firma — primesti plati saptamanal aici)
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              placeholder="RO12 BTRL RONC RT00 00 00 0000"
              disabled={readOnly || pending}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-indigo-500 focus:outline-none disabled:bg-zinc-100"
            />
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            onClick={onSaveMeta}
            disabled={readOnly || pending}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Salveaza datele
          </button>
        </div>
      </section>

      {/* Section 3: submit */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">3. Trimite spre verificare</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Dupa ce ai incarcat documentele si salvat datele, apasa butonul de mai jos. Iti raspundem in sub 24h.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onSubmit}
            disabled={readOnly || pending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? 'Se trimite...' : 'Trimite spre verificare'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, disabled }: { label: string; value: string; disabled?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <input
        type="text"
        value={value}
        readOnly
        disabled={disabled}
        className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
      />
    </div>
  );
}
