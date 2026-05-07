'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveTenant, getTenantRole } from '@/lib/tenant';
import { logAudit } from '@/lib/audit';
import {
  isValidAccountSid,
  isValidAuthToken,
  isValidGreeting,
  isValidOpenAiKey,
  isValidPhoneNumber,
  readVoiceSettings,
} from '@/lib/voice';

export type VoiceResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string };

type AdminLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function authVaultName(tenantId: string): string {
  return `voice_twilio_auth_${tenantId}`;
}

function openAiVaultName(tenantId: string): string {
  return `voice_openai_key_${tenantId}`;
}

/**
 * Save the non-sensitive voice settings + (optionally) rotate the Twilio
 * Auth Token + OpenAI key in the Vault. Token fields are write-only; empty
 * value means "leave existing alone". Submit a literal "__CLEAR__" sentinel
 * to remove a token.
 */
export async function saveVoiceSettings(formData: FormData): Promise<VoiceResult> {
  const accountSid = String(formData.get('twilio_account_sid') ?? '').trim();
  const phoneNumber = String(formData.get('twilio_phone_number') ?? '').trim();
  const greeting = String(formData.get('greeting') ?? '').trim();
  const enabled = formData.get('enabled') === 'on';
  const authTokenInput = String(formData.get('twilio_auth_token') ?? '');
  const openAiKeyInput = String(formData.get('openai_api_key') ?? '');
  const expectedTenantId = String(formData.get('tenantId') ?? '');

  if (!expectedTenantId) {
    return { ok: false, error: 'invalid_input', detail: 'tenantId' };
  }
  if (!isValidAccountSid(accountSid)) {
    return { ok: false, error: 'invalid_input', detail: 'twilio_account_sid' };
  }
  if (!isValidPhoneNumber(phoneNumber)) {
    return { ok: false, error: 'invalid_input', detail: 'twilio_phone_number' };
  }
  if (!isValidGreeting(greeting)) {
    return { ok: false, error: 'invalid_input', detail: 'greeting' };
  }

  const { user, tenant } = await getActiveTenant().catch(() => ({
    user: null,
    tenant: null,
  }));
  if (!user || !tenant) return { ok: false, error: 'unauthenticated' };
  if (tenant.id !== expectedTenantId) return { ok: false, error: 'tenant_mismatch' };

  const role = await getTenantRole(user.id, expectedTenantId);
  if (role !== 'OWNER') return { ok: false, error: 'forbidden_owner_only' };

  const admin = createAdminClient();

  // Twilio Auth Token rotation.
  let authTokenAction: 'kept' | 'set' | 'cleared' = 'kept';
  if (authTokenInput === '__CLEAR__') {
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_delete_vault_secret',
      { secret_name: authVaultName(expectedTenantId) },
    );
    if (error) {
      return { ok: false, error: 'db_error', detail: `vault_delete: ${error.message}` };
    }
    authTokenAction = 'cleared';
  } else if (authTokenInput.length > 0) {
    if (!isValidAuthToken(authTokenInput)) {
      return { ok: false, error: 'invalid_input', detail: 'twilio_auth_token' };
    }
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_write_vault_secret',
      {
        secret_name: authVaultName(expectedTenantId),
        secret_value: authTokenInput.trim(),
        secret_description: `Twilio Auth Token for tenant ${expectedTenantId}`,
      },
    );
    if (error) {
      return { ok: false, error: 'db_error', detail: `vault_write: ${error.message}` };
    }
    authTokenAction = 'set';
  }

  // OpenAI key rotation.
  let openAiAction: 'kept' | 'set' | 'cleared' = 'kept';
  if (openAiKeyInput === '__CLEAR__') {
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_delete_vault_secret',
      { secret_name: openAiVaultName(expectedTenantId) },
    );
    if (error) {
      return { ok: false, error: 'db_error', detail: `vault_delete: ${error.message}` };
    }
    openAiAction = 'cleared';
  } else if (openAiKeyInput.length > 0) {
    if (!isValidOpenAiKey(openAiKeyInput)) {
      return { ok: false, error: 'invalid_input', detail: 'openai_api_key' };
    }
    const { error } = await (admin as unknown as AdminLike).rpc(
      'hir_write_vault_secret',
      {
        secret_name: openAiVaultName(expectedTenantId),
        secret_value: openAiKeyInput.trim(),
        secret_description: `OpenAI API key (Whisper) for tenant ${expectedTenantId}`,
      },
    );
    if (error) {
      return { ok: false, error: 'db_error', detail: `vault_write: ${error.message}` };
    }
    openAiAction = 'set';
  }

  // Read-merge-write the jsonb settings. Avoid clobbering unrelated keys.
  const { data: tenantRow, error: readErr } = await admin
    .from('tenants')
    .select('settings')
    .eq('id', expectedTenantId)
    .single();
  if (readErr || !tenantRow) {
    return { ok: false, error: 'db_error', detail: readErr?.message ?? 'tenant_not_found' };
  }
  const currentSettings =
    tenantRow.settings && typeof tenantRow.settings === 'object'
      ? (tenantRow.settings as Record<string, unknown>)
      : {};
  const currentVoice = readVoiceSettings(currentSettings);

  const nextVoice = {
    ...currentVoice,
    enabled,
    twilio_account_sid: accountSid,
    twilio_phone_number: phoneNumber,
    greeting,
  };

  const { error: writeErr } = await admin
    .from('tenants')
    .update({ settings: { ...currentSettings, voice: nextVoice } })
    .eq('id', expectedTenantId);
  if (writeErr) {
    return { ok: false, error: 'db_error', detail: writeErr.message };
  }

  await logAudit({
    tenantId: expectedTenantId,
    actorUserId: user.id,
    action: 'voice.settings_updated',
    entityType: 'tenant',
    entityId: expectedTenantId,
    metadata: {
      enabled,
      auth_token_action: authTokenAction,
      openai_action: openAiAction,
    },
  });
  if (authTokenAction === 'set') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: user.id,
      action: 'voice.token_set',
      entityType: 'tenant',
      entityId: expectedTenantId,
      metadata: { kind: 'twilio_auth_token' },
    });
  } else if (authTokenAction === 'cleared') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: user.id,
      action: 'voice.token_cleared',
      entityType: 'tenant',
      entityId: expectedTenantId,
      metadata: { kind: 'twilio_auth_token' },
    });
  }
  if (openAiAction === 'set') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: user.id,
      action: 'voice.token_set',
      entityType: 'tenant',
      entityId: expectedTenantId,
      metadata: { kind: 'openai_api_key' },
    });
  } else if (openAiAction === 'cleared') {
    await logAudit({
      tenantId: expectedTenantId,
      actorUserId: user.id,
      action: 'voice.token_cleared',
      entityType: 'tenant',
      entityId: expectedTenantId,
      metadata: { kind: 'openai_api_key' },
    });
  }

  revalidatePath('/dashboard/settings/voice');
  revalidatePath('/dashboard/voice');
  return { ok: true };
}
