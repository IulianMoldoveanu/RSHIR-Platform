import { RegisterForm } from './register-form';

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">HIR Curier</h1>
          <p className="text-sm text-zinc-600">
            Înregistrare curier — primește comenzi de la HIR sau direct de la clienți.
          </p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
