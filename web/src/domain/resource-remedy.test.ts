import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeBookingRemedy } from './resource-remedy';
import { adoptPlanChanges } from './plan';
import type { WorkspaceV1 } from './model';

test('confirmed external resource condition is simulated before atomic adoption', () => {
  const ws: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [{ id: 'p', name: '产品', startDate: '2026-11-02', priority: 'high', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-11-05', deadlineType: 'hard', requiredTaskIds: ['t2'], requiredDeliverableIds: [] }], tasks: [{ id: 't1', stageId: 's', title: '测试 A', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }, { id: 't2', stageId: 's', title: '测试 B', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }] }], dependencies: [], resources: [{ id: 'r1', name: '原设备', exclusive: true }, { id: 'r2', name: '确认可用的新设备', exclusive: true }], bookings: [{ id: 'b1', resourceId: 'r1', taskId: 't1', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 2 }, { id: 'b2', resourceId: 'r1', taskId: 't2', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 2 }], planRevisions: [], riskEvents: [] };
  const candidate = proposeBookingRemedy(ws, 'b2', 'r2', '2026-11-02', '2026-10-29');
  assert.equal(candidate.feasible, true);
  assert.equal(ws.bookings[1].resourceId, 'r1');
  const accepted = adoptPlanChanges(ws, candidate.changes, '用户确认新设备', undefined, '2026-10-29');
  assert.equal(accepted.bookings[1].resourceId, 'r2');
  assert.equal(ws.bookings[1].resourceId, 'r1');
});
