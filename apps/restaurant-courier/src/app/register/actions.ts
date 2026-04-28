'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(72),
  vehicleType: z.enum(['BIKE', 'SCOOTER', 'CAR']),
});

export type RegisterCourierResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerCourierAction(
  input: z.infer<typeof schema>,
): Promise<RegisterCourierResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Date invalide. Verifică toate câmpurile.' };
  }
  const { fullName, phone, email, password, vehicleType } = parsed.data;

  const admin = createAdminClient();

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !created.user) {
    console.error('[courier register] createUser failed:', authErr?.message);
    return { ok: false, error: 'Nu am putut crea contul. Verifică datele și încearcă din nou.' };
  }

  const { error: profileErr } = await admin.from('courier_profiles').insert({
    user_id: created.user.id,
    full_name: fullName,
    phone,
    vehicle_type: vehicleType,
    status: 'INACTIVE',
  });
  if (profileErr) {
    // Roll back the auth user so the email is reusable.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    console.error('[courier register] profile insert failed:', profileErr.message);
    return { ok: false, error: 'Nu am putut salva profilul. Încearcă din nou.' };
  }

  return { ok: true };
}
