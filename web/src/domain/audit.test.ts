import test from 'node:test';
import assert from 'node:assert/strict';
import { recordAuditChanges } from './audit';
import type { WorkspaceV1 } from './model';

test('actual date correction and GA deadline edit enter audit history', () => {
  const before: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [{ id: 'p', name: '产品', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-11-01', deadlineType: 'soft', requiredTaskIds: [], requiredDeliverableIds: [] }], tasks: [{ id: 't', stageId: 's', title: '任务', status: 'in_progress', standardDurationDays: 2, minimumDurationDays: 1, actualStartDate: '2026-10-26', deliverables: [] }] }], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  const after = structuredClone(before);
  after.projects[0].gates[0].targetDate = '2026-11-02';
  after.projects[0].tasks[0].actualStartDate = '2026-10-27';
  recordAuditChanges(before, after, '2026-10-29T00:00:00Z');
  assert.deepEqual(after.auditTrail?.map(item => item.action), ['targetDate', 'actualStartDate']);
  assert.equal(after.auditTrail?.[1].previous, '2026-10-26');
});
