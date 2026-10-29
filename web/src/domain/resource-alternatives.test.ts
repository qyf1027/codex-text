import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeResourceAlternatives } from './resource-alternatives';
import type { WorkspaceV1 } from './model';

function fixture(): WorkspaceV1 {
  return { schemaVersion: 1, id: 'ws', projects: [
    { id: 'p1', name: '高优先级 A', startDate: '2026-11-02', priority: 'high', status: 'active', stages: [{ id: 's1', name: 'TR1', order: 0 }], gates: [{ id: 'g1', name: 'A GA', targetDate: '2026-11-13', deadlineType: 'soft', requiredTaskIds: ['t1'], requiredDeliverableIds: [] }], tasks: [{ id: 't1', stageId: 's1', title: '测试 A', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }] },
    { id: 'p2', name: '中优先级 B', startDate: '2026-11-02', priority: 'medium', status: 'active', stages: [{ id: 's2', name: 'TR1', order: 0 }], gates: [{ id: 'g2', name: 'B GA', targetDate: '2026-11-03', deadlineType: 'hard', requiredTaskIds: ['t2'], requiredDeliverableIds: [] }], tasks: [{ id: 't2', stageId: 's2', title: '测试 B', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }] },
  ], dependencies: [], resources: [{ id: 'r', name: '独占实验台', exclusive: true }], bookings: [
    { id: 'b1', resourceId: 'r', taskId: 't1', anchor: 'task_relative', offsetDays: 0, durationWorkdays: 2 },
    { id: 'b2', resourceId: 'r', taskId: 't2', anchor: 'task_relative', offsetDays: 0, durationWorkdays: 2 },
  ], planRevisions: [], riskEvents: [] };
}

test('resource candidates compare both orderings and keep the only hard-deadline-feasible order', () => {
  const workspace = fixture();
  const options = proposeResourceAlternatives(workspace, 'r', '2026-10-29');
  assert.equal(options.length, 2);
  assert.equal(options[0].feasible, true);
  assert.equal(options[0].changes[0].entityId, 't1');
  assert.equal(options[0].gateImpacts.find(gate => gate.gateId === 'g2')?.after, '2026-11-03');
  assert.equal(options[1].feasible, false);
  assert.ok(options[1].reasons.some(reason => reason.includes('硬截止')));
  assert.equal(workspace.bookings[0].offsetDays, 0);
});

test('moving a fixed exclusive booking extends the owning task and GA instead of hiding the delay', () => {
  const workspace = fixture();
  workspace.bookings[0].anchor = 'fixed_date'; workspace.bookings[0].fixedStartDate = '2026-11-02'; workspace.bookings[0].offsetDays = undefined;
  workspace.bookings[1].anchor = 'fixed_date'; workspace.bookings[1].fixedStartDate = '2026-11-02'; workspace.bookings[1].offsetDays = undefined;
  const options = proposeResourceAlternatives(workspace, 'r', '2026-10-29');
  assert.equal(options.length, 2);
  assert.equal(options[0].feasible, true);
  assert.equal(options[0].changes[0].entityId, 'b1');
  assert.equal(options[1].feasible, false);
  assert.equal(options[1].gateImpacts.find(gate => gate.gateId === 'g2')?.after, '2026-11-05');
});
