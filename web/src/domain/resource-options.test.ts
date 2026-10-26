import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeResourceShift } from './resource-options';
import type { WorkspaceV1 } from './model';

test('resource shift proposes a later booking without mutating accepted dates', () => {
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', dependencies: [], resources: [{ id: 'r', name: '设备', exclusive: true }], planRevisions: [], riskEvents: [], projects: [
    { id: 'p', name: 'P', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [], tasks: [
      { id: 'a', stageId: 's', title: 'A', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] },
      { id: 'b', stageId: 's', title: 'B', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] },
    ] },
  ], bookings: [
    { id: 'ba', resourceId: 'r', taskId: 'a', anchor: 'fixed_date', fixedStartDate: '2026-10-26', durationWorkdays: 2 },
    { id: 'bb', resourceId: 'r', taskId: 'b', anchor: 'fixed_date', fixedStartDate: '2026-10-27', durationWorkdays: 1 },
  ] };
  const proposal = proposeResourceShift(workspace, 'r');
  assert.equal(proposal?.newDate, '2026-10-28');
  assert.equal(workspace.bookings[1].fixedStartDate, '2026-10-27');
});
