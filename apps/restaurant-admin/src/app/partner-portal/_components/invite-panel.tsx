'use client';

import { useState } from 'react';

// ────────────────────────────────────────────────────────────
// Outreach templates — audience-segmented copy for the share buttons.
//
// Each template ships a WhatsApp/Telegram body, a separate email subject +
// body, and an aria-label for screen readers. Email is plain-text (mailto:
// strips HTML). Copy is intentionally short (< 280 chars body for chat) so
// it lands well on phones; the partner adds their own context if needed.
//
// Templates avoid the contested public pricing line ("3 RON / livrare" vs
// the locked 1+1=2 RON model 2026-05-07) — they pitch value props the
// partner can defend regardless of the final pricing surface.
// ────────────────────────────────────────────────────────────

type AudienceKey = 'generic' | 'gloriafood' | 'brasov' | 'horeca';

type Template = {
  key: AudienceKey;
  label: string;
  hint: string;
  chatBody: (url: string) => string;
  emailSubject: string;
  emailBody: (url: string) => string;
};

const TEMPLATES: Template[] = [
  {
    key: 'generic',
    label: 'Generic',
    hint: 'Mesaj scurt, neutru — bun pentru contacte noi.',
    chatBody: (url) =>
      `Salut, îți recomand HIR pentru comenzi online la restaurant — fără abonament, fără procent agresiv. Detalii și înscriere: ${url}`,
    emailSubject: 'Soluție de comenzi online pentru restaurantul tău',
    emailBody: (url) =>
      `Salut,\n\nÎți recomand HIR pentru comenzi online la restaurant. Plătești o taxă fixă mică pe livrare, fără abonament și fără procent ca la marketplace-uri.\n\nLink direct (cu pre-completare): ${url}\n\nDacă ai întrebări, sună-mă.`,
  },
  {
    key: 'gloriafood',
    label: 'GloriaFood',
    hint: 'Restaurante care folosesc GloriaFood — Oracle închide platforma 30 aprilie 2027.',
    chatBody: (url) =>
      `Salut, ai văzut că Oracle închide GloriaFood pe 30 aprilie 2027? HIR are importer direct de meniu și păstrezi datele clienților. Migrare în 5 minute: ${url}`,
    emailSubject: 'GloriaFood se închide în 2027 — alternativă cu importer direct',
    emailBody: (url) =>
      `Salut,\n\nOracle a anunțat oficial închiderea GloriaFood pe 30 aprilie 2027. Toate restaurantele care folosesc platforma trebuie să migreze undeva.\n\nHIR e construit în România și are importer direct de meniu din GloriaFood — migrarea durează ~5 minute, păstrezi datele clienților și ai control complet pe brand.\n\nDetalii și migrare: ${url}\n\nÎți pot arăta într-un demo de 10 minute dacă te interesează.`,
  },
  {
    key: 'brasov',
    label: 'Brașov / pilot',
    hint: 'Lead-uri din Brașov — ancoră FOISORUL A, demo local.',
    chatBody: (url) =>
      `Salut, FOISORUL A din Brașov rulează deja pe HIR — comenzi online cu pagină proprie, brand respectat. Pot să-ți arăt cum arată live: ${url}`,
    emailSubject: 'HIR — restaurante din Brașov deja active',
    emailBody: (url) =>
      `Salut,\n\nÎți scriu din partea HIR. FOISORUL A (Brașov) e deja pe platformă — pagină de comenzi proprie, fără cross-promote la concurență, datele clienților rămân la restaurant.\n\nDacă vrei să-l vezi live sau să facem un demo de 15 minute la tine la restaurant, sună-mă. Link cu detalii și înscriere directă: ${url}\n\nMulțumesc!`,
  },
  {
    key: 'horeca',
    label: 'HoReCa owner',
    hint: 'Proprietari care plătesc deja 15-25% comision pe Wolt / Glovo / Tazz.',
    chatBody: (url) =>
      `Salut, dacă plătești 15-25% pe Wolt sau Glovo, hai să vorbim. HIR îți dă pagină proprie, fără procent agresiv, datele clienților rămân la tine. Detalii: ${url}`,
    emailSubject: 'Reduci comisionul de la marketplace la livrare directă',
    emailBody: (url) =>
      `Salut,\n\nȘtiu că marketplace-urile (Wolt, Glovo, Tazz) iau 15-25% din fiecare comandă și nu îți dau datele clienților.\n\nHIR îți construiește pagina ta de comenzi online — clientul comandă direct la tine, datele rămân la tine, plătești doar o taxă fixă pe livrare. Curierul e tot HIR (sau al tău, dacă preferi).\n\nLink cu detalii: ${url}\n\nDacă vrei un demo de 15 minute, dă-mi un semn.`,
  },
];

