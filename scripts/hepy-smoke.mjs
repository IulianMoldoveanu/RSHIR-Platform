// Hepy PR A smoke — POSTs synthetic Telegram webhook payloads (from the
// allow-listed chat_id) to the live telegram-command-intake function and
// observes the HTTP status. Real Telegram replies are sent to Iulian's
// chat. Run AFTER the function is deployed with PR A.
//
// Usage:
//   node scripts/hepy-smoke.mjs
//
// This script uses no Supabase credentials — the function gates on
// chat_id at the application layer.

const URL_FN = 'https://qfmeojeipncuxeltnvab.supabase.co/functions/v1/telegram-command-intake';
const ALLOWED_CHAT_ID = 1274150118;

const tests = [
  '/tenant foisorul-a',
  'cum a mers ieri',
  'top produse saptamana',
  'cate comenzi am acum',
  'cati curieri sunt online',
  'ce recomandari am azi',
  '/status hepy',
  '/help hepy',
  'salutari', // expected: falls through to /ask
];

let i = 0;
for (const text of tests) {
  i++;
  const payload = {
    update_id: 9000000 + i,
    message: {
      message_id: 9000 + i,
      from: { id: ALLOWED_CHAT_ID, username: 'iulian_smoke' },
      chat: { id: ALLOWED_CHAT_ID, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  };
  const r = await fetch(URL_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  console.log(`[${i}/${tests.length}] ${text} -> ${r.status} ${body.slice(0, 100)}`);
  await new Promise((res) => setTimeout(res, 1500));
}
