'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMemberZoneCapability, type TeamActionResult } from './actions';
import type { TeamMember } from './page';

export function TeamClient({
  members,
  canEdit,
  tenantId,
}: {
  members: TeamMember[];
  canEdit: boolean;
  tenantId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<TeamActionResult | null>(null);

  function toggleZones(member: TeamMember) {
    if (!canEdit || member.role === 'OWNER') return;
    setFeedback(null);
    setBusyId(member.user_id);
    start(async () => {
      const result = await setMemberZoneCapability(
        member.user_id,
        tenantId,
        !member.can_manage_zones,
      );
      setFeedback(result);
      setBusyId(null);
      if (result.ok) router.refresh();
    });
  }

  if (members.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        Niciun membru încă.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Rol</th>
              <th className="px-4 py-2 text-left">Poate edita zone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {members.map((m) => {
              const ownerImplicit = m.role === 'OWNER';
              const checked = ownerImplicit ? true : m.can_manage_zones;
              const disabled = !canEdit || ownerImplicit || (pending && busyId === m.user_id);
              return (
                <tr key={m.user_id} className="text-zinc-900">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.email ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        ownerImplicit
                          ? 'inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800'
                          : 'inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700'
                      }
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checked}
                        onChange={() => toggleZones(m)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span className="text-xs text-zinc-600">
                        {ownerImplicit
                          ? 'Implicit (OWNER)'
                          : checked
                          ? 'Permis'
                          : 'Refuzat'}
                      </span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {feedback && <FeedbackBanner result={feedback} />}
    </div>
  );
}

function FeedbackBanner({ result }: { result: TeamActionResult }) {
  if (result.ok) {
    return <span className="text-xs text-emerald-700">Permisiune actualizată.</span>;
  }
  const map: Record<string, string> = {
    unauthenticated: 'Sesiune expirată — autentifică-te din nou.',
    forbidden_owner_only: 'Doar OWNER poate modifica permisiunile.',
    invalid_input: 'Input invalid.',
    cannot_modify_owner: 'OWNER are deja permisiunea, nu poate fi schimbată aici.',
    member_not_found: 'Membrul nu mai există.',
    db_error: 'Eroare la salvare.',
  };
  return (
    <span className="text-xs text-rose-700">
      {map[result.error] ?? result.error}
      {result.detail ? ` (${result.detail})` : ''}
    </span>
  );
}
