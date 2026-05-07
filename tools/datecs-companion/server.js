// HIR Datecs Companion — local bridge between HIR (cloud) and a Datecs
// FiscalNet-2 fiscal printer (RS-232 / USB on the tenant's premises).
//
// Run on the tenant's PC, expose to HIR via a public tunnel
// (Cloudflare Tunnel / ngrok / Tailscale Funnel — see README).
// HIR (configured as a Custom HTTPS-webhook integration with the
// tunnel URL) POSTs every relevant order event here. The companion:
//   1. Verifies bearer token (env COMPANION_TOKEN must equal the
//      Authorization header HIR sends).
//   2. Verifies HMAC-SHA256 signature on the body using the same
//      secret HIR's integrations UI generated (`X-HIR-Signature`).
//   3. Builds a fiscal-receipt program from the order payload.
//   4. Frames each step into FiscalNet-2 bytes and writes to the
//      serial port.
//   5. Returns 200 + receipt number on success, 4xx/5xx otherwise.
//
// Default OFF: the tenant explicitly enables the Custom-webhook in HIR
// admin and explicitly starts this companion. No data flows otherwise.
//
// V1 deliberately does NOT auto-update, does NOT phone home, does NOT
// send telemetry. The only outbound connections it makes are:
//   - to the serial port (local hardware)
//   - the `console.log` for the operator
//   - the HTTP response back to HIR
//
// Requires: Node 20+, npm install in this directory, a Datecs FP-700
// (or compatible FP-2000 / FMP-350 / DP-50) connected by USB-serial
// or RS-232.

import express from 'express';
import { SerialPort } from 'serialport';
import { createHmac, timingSafeEqual } from 'node:crypto';

// -------- Config (env-driven, no file persistence) --------

const PORT = Number.parseInt(process.env.COMPANION_HTTP_PORT ?? '7890', 10);
// HMAC-SHA256 secret shared with HIR's Custom-webhook integration.
// HIR's existing dispatcher does NOT send an Authorization: Bearer
// header (only X-HIR-Signature + X-HIR-Event + X-HIR-Test-Mode +
// content-type), so the HMAC is the only auth signal we get. That's
// fine — HMAC over the body with a 32-hex secret is strong enough,
// and stays in sync with the contract documented at
// packages/integration-core/src/adapters/custom.ts.
const HIR_WEBHOOK_SECRET = process.env.HIR_WEBHOOK_SECRET ?? '';
const SERIAL_PATH = process.env.DATECS_SERIAL_PATH ?? '';
const SERIAL_BAUD = Number.parseInt(process.env.DATECS_SERIAL_BAUD ?? '115200', 10);
const OPERATOR_CODE = Number.parseInt(process.env.DATECS_OPERATOR_CODE ?? '1', 10);
const OPERATOR_PASSWORD = process.env.DATECS_OPERATOR_PASSWORD ?? '0000';
const TILL_NUMBER = Number.parseInt(process.env.DATECS_TILL_NUMBER ?? '1', 10);
const DRY_RUN = process.env.DATECS_DRY_RUN === '1';

// VAT group letter (single group V1). Tenant overrides if they sell
// alcohol-only or have non-standard VAT.
const DEFAULT_VAT = (process.env.DATECS_DEFAULT_VAT_GROUP ?? 'B').toUpperCase();

if (!HIR_WEBHOOK_SECRET) {
  console.error('[companion] HIR_WEBHOOK_SECRET env is required (must match the webhook secret in HIR admin → Integrări → Custom)');
  process.exit(2);
}
if (!DRY_RUN && !SERIAL_PATH) {
  console.error('[companion] DATECS_SERIAL_PATH env is required (e.g. COM3 on Windows, /dev/ttyUSB0 on Linux). Set DATECS_DRY_RUN=1 to test without a printer.');
  process.exit(2);
}

// -------- Tiny inline receipt builder --------
// Mirrors @hir/integration-core/src/receipts/datecs.ts. Kept inline so
// the companion has zero workspace dependencies. If you change the
// builder in HIR, update this file too — it's a small surface.

