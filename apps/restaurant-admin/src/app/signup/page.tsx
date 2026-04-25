import { SignupForm } from './signup-form';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">HIR Restaurant</h1>
          <p className="text-sm text-zinc-600">
            Site propriu, comenzi online, livrare. Demo gratuit Brașov.
          </p>
        </div>
        <SignupForm />
      </div>
    </main>
  );
}
