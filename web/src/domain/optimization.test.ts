import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeForGate } from './optimization';
import type { WorkspaceV1 } from './model';

test('candidate reduces only adjustable predecessor and leaves baseline unchanged', () => {
  const workspace: WorkspaceV1 = {
    schemaVersion: 1, id: 'ws', resources: [], bookings: [], planRevisions: [], riskEvents: [], dependencies: [
      { id: 'e', sourceType: 'task_completion', sourceId: 'a', targetType: 'task_start', targetId: 'b' },
    ], projects: [{ id: 'p', name: 'P', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], tasks: [
      { id: 'a', stageId: 's', title: 'A', status: 'not_started', standardDurationDays: 5, minimumDurationDays: 3, deliverables: [] },
      { id: 'b', stageId: 's', title: 'B', status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] },
      { id: 'x', stageId: 's', title: 'X', status: 'not_started', standardDurationDays: 8, minimumDurationDays: 1, deliverables: [] },
    ], gates: [{ id: 'g', name: 'GA', targetDate: '2026-10-29', deadlineType: 'soft', requiredTaskIds: ['b'], requiredDeliverableIds: [] }] }],
  };
  const proposal = proposeForGate(workspace, 'g');
  assert.deepEqual(proposal.changes.map(change => change.entityId), ['a']);
  assert.equal(proposal.feasible, true);
  assert.equal(workspace.projects[0].tasks[0].standardDurationDays, 5);
});
