import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import {
  acceptOrderAction,
  markPickedUpAction,
  markDeliveredAction,
} from '@/app/dashboard/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called by the service worker Background Sync handler when the network
// returns after a courier transition (accept / pickup / deliver) was enqueued
// offline. The SW sends the raw IDB record so we can dispatch the correct
// server action.
//
// The server actions filter on `.in('status', [from])` + courier ownership,
// so replaying a transition that already succeeded silently no-ops — no
// separate dedupe token needed.

type DrainBody = {
  id: number;
  kind: 'accept' | 'pickup' | 'deliver';
  orderId: string;
  payload: {
    proofUrl?: string;
    cashCollected?: boolean;
    pharmaProofs?: { idUrl?: string; prescriptionUrl?: string };
  };
};

export async function POST(req: NextRequest) {
  // Auth check — the SW sends credentials:'include' so the Supabase session
  // cookie arrives here. Return 401 (not redirect) because the caller is a
  // service worker, not a browser navigation.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: DrainBody;
  try {
    body = (await req.json()) as DrainBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { kind, orderId, payload } = body;

  if (!orderId || typeof orderId !== 'string') {
    return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
  }
  if (kind !== 'accept' && kind !== 'pickup' && kind !== 'deliver') {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  try {
    switch (kind) {
      case 'accept':
        await acceptOrderAction(orderId);
        break;
      case 'pickup':
        await markPickedUpAction(orderId);
        break;
      case 'deliver':
        await markDeliveredAction(
          orderId,
          payload?.proofUrl,
          payload?.cashCollected,
          payload?.pharmaProofs,
        );
        break;
    }
    return NextResponse.json({ ok: true });
  } catch {
    // Return 500 so the SW bumps attempts and retries later. Do not surface
    // the internal error — the SW caller only cares about ok vs not-ok.
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
