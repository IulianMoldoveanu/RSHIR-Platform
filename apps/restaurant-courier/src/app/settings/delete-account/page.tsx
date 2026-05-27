import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { DeleteAccountForm } from './delete-account-form';

export const metadata: Metadata = {
  title: 'Șterge cont — HIR Curier',
};

export const dynamic = 'force-dynamic';

export default async function DeleteAccountPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="min-h-dvh bg-[#0F1115] px-5 py-8 text-[#E4E4F0]">
      <div className="mx-auto max-w-md">
        <DeleteAccountForm userEmail={user.email ?? ''} />
      </div>
    </div>
  );
}
