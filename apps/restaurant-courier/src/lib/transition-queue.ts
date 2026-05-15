'use client';

// IndexedDB queue for accept/pickup/deliver state transitions.
//
// The server actions are structurally idempotent — every UPDATE filters on
// `.in('status', [from])` plus `.eq('assigned_courier_user_id', userId)`,
// so a replay after the transition has already succeeded (or after another
// courier claimed the order) silently no-ops on the server. That makes it
// safe to drain the queue without per-item dedupe tokens.
//
// Mirrors the shape of `proof-queue.ts` — same `openDb` / `enqueue` /
// `listPending` / `delete` / `bumpAttempts` / `count` surface — so the
// `TransitionSync` sentinel can reuse the same retry pattern as `ProofSync`.

const DB_NAME = 'hir.courier.transition-queue';
const DB_VERSION = 1;
const STORE = 'pending';

export type TransitionKind = 'accept' | 'pickup' | 'deliver';

export type TransitionPayload = {
  proofUrl?: string;
  cashCollected?: boolean;
  pharmaProofs?: { idUrl?: string; prescriptionUrl?: string };
};

export type QueuedTransition = {
  id?: number;
  kind: TransitionKind;
  orderId: string;
  payload: TransitionPayload;
  createdAt: number;
  attempts: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function enqueueTransition(
  item: Omit<QueuedTransition, 'id' | 'attempts' | 'createdAt'>,
): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const record: Omit<QueuedTransition, 'id'> = {
      ...item,
      attempts: 0,
      createdAt: Date.now(),
    };
    const req = store.add(record as QueuedTransition);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error ?? new Error('enqueue failed'));
  });
}

export async function listPendingTransitions(): Promise<QueuedTransition[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as QueuedTransition[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('list failed'));
  });
}

export async function deleteTransition(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('delete failed'));
  });
}

export async function bumpTransitionAttempts(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedTransition | undefined;
      if (!item) return resolve();
      item.attempts += 1;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('bump failed'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('bump get failed'));
  });
}

export async function countPendingTransitions(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('count failed'));
  });
}
