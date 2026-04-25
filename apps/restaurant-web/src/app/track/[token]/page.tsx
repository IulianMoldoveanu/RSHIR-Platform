import { z } from 'zod';
import { notFound } from 'next/navigation';
import { TrackClient } from './TrackClient';

export const dynamic = 'force-dynamic';

export default function TrackPage({ params }: { params: { token: string } }) {
  const parsed = z.string().uuid().safeParse(params.token);
  if (!parsed.success) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <TrackClient token={parsed.data} />
    </main>
  );
}