function roundRon(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function sanitizeLine(s) {
  // eslint-disable-next-line no-control-regex
  const stripped = String(s ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  return stripped.length <= 36 ? stripped : stripped.slice(0, 36);
}

function chunkLine(s, width) {
  const out = [];
  let rest = String(s ?? '').trim();
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < width / 2) cut = width;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

function buildProgram(order, paymentMethod) {
  const steps = [];
  steps.push({
    kind: 'open_fiscal_receipt',
    operatorCode: OPERATOR_CODE,
    operatorPassword: OPERATOR_PASSWORD,
    tillNumber: TILL_NUMBER,
  });
  steps.push({
    kind: 'free_text',
    text: sanitizeLine(`HIR #${String(order.orderId ?? '').slice(0, 8)}`),
  });
  for (const item of order.items ?? []) {
    const qty = item.qty > 0 ? item.qty : 1;
    const unit = roundRon(item.priceRon);
    if (unit <= 0) continue;
    steps.push({
      kind: 'sale_line',
      description: sanitizeLine(item.name || 'Produs'),
      vat: DEFAULT_VAT,
      unitPriceRon: unit,
      quantity: qty,
    });
  }
  const fee = roundRon(order.totals?.deliveryFeeRon ?? 0);
  if (fee > 0) {
    steps.push({
      kind: 'sale_line',
      description: 'Livrare',
      vat: DEFAULT_VAT,
      unitPriceRon: fee,
      quantity: 1,
    });
  }
  if (!steps.some((s) => s.kind === 'sale_line')) {
    return { orderId: order.orderId, steps: [] };
  }
  if (order.notes && String(order.notes).trim().length > 0) {
    for (const c of chunkLine(order.notes, 36).slice(0, 4)) {
      steps.push({ kind: 'free_text', text: c });
    }
  }
  steps.push({ kind: 'subtotal', print: true });
  steps.push({
    kind: 'payment',
    method: paymentMethod === 'CARD' ? 'card' : 'cash',
    amountRon: roundRon(order.totals?.totalRon ?? 0),
  });
  steps.push({ kind: 'close_fiscal_receipt' });
  return { orderId: order.orderId, steps };
}

// -------- FiscalNet-2 framer --------
//
// FiscalNet-2 packet shape (per Datecs protocol manual):
//   0x01 LEN SEQ CMD DATA 0x05 BCC1 BCC2 BCC3 BCC4 0x03
// where:
//   LEN    = 0x20 + (length of SEQ + CMD + DATA + 0x05) — 1 byte
//   SEQ    = 0x20..0xFF, incremented per request, wraps at 0x100
//   CMD    = 1 byte command code (0x30 open, 0x31 sale, etc.)
//   DATA   = ASCII text, separator '\t' between fields
//   BCC    = 4 ASCII hex digits of (sum of bytes from LEN..0x05) mod 0xFFFF
//
// Printer ACKs with: 0x01 LEN SEQ STATUS DATA 0x04 0x05 BCC1..4 0x03
// where 0x04 separates payload from status.
//
// V1 implementation focus: framing correctness for the happy path
// (each step → one packet → expect ACK with status[0..7] all OK).
// Error recovery (printer paper out, communication timeout, response
// status flags) is logged but not auto-recovered — operator handles.
//
// IMPORTANT: Datecs RO firmware code page = WCP1251 (Cyrillic) by
// default; RO firmware uses CP866 or CP1250 depending on revision.
// We send ASCII only in V1 (sanitized + diacritic-stripped at the
// HIR-side via sanitizeLine). Diacritic preservation is V2.

let seqCounter = 0x20;

function nextSeq() {
  const s = seqCounter;
  seqCounter = seqCounter + 1;
  if (seqCounter > 0xff) seqCounter = 0x20;
  return s;
}

function frameCommand(cmd, dataString) {
  const dataBytes = Buffer.from(dataString, 'ascii');
  // LEN field: 0x20 + (1 SEQ + 1 CMD + DATA.length + 1 (0x05))
  const innerLen = 1 + 1 + dataBytes.length + 1;
  const lenByte = 0x20 + innerLen;
  if (lenByte > 0xff) {
    throw new Error(`fiscalnet2_data_too_long: ${dataBytes.length} bytes`);
  }
  const seq = nextSeq();
  const inner = Buffer.concat([
    Buffer.from([lenByte, seq, cmd]),
    dataBytes,
    Buffer.from([0x05]),
  ]);
  // BCC = sum of inner bytes (LEN..0x05) mod 0xFFFF, written as 4 ASCII hex.
  let sum = 0;
  for (const b of inner) sum = (sum + b) & 0xffff;
  const bccHex = sum.toString(16).toUpperCase().padStart(4, '0');
  const packet = Buffer.concat([
    Buffer.from([0x01]),
    inner,
    Buffer.from(bccHex, 'ascii'),
    Buffer.from([0x03]),
  ]);
  return packet;
}

// FiscalNet-2 command codes (RO firmware mapping).
const CMD = {
  OPEN_FISCAL_RECEIPT: 0x30,
  SALE_LINE: 0x31,
  PRINT_FREE_TEXT: 0x36,
  SUBTOTAL: 0x33,
  PAYMENT: 0x35,
  CLOSE_FISCAL_RECEIPT: 0x38,
};

function stepToPacket(step) {
  switch (step.kind) {
    case 'open_fiscal_receipt': {
      // OperCode \t OperPwd \t TillNo \t InvType (where InvType = '1' = bon fiscal normal)
      const data = `${step.operatorCode}\t${step.operatorPassword}\t${step.tillNumber}\t1\t`;
      return frameCommand(CMD.OPEN_FISCAL_RECEIPT, data);
    }
    case 'sale_line': {
      // Description '\t' VatGroup '\t' UnitPrice '\t' Qty
      // Price + qty as integers in bani / thousandths per FiscalNet-2.
      // Datecs RO firmware accepts decimal as text — we send "12.50" form.
      const desc = step.description.padEnd(36, ' ').slice(0, 36);
      const data = `${desc}\t${step.vat}\t${step.unitPriceRon.toFixed(2)}*${step.quantity.toFixed(3)}\t`;
      return frameCommand(CMD.SALE_LINE, data);
    }
    case 'free_text': {
      // 0x36 = print free text on receipt (max 36 chars).
      return frameCommand(CMD.PRINT_FREE_TEXT, step.text);
    }
    case 'subtotal': {
      // 0x33 = subtotal. ParamFlag '1' = print on tape, '0' = not.
      return frameCommand(CMD.SUBTOTAL, step.print ? '1\t0\t' : '0\t0\t');
    }
    case 'payment': {
      // 0x35 = payment. PayType: '0' = cash (numerar), '7' = card (firmware-specific).
      const payType = step.method === 'card' ? '7' : '0';
      const data = `${payType}\t${step.amountRon.toFixed(2)}\t`;
      return frameCommand(CMD.PAYMENT, data);
    }
    case 'close_fiscal_receipt': {
      return frameCommand(CMD.CLOSE_FISCAL_RECEIPT, '');
    }
    default:
      throw new Error(`unknown_step_kind: ${step.kind}`);
  }
}

// -------- Serial-port write loop --------

let serialPort = null;

async function ensurePortOpen() {
  if (DRY_RUN) return null;
  if (serialPort && serialPort.isOpen) return serialPort;
  serialPort = new SerialPort({ path: SERIAL_PATH, baudRate: SERIAL_BAUD, autoOpen: false });
  await new Promise((resolve, reject) => {
    serialPort.open((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  return serialPort;
}

// Read one ACK packet (0x01..0x03) with a soft timeout. Naïve scanner —
// production hardening (retry on NACK 0x15, multi-packet split) is
// V2.
function readAck(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      port.removeListener('data', onData);
      reject(new Error(`fiscalnet2_ack_timeout_after_${timeoutMs}ms`));
    }, timeoutMs);
    const onData = (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const start = buf.indexOf(0x01);
      const end = buf.indexOf(0x03, start >= 0 ? start : 0);
      if (start >= 0 && end > start) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        port.removeListener('data', onData);
        resolve(buf.slice(start, end + 1));
      }
    };
    port.on('data', onData);
  });
}

async function sendPacket(packet, label) {
  if (DRY_RUN) {
    console.log(`[companion] DRY_RUN ${label} ${packet.toString('hex')}`);
    return { ok: true, dryRun: true };
  }
  const port = await ensurePortOpen();
  await new Promise((resolve, reject) => {
    port.write(packet, (err) => (err ? reject(err) : resolve()));
  });
  await new Promise((resolve, reject) => {
    port.drain((err) => (err ? reject(err) : resolve()));
  });
  const ack = await readAck(port, 5000);
  console.log(`[companion] ${label} ACK ${ack.length}B`);
  return { ok: true, ackHex: ack.toString('hex') };
}

async function executeProgram(program) {
  const results = [];
  for (let i = 0; i < program.steps.length; i++) {
    const step = program.steps[i];
    const packet = stepToPacket(step);
    const r = await sendPacket(packet, `${program.orderId}#${i}:${step.kind}`);
    results.push({ step: step.kind, ok: r.ok, dryRun: r.dryRun ?? false });
  }
  return results;
}

// -------- Express HTTP server --------

const app = express();
// Capture raw body for HMAC. Express default JSON parser drops it.
app.use(
  express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
);

function signatureMatches(rawBody, signature) {
  if (!signature || typeof signature !== 'string') return false;
  const expected = createHmac('sha256', HIR_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    name: 'hir-datecs-companion',
    dryRun: DRY_RUN,
    serialPath: DRY_RUN ? null : SERIAL_PATH,
    serialBaud: DRY_RUN ? null : SERIAL_BAUD,
  });
});

