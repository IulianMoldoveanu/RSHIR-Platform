'use client';

import { useState, useTransition } from 'react';
import { Button, EmptyState, toast } from '@hir/ui';
import { Sparkles, Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import {
  PROPOSAL_KIND_LABELS,
  PROPOSAL_STATUS_LABELS,
  type MenuAgentProposalRow,
  type ProposeNewItemPayload,
  type MarkSoldOutPayload,
  type DraftPromoPayload,
} from '@/lib/ai/agents/menu-agent';
import { acceptProposal, dismissProposal } from './menu-agent-actions';

export function MenuAgentProposalsPanel({
  tenantId,
  proposals,
}: {
  tenantId: string;
  proposals: MenuAgentProposalRow[];
}) {
  const [filter, setFilter] = useState<'DRAFT' | 'ALL'>('DRAFT');

  const filtered = filter === 'DRAFT' ? proposals.filter((p) => p.status === 'DRAFT') : proposals;
  const draftCount = proposals.filter((p) => p.status === 'DRAFT').length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-600">
            Sugestii generate de Hepy din Telegram. Acceptați-le manual când le aplicați în meniu — Hepy nu modifică automat produsele dumneavoastră.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFilter('DRAFT')}
            className={`rounded-md px-3 py-1.5 ${
              filter === 'DRAFT' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            În așteptare ({draftCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`rounded-md px-3 py-1.5 ${
              filter === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Toate ({proposals.length})
          </button>
        </div>
      </header>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" aria-hidden />}
          title={filter === 'DRAFT' ? 'Nicio sugestie nouă' : 'Niciun istoric de sugestii'}
          description={
            filter === 'DRAFT'
              ? 'Pentru a primi sugestii, scrieți pe Telegram: /menu_propune <descriere produs> sau /menu_oprime <nume produs> sau /menu_promo <nume> — <brief>.'
              : 'Sugestiile vor apărea aici imediat ce trimiteți o comandă din Telegram.'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((p) => (
            <ProposalCard key={p.id} tenantId={tenantId} proposal={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  tenantId,
  proposal,
}: {
  tenantId: string;
  proposal: MenuAgentProposalRow;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const isDraft = proposal.status === 'DRAFT';

  function onDecide(action: 'accept' | 'dismiss') {
    start(async () => {
      const fn = action === 'accept' ? acceptProposal : dismissProposal;
      const r = await fn(tenantId, { proposalId: proposal.id });
      if (!r.ok) {
        toast.error(r.error === 'forbidden' ? 'Doar OWNER poate decide.' : 'Nu am putut salva decizia.');
        return;
      }
      toast.success(action === 'accept' ? 'Sugestie acceptată.' : 'Sugestie respinsă.');
    });
  }

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <KindBadge kind={proposal.kind} />
            <StatusBadge status={proposal.status} />
            <time className="flex items-center gap-1 text-xs text-zinc-500">
              <Clock className="h-3 w-3" aria-hidden />
              {formatRelative(proposal.created_at)}
            </time>
          </div>
          <ProposalSummary kind={proposal.kind} payload={proposal.payload} />
        </div>
        {isDraft && (
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="default" onClick={() => onDecide('accept')} disabled={pending}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Acceptă
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDecide('dismiss')} disabled={pending}>
              <X className="mr-1 h-3.5 w-3.5" />
              Respinge
            </Button>
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-zinc-100 pt-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Ascunde detalii' : 'De ce și detalii'}
        </button>
        {expanded && (
          <div className="mt-2 flex flex-col gap-2 text-xs text-zinc-700">
            {proposal.rationale && <p className="italic">{proposal.rationale}</p>}
            <ProposalDetails kind={proposal.kind} payload={proposal.payload} />
            <p className="text-zinc-400">
              Sursă: {proposal.channel} · Model: {proposal.model ?? '—'} ·{' '}
              {proposal.input_tokens != null && proposal.output_tokens != null
                ? `${proposal.input_tokens}+${proposal.output_tokens} tokens`
                : 'tokens necunoscut'}
            </p>
            {proposal.status !== 'DRAFT' && proposal.decided_at && (
              <p className="text-zinc-400">
                Decis: {new Date(proposal.decided_at).toLocaleString('ro-RO')}
                {proposal.decision_note ? ` — ${proposal.decision_note}` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function KindBadge({ kind }: { kind: MenuAgentProposalRow['kind'] }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
      {PROPOSAL_KIND_LABELS[kind]}
    </span>
  );
}

function StatusBadge({ status }: { status: MenuAgentProposalRow['status'] }) {
  const colors =
    status === 'DRAFT'
      ? 'bg-amber-100 text-amber-800'
      : status === 'ACCEPTED'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-zinc-100 text-zinc-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {PROPOSAL_STATUS_LABELS[status]}
    </span>
  );
}

function ProposalSummary({
  kind,
  payload,
}: {
  kind: MenuAgentProposalRow['kind'];
  payload: MenuAgentProposalRow['payload'];
}) {
  if (kind === 'new_item') {
    const p = payload as ProposeNewItemPayload;
    return (
      <h3 className="text-sm font-semibold text-zinc-900">
        {p.name} · <span className="font-normal text-zinc-700">{p.price_ron.toFixed(2)} RON · {p.category_hint}</span>
      </h3>
    );
  }
  if (kind === 'sold_out') {
    const p = payload as MarkSoldOutPayload;
    return (
      <h3 className="text-sm font-semibold text-zinc-900">
        Marcaj epuizat: {p.item_name}
      </h3>
    );
  }
  const p = payload as DraftPromoPayload;
  return (
    <h3 className="text-sm font-semibold text-zinc-900">
      {p.headline} · <span className="font-normal text-zinc-700">{p.item_name} −{p.discount_pct}%</span>
    </h3>
  );
}

function ProposalDetails({
  kind,
  payload,
}: {
  kind: MenuAgentProposalRow['kind'];
  payload: MenuAgentProposalRow['payload'];
}) {
  if (kind === 'new_item') {
    const p = payload as ProposeNewItemPayload;
    return (
      <div className="flex flex-col gap-1">
        <p>
          <strong>Descriere:</strong> {p.description}
        </p>
        {p.tags.length > 0 && (
          <p>
            <strong>Etichete:</strong> {p.tags.join(', ')}
          </p>
        )}
      </div>
    );
  }
  if (kind === 'sold_out') {
    const p = payload as MarkSoldOutPayload;
    return (
      <div className="flex flex-col gap-1">
        <p>
          <strong>Mesaj client:</strong> {p.customer_facing_reason}
        </p>
        <p>
          <strong>Până la:</strong> {p.until_iso}
        </p>
      </div>
    );
  }
  const p = payload as DraftPromoPayload;
  return (
    <div className="flex flex-col gap-1">
      <p>
        <strong>Mesaj:</strong> {p.body}
      </p>
      <p>
        <strong>Valabilitate:</strong> {p.valid_from} → {p.valid_to}
      </p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'acum';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `acum ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `acum ${h}h`;
  const d = Math.floor(h / 24);
  return `acum ${d} ${d === 1 ? 'zi' : 'zile'}`;
}
