// One-shot codebase indexer for the Fix Agent RAG (Phase 3).
// Walks apps/restaurant-admin/src and apps/restaurant-web/src (NEVER courier),
// chunks each .ts/.tsx file (~500 tokens, ≤80 lines), embeds with OpenAI
// text-embedding-3-small (if OPENAI_API_KEY is set), and upserts into
// public.code_chunks. Falls back to text-only inserts (FTS-only retrieval)
// when no OPENAI_API_KEY is provided.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   [OPENAI_API_KEY=...] \
//   node supabase/scripts/index-codebase.mjs
//
// Idempotent: keyed on (file_path, chunk_index, committed_sha).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';
import { execSync } from 'node:child_process';
import { argv, exit } from 'node:process';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://qfmeojeipncuxeltnvab.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY  = process.env.OPENAI_API_KEY ?? null;

if (!SERVICE_ROLE) {
  console.error('SUPABASE_SERVICE_ROLE_KEY missing.');
  exit(2);
}

const ROOT = process.cwd();
const TARGETS = [
  { dir: 'apps/restaurant-admin/src', app: 'restaurant-admin' },
  { dir: 'apps/restaurant-web/src',   app: 'restaurant-web'   },
  { dir: 'packages/ui/src',           app: 'shared'           },
  { dir: 'packages/delivery-client/src', app: 'shared'        },
];

const MAX_LINES_PER_CHUNK = 80;
const APPROX_TOKENS_PER_LINE = 8;     // rough heuristic
const MAX_TOKENS_PER_CHUNK = 500;

const HEAD_SHA = (() => {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch { return 'unknown'; }
})();

console.log(`[index-codebase] HEAD ${HEAD_SHA}`);
console.log(`[index-codebase] OpenAI embeddings: ${OPENAI_KEY ? 'YES' : 'NO (FTS fallback)'}`);

// --- file walker --------------------------------------------------------
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'dist' || name.startsWith('.')) continue;
      walk(p, out);
    } else if (st.isFile() && /\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// --- chunker ------------------------------------------------------------
function chunkFile(content) {
  const lines = content.split(/\r?\n/);
  const chunks = [];
  let buf = [];
  let bufTokens = 0;
  for (const line of lines) {
    const lineTokens = Math.max(1, Math.ceil(line.length / 4));
    if (buf.length >= MAX_LINES_PER_CHUNK || bufTokens + lineTokens > MAX_TOKENS_PER_CHUNK * 1.2) {
      if (buf.length > 0) chunks.push(buf.join('\n'));
      buf = [];
      bufTokens = 0;
    }
    buf.push(line);
    bufTokens += lineTokens;
  }
  if (buf.length > 0) chunks.push(buf.join('\n'));
  return chunks;
}

// --- OpenAI embeddings (batched) ----------------------------------------
async function embedBatch(texts) {
  if (!OPENAI_KEY) return texts.map(() => null);
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  return j.data.map((d) => d.embedding);
}

// --- Supabase upsert ----------------------------------------------------
async function upsertChunks(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/code_chunks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`upsert code_chunks ${res.status}: ${t.slice(0, 500)}`);
  }
}

async function startIndexRun() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/code_chunks_index_runs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify([{ head_sha: HEAD_SHA, status: 'RUNNING' }]),
  });
  if (!res.ok) throw new Error(`startIndexRun ${res.status}: ${await res.text()}`);
  const arr = await res.json();
  return arr[0].id;
}

async function finishIndexRun(id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/code_chunks_index_runs?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ...body, finished_at: new Date().toISOString() }),
  });
  if (!res.ok) console.warn(`[finishIndexRun] ${res.status}: ${await res.text()}`);
}

// --- main --------------------------------------------------------------
async function main() {
  const runId = await startIndexRun();
  console.log(`[index-codebase] run ${runId} started`);

  const allFiles = [];
  for (const t of TARGETS) {
    const root = join(ROOT, t.dir);
    const files = walk(root);
    files.forEach((f) => allFiles.push({ path: f, app: t.app }));
  }
  console.log(`[index-codebase] ${allFiles.length} files to index`);

  let chunksAdded = 0;
  let chunksSkipped = 0;
  let totalTokens = 0;

  const BATCH = 16;
  let pending = [];
  let pendingMeta = [];

  async function flush() {
    if (pending.length === 0) return;
    let embeddings = pending.map(() => null);
    if (OPENAI_KEY) {
      try {
        embeddings = await embedBatch(pending);
      } catch (e) {
        console.warn(`[embed] batch failed: ${e.message}`);
      }
    }
    const rows = pending.map((text, i) => {
      const m = pendingMeta[i];
      const row = {
        file_path: m.file_path,
        chunk_index: m.chunk_index,
        chunk_text: text,
        app: m.app,
        committed_sha: HEAD_SHA,
      };
      if (embeddings[i]) row.embedding = embeddings[i];
      return row;
    });
    try {
      await upsertChunks(rows);
      chunksAdded += rows.length;
    } catch (e) {
      chunksSkipped += rows.length;
      console.warn(`[upsert] ${e.message}`);
    }
    pending = [];
    pendingMeta = [];
  }

  for (const f of allFiles) {
    let content;
    try { content = readFileSync(f.path, 'utf8'); } catch { continue; }
    if (content.length === 0) continue;
    if (content.length > 200_000) {
      // skip absurdly large files
      chunksSkipped++;
      continue;
    }
    const chunks = chunkFile(content);
    const relPath = relative(ROOT, f.path).split(sep).join(posix.sep);
    chunks.forEach((text, idx) => {
      pending.push(text);
      pendingMeta.push({ file_path: relPath, chunk_index: idx, app: f.app });
      totalTokens += Math.ceil(text.length / 4);
    });
    while (pending.length >= BATCH) {
      const slice = pending.slice(0, BATCH);
      const sliceMeta = pendingMeta.slice(0, BATCH);
      pending = pending.slice(BATCH);
      pendingMeta = pendingMeta.slice(BATCH);
      const saved = pending; const savedMeta = pendingMeta;
      pending = slice; pendingMeta = sliceMeta;
      await flush();
      pending = saved; pendingMeta = savedMeta;
    }
  }
  await flush();

  // Cost estimate (text-embedding-3-small: $0.02 / 1M tokens)
  const costUsd = OPENAI_KEY ? (totalTokens / 1_000_000) * 0.02 : 0;

  await finishIndexRun(runId, {
    status: 'OK',
    chunks_added: chunksAdded,
    chunks_skipped: chunksSkipped,
  });

  console.log(`[index-codebase] DONE`);
  console.log(`  files:        ${allFiles.length}`);
  console.log(`  chunks added: ${chunksAdded}`);
  console.log(`  skipped:      ${chunksSkipped}`);
  console.log(`  tokens:       ${totalTokens}`);
  console.log(`  est. cost:    $${costUsd.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  exit(1);
});
