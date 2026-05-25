// Hepi Curier — AI assistant for couriers. Wave 2 MVP.
//
// POST /api/courier/hepi
//   body: { prompt: string, history?: Array<{role:'user'|'assistant', content:string}> }
//   response: { ok: true, response: string, run_id: string }
//
// Authenticated couriers only. Calls Anthropic Messages API directly (no SDK
// dependency) with a Hepi-Curier persona system prompt. Every call is audited
// in public.courier_agent_runs.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

const SYSTEM_PROMPT = `You are Hepi Curier, the friendly AI co-pilot for HIR delivery couriers in Romania.

Your job: help the courier work smarter and earn more. Be concise, warm, practical. Romanian by default.

You can help with:
- Route advice (which order to pick up first, how to batch combo deliveries)
- Customer issues (what to say when a customer is late, how to handle a complaint)
- Shift planning (best hours / zones based on the courier's history)
- Earnings questions ("how do I make 200 RON more this week?")
- Quick FAQ about HIR processes (pickup procedure, payment, returns)

Style:
- Short. Maximum 2-3 short paragraphs unless asked for detail.
- Always in the courier's tone — direct, no jargon.
- If something is risky (cancel an order, contact restaurant), be explicit about what action to take.
- If you don't know something, say so and suggest who to ask (dispatcher, support).

You CANNOT:
- See the courier's specific orders (those tools come in v2).
- Modify any data in the system.
- Make refunds, cancel orders, or change shift status. The courier does that in-app.

Identity: you are HIR's courier-side counterpart to Hepi (the restaurant assistant). Two assistants, one platform.`;

const MODEL = 'claude-haiku-4-5-20251001';

export async function POST(req: NextRequest) {
  const supa = await createServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const { prompt, history } = parsed.data;

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...history,
    { role: 'user', content: prompt },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  let responseText = '';
  let model = MODEL;
  let promptTokens: number | null = null;
  let responseTokens: number | null = null;
  let errorText: string | null = null;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
    if (!res.ok) {
      errorText = `anthropic_${res.status}`;
      const detail = await res.text().catch(() => '');
      console.error('[hepi-curier] anthropic failed', res.status, detail);
    } else {
      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string }>;
        model: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      responseText = data.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text as string)
        .join('\n')
        .trim();
      model = data.model ?? MODEL;
      promptTokens = data.usage?.input_tokens ?? null;
      responseTokens = data.usage?.output_tokens ?? null;
    }
  } catch (e) {
    errorText = e instanceof Error ? e.message : 'unknown';
    console.error('[hepi-curier] fetch threw', errorText);
  }

  const { data: runRow } = await admin
    .from('courier_agent_runs')
    .insert({
      courier_id: user.id,
      agent_name: 'hepi-curier',
      prompt,
      response: responseText || null,
      model,
      prompt_tokens: promptTokens,
      response_tokens: responseTokens,
      error: errorText,
    })
    .select('id')
    .single();

  if (errorText) {
    return NextResponse.json(
      { error: 'ai_call_failed', detail: errorText, run_id: runRow?.id },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    response: responseText,
    run_id: runRow?.id,
  });
}
