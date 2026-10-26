import type { WorkspaceV1 } from './model';

const DB_NAME = 'ipd-smart-tracker-v1';
const STORE = 'workspace';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadV1(): Promise<WorkspaceV1 | null> {
  const db = await open();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('main');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function saveV1(workspace: WorkspaceV1): Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(workspace, 'main');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