const DEFAULT_AUDIENCE: AudienceKey = 'generic';

export function InvitePanel({ referralUrl }: { referralUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [audience, setAudience] = useState<AudienceKey>(DEFAULT_AUDIENCE);

  const tpl = TEMPLATES.find((t) => t.key === audience) ?? TEMPLATES[0];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input text
      const el = document.getElementById('referral-url-input') as HTMLInputElement | null;
      el?.select();
    }
  }

  const chatText = encodeURIComponent(tpl.chatBody(referralUrl));
  const emailSubject = encodeURIComponent(tpl.emailSubject);
  const emailBody = encodeURIComponent(tpl.emailBody(referralUrl));

  return (
    <section
      aria-label="Linkul tău de invitație"
      className="rounded-lg border border-purple-200 bg-purple-50 p-4"
    >
      <h2 className="mb-1 text-sm font-semibold text-purple-900">
        Linkul tău de invitație
      </h2>
      <p className="mb-3 text-xs text-purple-700">
        Trimite acest link restaurantelor pe care le recrutezi. Comisionul tău va fi
        înregistrat automat după activarea contului.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="referral-url-input"
          readOnly
          value={referralUrl}
          className="flex-1 rounded-md border border-purple-300 bg-white px-3 py-2 text-sm font-mono text-zinc-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          aria-label="URL referral unic"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copiază linkul de invitație"
            className="rounded-md border border-purple-300 bg-white px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
          >
            {copied ? 'Copiat!' : 'Copiază'}
          </button>
          <a
            href={`https://wa.me/?text=${chatText}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Distribuie pe WhatsApp — șablon ${tpl.label}`}
            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
          >
            WhatsApp
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${chatText}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Distribuie pe Telegram — șablon ${tpl.label}`}
            className="rounded-md bg-sky-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-600"
          >
            Telegram
          </a>
          <a
            href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
            aria-label={`Distribuie prin email — șablon ${tpl.label}`}
            className="rounded-md border border-purple-300 bg-white px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
          >
            Email
          </a>
        </div>
      </div>

      {/* Audience template selector */}
      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-semibold text-purple-900">
          Șablon mesaj
        </legend>
        <div
          role="radiogroup"
          aria-label="Alege șablonul potrivit pentru audiența ta"
          className="flex flex-wrap gap-2"
        >
          {TEMPLATES.map((t) => {
            const active = t.key === audience;
            return (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAudience(t.key)}
                className={
                  active
                    ? 'rounded-md border border-purple-500 bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm'
                    : 'rounded-md border border-purple-300 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100'
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-purple-700" aria-live="polite">
          {tpl.hint}
        </p>

        {/* Live preview of the chat body so the partner sees what they'll
            send. Using a textarea (readOnly) so long previews wrap and the
            partner can copy a slice manually if they prefer. */}
        <label className="mt-3 block text-xs font-medium text-purple-900">
          Previzualizare WhatsApp / Telegram
          <textarea
            readOnly
            value={tpl.chatBody(referralUrl)}
            className="mt-1 block h-20 w-full resize-none rounded-md border border-purple-300 bg-white px-3 py-2 font-mono text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-label="Previzualizare mesaj chat"
          />
        </label>
      </fieldset>
    </section>
  );
}
