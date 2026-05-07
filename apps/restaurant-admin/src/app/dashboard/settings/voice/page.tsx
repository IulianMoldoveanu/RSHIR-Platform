// Lane VOICE-CHANNEL-TWILIO-SKELETON — settings dashboard.
// OWNER-gated. Companion to /dashboard/voice (read-only call log).

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { readVoiceSettings, estimateMonthlyCostUsd } from '@/lib/voice';
import { VoiceClient } from './voice-client';

export const dynamic = 'force-dynamic';

export default async function VoiceSettingsPage() {
  const { user, tenant } = await getActiveTenant();
  const role = await getTenantRole(user.id, tenant.id);

  const admin = createAdminClient();
  const { data: tenantRow } = await admin
    .from('tenants')
    .select('settings, name')
    .eq('id', tenant.id)
    .maybeSingle();
  const voiceSettings = readVoiceSettings(tenantRow?.settings);

  // Probe the vault to tell the UI whether each token is on file.
  const sbAdmin = admin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data: authProbe } = await sbAdmin.rpc('hir_read_vault_secret', {
    secret_name: `voice_twilio_auth_${tenant.id}`,
  });
  const hasAuthToken = typeof authProbe === 'string' && authProbe.length > 0;
  const { data: openAiProbe } = await sbAdmin.rpc('hir_read_vault_secret', {
    secret_name: `voice_openai_key_${tenant.id}`,
  });
  const hasOpenAiKey = typeof openAiProbe === 'string' && openAiProbe.length > 0;

  // Coarse cost preview at 100 calls/mo, 30s avg — adjust upward if the
  // operator's tenant fields more traffic.
  const costPreview = estimateMonthlyCostUsd(100, 30);

  // Edge function URL the operator pastes into Twilio's voice webhook
  // configuration. Built from the Supabase project URL.
  const functionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/voice-incoming`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Canal vocal — Twilio
        </h1>
        <p className="max-w-3xl text-sm text-zinc-600">
          Conectați un număr de telefon Twilio și HIR va prelua apelurile,
          va transcrie mesajul (Whisper) și va răspunde automat. Pentru
          jurnalul apelurilor consultați{' '}
          <a
            href="/dashboard/voice"
            className="font-medium text-purple-700 hover:underline"
          >
            Apeluri vocale
          </a>
          .
        </p>
      </header>

      {role !== 'OWNER' && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Doar utilizatorii cu rolul <strong>OWNER</strong> pot configura canalul vocal.
        </div>
      )}

      <VoiceClient
        tenantId={tenant.id}
        canEdit={role === 'OWNER'}
        settings={voiceSettings}
        hasAuthToken={hasAuthToken}
        hasOpenAiKey={hasOpenAiKey}
        functionUrl={functionUrl}
        costPreview={costPreview}
      />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900">
          Cum configurați Twilio
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>
            Creați un cont Twilio pe{' '}
            <a
              href="https://www.twilio.com/try-twilio"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-purple-700 hover:underline"
            >
              twilio.com/try-twilio
            </a>{' '}
            (15&nbsp;USD credit gratuit la înscriere).
          </li>
          <li>
            Cumpărați un număr de telefon românesc din{' '}
            <em>Phone Numbers → Buy a number → Country: Romania</em>{' '}
            (~1&nbsp;USD/lună).
          </li>
          <li>
            În <em>Account → Account Info</em>, copiați{' '}
            <strong>Account SID</strong> și <strong>Auth Token</strong> și
            lipiți-le mai sus.
          </li>
          <li>
            Generați o cheie OpenAI pe{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-purple-700 hover:underline"
            >
              platform.openai.com/api-keys
            </a>{' '}
            (Whisper costă ~0,006&nbsp;USD/minut).
          </li>
          <li>
            În Twilio, deschideți numărul cumpărat și la{' '}
            <em>Voice Configuration → A call comes in → Webhook</em>{' '}
            lipiți URL-ul afișat mai sus și salvați (HTTP&nbsp;POST).
          </li>
          <li>
            Activați comutatorul <strong>„Activează canal vocal”</strong> și
            sunați la numărul Twilio pentru un test.
          </li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          Tokenurile sunt stocate criptat în Supabase Vault. HIR nu le afișează
          niciodată după salvare; pentru rotație, lipiți unul nou peste el.
        </p>
      </section>
    </div>
  );
}
