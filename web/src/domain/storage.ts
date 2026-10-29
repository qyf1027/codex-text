import type { WorkspaceV1 } from './model';

const DB_NAME = 'ipd-smart-tracker-v1';
const STORE = 'workspace';
const FALLBACK_KEY = 'ipd-smart-tracker-v1-local';

function readFallback(): WorkspaceV1 | null {
  const raw = localStorage.getItem(FALLBACK_KEY);
  return raw ? JSON.parse(raw) as WorkspaceV1 : null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadV1(): Promise<WorkspaceV1 | null> {
  try {
    const db = await open();
    try {
      const saved = await new Promise<WorkspaceV1 | null>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('main');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      try { return readFallback() || saved; } catch { if (saved) return saved; throw new Error('备用本地数据损坏'); }
    } finally { db.close(); }
  } catch { return readFallback(); }
}

async function writeWorkspace(workspace: WorkspaceV1): Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(workspace, 'main');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}

let pendingWrite: Promise<void> = Promise.resolve();
export function saveV1(workspace: WorkspaceV1): Promise<void> {
  // Keep writes in the same order as user edits, including after a failed write.
  const next = pendingWrite.catch(() => undefined).then(async () => {
    try { await writeWorkspace(workspace); try { localStorage.removeItem(FALLBACK_KEY); } catch { /* IndexedDB save succeeded. */ } }
    catch { localStorage.setItem(FALLBACK_KEY, JSON.stringify(workspace)); }
  });
  pendingWrite = next;
  return next;
}