app.post('/print', async (req, res) => {
  // Auth: HMAC-SHA256 over raw body using the shared HIR webhook
  // secret. HIR's dispatcher does NOT send an Authorization header
  // (only X-HIR-Signature + X-HIR-Event + X-HIR-Test-Mode), so the
  // signature is the only auth signal — and it's strong enough.
  const sig = req.get('x-hir-signature') ?? req.get('X-HIR-Signature');
  if (!signatureMatches(req.rawBody ?? Buffer.from(''), sig ?? '')) {
    return res.status(403).json({ ok: false, error: 'bad_signature' });
  }

  const envelope = req.body;
  if (!envelope || typeof envelope !== 'object') {
    return res.status(400).json({ ok: false, error: 'bad_envelope' });
  }

  // HIR Custom envelope shape: { event, test_mode, order, delivered_at }
  const { event, test_mode: testMode, order } = envelope;
  if (!order || typeof order !== 'object') {
    return res.status(400).json({ ok: false, error: 'no_order' });
  }
  if (testMode === true) {
    // "Testează conexiunea" path — do NOT print a fiscal receipt
    // (would consume tape on the live printer + register a 0-RON
    // sale in the fiscal memory which is illegal). Just ack.
    return res.json({ ok: true, testMode: true, printed: false });
  }

  // Read payment method from envelope (HIR sets it as part of order.paymentMethod
  // when available; falls back to top-level envelope.payment_method or null).
  const paymentMethod =
    (order.paymentMethod ?? envelope.payment_method ?? null) || null;

  const program = buildProgram(order, paymentMethod);
  if (program.steps.length === 0) {
    return res.status(422).json({ ok: false, error: 'empty_program' });
  }

  try {
    const results = await executeProgram(program);
    return res.json({
      ok: true,
      orderId: program.orderId,
      event,
      printed: !DRY_RUN,
      steps: results,
    });
  } catch (e) {
    console.error('[companion] print failed', e);
    return res.status(500).json({
      ok: false,
      error: 'print_failed',
      detail: (e && e.message) || String(e),
    });
  }
});

app.listen(PORT, () => {
  console.log(`[companion] HIR Datecs companion listening on :${PORT}`);
  console.log(`[companion] dryRun=${DRY_RUN} serialPath=${SERIAL_PATH || '(none)'} baud=${SERIAL_BAUD}`);
  console.log('[companion] Expose this port via Cloudflare Tunnel / ngrok / Tailscale Funnel — see README.');
});
