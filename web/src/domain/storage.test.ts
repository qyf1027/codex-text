import test from 'node:test';
import assert from 'node:assert/strict';
import { loadV1, saveV1 } from './storage';
import type { WorkspaceV1 } from './model';

test('local storage fallback keeps the app usable when IndexedDB is unavailable', async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } } });
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'fallback-ws', projects: [], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  await saveV1(workspace);
  assert.deepEqual(await loadV1(), workspace);
});
