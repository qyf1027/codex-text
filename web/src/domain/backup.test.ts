import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspaceBackup, parseWorkspaceBackup } from './backup';
import type { WorkspaceV1 } from './model';

test('full workspace backup restores versions, dependencies, plan revisions, actual facts and risk history exactly', () => {
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [{ id: 'p', name: '产品', startDate: '2026-10-26', priority: 'high', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-11-01', deadlineType: 'soft', requiredTaskIds: ['t'], requiredDeliverableIds: [] }], tasks: [{ id: 't', stageId: 's', title: '设计', status: 'done', standardDurationDays: 2, minimumDurationDays: 1, actualStartDate: '2026-10-26', actualFinishDate: '2026-10-27', deliverables: [{ id: 'd', name: '设计稿', kind: 'required', standardOffsetDays: 1, status: 'delivered', actualDeliveredDate: '2026-10-27', currentVersionId: 'v', versionHistory: [{ id: 'v', label: 'V1', createdAt: '2026-10-27T00:00:00Z', deliveredAt: '2026-10-27' }] }] }] }], dependencies: [{ id: 'e', sourceType: 'deliverable', sourceId: 'd', targetType: 'task_start', targetId: 't2', sourceNameSnapshot: '设计稿' }], resources: [], bookings: [], planRevisions: [{ id: 'r', createdAt: '2026-10-26T00:00:00Z', affectedProjectIds: ['p'], changes: [], adoptedByUser: true, acceptedGateDates: { g: '2026-10-27' } }], riskEvents: [{ id: 'risk', type: 'GA_DELAY', sourceId: 'g', firstDetectedAt: '2026-10-26T00:00:00Z', lastEvaluatedAt: '2026-10-27T00:00:00Z', state: 'resolved', initialSnapshot: '晚 1 天', latestSnapshot: '已恢复' }] };
  // Add the external target as another project to keep the complete backup valid.
  workspace.projects.push({ id: 'p2', name: '下游', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's2', name: 'TR1', order: 0 }], gates: [], tasks: [{ id: 't2', stageId: 's2', title: '打样', status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] }] });
  workspace.currentProjectId = 'p2';
  const backup = makeWorkspaceBackup(workspace, '2026-10-29T00:00:00Z');
  const restored = parseWorkspaceBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(restored, workspace);
});

test('damaged and unsupported backup is rejected before replacing current data', () => {
  assert.throws(() => parseWorkspaceBackup({ schemaVersion: '0.9.0', exportType: 'workspace' }), /不受支持/);
  assert.throws(() => parseWorkspaceBackup({ schemaVersion: '1.0.0', exportType: 'workspace', workspace: { schemaVersion: 1, projects: [] } }), /校验失败/);
});
