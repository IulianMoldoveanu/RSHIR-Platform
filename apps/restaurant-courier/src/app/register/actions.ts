'use server';

// Audit §3.2: self-register retired (2026-05-05).
//
// The previous unauthenticated `registerCourierAction` allowed anyone on
// the internet to spam-create real auth.users + auto-bind them to the
// hir-default fleet. No CAPTCHA, no rate limit, no email verification.
// Per the bot-strategy review the canonical onboarding path is
// fleet-manager invite, so the self-register door is now closed.
//
// This module is kept (not deleted) so any legacy cached PWA form post
// hits a loud rejection instead of silently creating accounts.

export type RegisterCourierResult =
  | { ok: true }
  | { ok: false; error: string };

export async function registerCourierAction(): Promise<RegisterCourierResult> {
  return {
    ok: false,
    error:
      'Înrolarea curierilor se face prin invitație de la dispecerul tău. Contactează-l direct, sau scrie-ne la hello@hirforyou.ro.',
  };
}
