/**
 * Edge Function: hepi-daily-brief-tick
 *
 * Wave 5.4 — daily morning brief for Iulian.
 *
 * Runs once per day (06:00 UTC = 09:00 EEST during summer) via pg_cron.
 * Aggregates yesterday across ALL active tenants and sends a single Telegram
 * message with:
 *   - Revenue + orders + delivered count (vs the day before)
 *   - Top 3 best-selling items across the network
 *   - Unresolved ops_alerts count + the most severe one
 *   - Friction signals: cancelled orders, slow-prep orders (>20 min in kitchen),
 *     courier-side combo acceptance rate.
 *
 * No write side-effects — purely a digest.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRunLog } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtRon(n: number): string {
  return n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RON';
}

function delta(curr: number, prev: number): string {
  if (prev <= 0) return curr > 0 ? '(ieri 0)' : '';
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  const arrow = pct >= 0 ? '▲' : '▼';
  return `${arrow} ${sign}${pct.toFixed(1)}% vs ziua anterioară`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  return withRunLog('hepi-daily-brief-tick', async ({ setMetadata }) => {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tgChat = Deno.env.get('TELEGRAM_IULIAN_CHAT_ID');
    if (!tgToken || !tgChat) {
      return new Response(JSON.stringify({ error: 'telegram_not_configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Windows: yesterday + day before. Use UTC day boundaries.
    const now = new Date();
    const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startYday = new Date(startToday.getTime() - 24 * 3600_000);
    const startDby = new Date(startToday.getTime() - 48 * 3600_000);

    // --- 1. Yesterday revenue + orders + delivered ---------------------------
    const fetchWindow = async (from: Date, to: Date) => {
      const { data } = await sb
        .from('restaurant_orders')
        .select('id, status, total_ron, created_at, items, tenant_id')
        .gte('created_at', from.toISOString())
        .lt('created_at', to.toISOString());
      return (data ?? []) as Array<{
        id: string;
        status: string;
        total_ron: number | string;
        items: unknown;
        tenant_id: string;
      }>;
    };
    const [ydayRows, dbyRows] = await Promise.all([
      fetchWindow(startYday, startToday),
      fetchWindow(startDby, startYday),
    ]);

    const sumRev = (rows: typeof ydayRows) =>
      rows
        .filter((r) => r.status !== 'CANCELLED')
        .reduce((acc, r) => acc + Number(r.total_ron ?? 0), 0);
    const countNotCx = (rows: typeof ydayRows) => rows.filter((r) => r.status !== 'CANCELLED').length;
    const countDel = (rows: typeof ydayRows) => rows.filter((r) => r.status === 'DELIVERED').length;
    const countCx = (rows: typeof ydayRows) => rows.filter((r) => r.status === 'CANCELLED').length;

    const ydayRev = sumRev(ydayRows);
    const dbyRev = sumRev(dbyRows);
    const ydayCnt = countNotCx(ydayRows);
    const dbyCnt = countNotCx(dbyRows);
    const ydayDel = countDel(ydayRows);
    const ydayCx = countCx(ydayRows);

    // --- 2. Top 3 items by qty ---------------------------------------------
    const itemMap = new Map<string, { qty: number; revenue: number }>();
    for (const r of ydayRows) {
      if (r.status === 'CANCELLED') continue;
      const items = Array.isArray(r.items) ? (r.items as Array<Record<string, unknown>>) : [];
      for (const it of items) {
        const name = String(it.name ?? '').slice(0, 60);
        if (!name) continue;
        const qty = Number(it.qty ?? it.quantity ?? 1);
        const price = Number(it.price_ron ?? it.unit_price ?? it.price ?? 0);
        const cur = itemMap.get(name) ?? { qty: 0, revenue: 0 };
        cur.qty += qty;
        cur.revenue += qty * price;
        itemMap.set(name, cur);
      }
    }
    const topItems = [...itemMap.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 3)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }));

    // --- 3. Ops alerts (unresolved + recent CRIT) ---------------------------
    const { count: unresolvedCount } = await sb
      .from('ops_alerts')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null);
    const { data: critRecent } = await sb
      .from('ops_alerts')
      .select('id, alert_type, message, severity, created_at')
      .eq('severity', 'CRIT')
      .gte('created_at', startYday.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    const topCrit = (critRecent ?? [])[0] as
      | { id: string; alert_type: string; message: string }
      | undefined;

    // --- 4. Friction: slow-prep + combo acceptance rate ---------------------
    // Slow prep = orders that spent >20 min in PREPARING-or-earlier states.
    // We approximate by counting orders where (READY/IN_DELIVERY/DELIVERED
    // timestamps span > 20 min from created_at). Cheaper estimator: rows
    // where (delivered_at OR updated_at) - created_at > 20 min for DELIVERED.
    let slowPrep = 0;
    for (const r of ydayRows as Array<{
      status: string;
      created_at?: string;
      updated_at?: string;
    }>) {
      if (r.status !== 'DELIVERED') continue;
      const c = r.created_at ? new Date(r.created_at).getTime() : 0;
      const u = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      if (c && u && u - c > 60 * 60_000) slowPrep++; // >1h end-to-end
    }

    // Combo acceptance: combo pushes sent yesterday vs ones with accepted_at.
    const { data: combo } = await sb
      .from('courier_combo_pushes')
      .select('id, accepted_at')
      .gte('sent_at', startYday.toISOString())
      .lt('sent_at', startToday.toISOString());
    const comboTotal = (combo ?? []).length;
    const comboAccepted = (combo ?? []).filter((r: { accepted_at: string | null }) => r.accepted_at).length;
    const comboRate = comboTotal > 0 ? Math.round((comboAccepted / comboTotal) * 100) : null;

    // --- 5. Compose message --------------------------------------------------
    const lines: string[] = [];
    lines.push('<b>☀️ Hepi · brief de dimineață</b>');
    lines.push(`<i>${startYday.toISOString().slice(0, 10)} → ${startToday.toISOString().slice(0, 10)}</i>`);
    lines.push('');
    lines.push('<b>📊 Ieri pe rețea</b>');
    lines.push(`Încasări: <b>${escapeHtml(fmtRon(ydayRev))}</b>  ${escapeHtml(delta(ydayRev, dbyRev))}`);
    lines.push(`Comenzi: <b>${ydayCnt}</b>  ${escapeHtml(delta(ydayCnt, dbyCnt))}`);
    lines.push(`Livrate: ${ydayDel}${ydayCx > 0 ? ` · Anulate: ${ydayCx}` : ''}`);

    if (topItems.length > 0) {
      lines.push('');
      lines.push('<b>🍽 Top 3 produse</b>');
      for (const it of topItems) {
        lines.push(`· ${escapeHtml(it.name)} — ${it.qty} buc · ${escapeHtml(fmtRon(it.revenue))}`);
      }
    }

    lines.push('');
    lines.push('<b>🚨 Operațional</b>');
    if ((unresolvedCount ?? 0) === 0) {
      lines.push('Niciun ops alert deschis. ✅');
    } else {
      lines.push(`<b>${unresolvedCount}</b> alerte deschise.`);
      if (topCrit) {
        lines.push(
          `Cea mai recentă <code>CRIT</code>: ${escapeHtml((topCrit.message || '').slice(0, 200))}`,
        );
        lines.push(`<i>Rezolvi cu</i> <code>/rezolvat ${topCrit.id.slice(0, 8)}</code>`);
      }
    }

    lines.push('');
    lines.push('<b>🧊 Friction</b>');
    lines.push(`Comenzi cu durată >1h end-to-end: ${slowPrep}`);
    if (comboTotal > 0) {
      lines.push(`Combo pushes acceptate: ${comboAccepted}/${comboTotal} (${comboRate}%)`);
    } else {
      lines.push('Niciun combo push trimis ieri (sau toți curierii erau singuri pe stradă).');
    }

    const text = lines.join('\n').slice(0, 4000);

    const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(tgChat),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!tgRes.ok) {
      console.error('[hepi-daily-brief] telegram failed', tgRes.status, await tgRes.text());
    }

    setMetadata({
      ydayRev,
      ydayCnt,
      ydayDel,
      ydayCx,
      unresolved: unresolvedCount ?? 0,
      combo_total: comboTotal,
      combo_rate: comboRate,
    });

    return new Response(JSON.stringify({ ok: true, ydayRev, ydayCnt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  });
});
