import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptPlanChanges } from './plan';
import type { WorkspaceV1 } from './model';

function fixture(): WorkspaceV1 {
  return { schemaVersion: 1, id: 'ws', projects: [{ id: 'p', name: '产品', startDate: '2026-11-02', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-11-04', deadlineType: 'hard', requiredTaskIds: ['t'], requiredDeliverableIds: [] }], tasks: [{ id: 't', stageId: 's', title: '设计', status: 'not_started', standardDurationDays: 3, minimumDurationDays: 2, deliverables: [{ id: 'd', name: '方案', kind: 'required', standardOffsetDays: 3, earliestOffsetDays: 2, status: 'pending', versionHistory: [] }] }] }], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
}

test('atomic adoption keeps baseline and actual separate and creates a revision', () => {
  const ws = fixture();
  const accepted = adoptPlanChanges(ws, [{ kind: 'task_duration', entityId: 't', previous: 3, proposed: 2 }], '压缩设计', 'g', '2026-10-29');
  assert.equal(ws.planRevisions.length, 0);
  assert.equal(accepted.projects[0].tasks[0].standardDurationDays, 3);
  assert.equal(accepted.planRevisions.length, 1);
  assert.equal(accepted.planRevisions[0].changes[0].proposed, 2);
});

test('invalid multi-change adoption rolls back all booking and task edits', () => {
  const ws = fixture();
  ws.resources.push({ id: 'r', name: '设备', exclusive: true });
  ws.bookings.push({ id: 'b', resourceId: 'r', taskId: 't', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 1 });
  assert.throws(() => adoptPlanChanges(ws, [{ kind: 'booking_date', entityId: 'b', previous: '2026-11-02', proposed: '2026-11-03' }, { kind: 'task_duration', entityId: 't', previous: 3, proposed: 1 }], '不可行', 'g', '2026-10-29'), /最短工期/);
  assert.equal(ws.bookings[0].fixedStartDate, '2026-11-02');
  assert.equal(ws.planRevisions.length, 0);
});

test('candidate cannot be called feasible if it breaks hard GA', () => {
  const ws = fixture();
  assert.throws(() => adoptPlanChanges(ws, [{ kind: 'task_start', entityId: 't', previous: '2026-11-02', proposed: '2026-11-05' }], '延后', undefined, '2026-10-29'), /硬约束/);
});

test('a booking with recorded actual occupancy cannot be moved by a candidate', () => {
  const ws = fixture();
  ws.resources.push({ id: 'r', name: '设备', exclusive: true });
  ws.bookings.push({ id: 'b', resourceId: 'r', taskId: 't', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 1, actualOccupiedDates: ['2026-11-02'] });
  assert.throws(() => adoptPlanChanges(ws, [{ kind: 'booking_date', entityId: 'b', previous: '2026-11-02', proposed: '2026-11-03' }], '移动', undefined, '2026-10-29'), /已经发生/);
  assert.equal(ws.bookings[0].fixedStartDate, '2026-11-02');
});
