'use client';

const DB_NAME = 'hir.courier.proof-queue';
const DB_VERSION = 1;
const STORE = 'pending';

export type QueuedProof = {
  id?: number;
  orderId: string;
  folder: 'delivery' | 'id' | 'prescription';
  blob: Blob;
  contentType: string;
  ext: string;
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

export async function enqueueProof(item: Omit<QueuedProof, 'id' | 'attempts' | 'createdAt'>): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const record: Omit<QueuedProof, 'id'> = { ...item, attempts: 0, createdAt: Date.now() };
    const req = store.add(record as QueuedProof);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error ?? new Error('enqueue failed'));
  });
}

export async function listPendingProofs(): Promise<QueuedProof[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as QueuedProof[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('list failed'));
  });
}

export async function deleteProof(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('delete failed'));
  });
}

export async function bumpAttempts(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedProof | undefined;
      if (!item) return resolve();
      item.attempts += 1;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('bump failed'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('bump get failed'));
  });
}

export async function countPendingProofs(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('count failed'));
  });
}
