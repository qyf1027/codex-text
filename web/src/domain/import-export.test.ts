import test from 'node:test';
import assert from 'node:assert/strict';
import { exportProject, importProjectIntoWorkspace } from './import-export';
import { validateWorkspace } from './validation';
import { forecastWorkspace } from './forecast';
import type { Project, WorkspaceV1 } from './model';

test('single project import preserves missing external source as a repairable risk', () => {
  const project: Project = { id: 'p', name: 'B', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [], tasks: [{ id: 't', stageId: 's', title: '后续任务', status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] }] };
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  const imported = importProjectIntoWorkspace(workspace, { schemaVersion: '1.0.0', exportType: 'project', project, dependencies: [{ id: 'dep', sourceType: 'deliverable', sourceId: 'external', targetType: 'task_start', targetId: 't', sourceNameSnapshot: '上游方案' }] });
  assert.equal(imported.projects.length, 1);
  assert.equal(validateWorkspace(imported).length, 0);
  assert.ok(forecastWorkspace(imported).risks.some(risk => risk.type === 'DEPENDENCY_MISSING'));
});

test('re-importing a project remaps outcome and version identifiers consistently', () => {
  const project: Project = { id: 'p', name: '原项目', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [], tasks: [{ id: 't', stageId: 's', title: '任务', status: 'done', standardDurationDays: 1, minimumDurationDays: 1, actualFinishDate: '2026-10-26', deliverables: [{ id: 'd', name: '成果', kind: 'required', standardOffsetDays: 1, status: 'delivered', actualDeliveredDate: '2026-10-26', currentVersionId: 'v', versionHistory: [{ id: 'v', label: 'V1', createdAt: '2026-10-26T00:00:00Z', deliveredAt: '2026-10-26' }] }] }] };
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [project], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  const imported = importProjectIntoWorkspace(workspace, exportProject(workspace, 'p'));
  const copy = imported.projects[1].tasks[0].deliverables[0];
  assert.notEqual(copy.id, 'd');
  assert.notEqual(copy.currentVersionId, 'v');
  assert.equal(copy.versionHistory[0].id, copy.currentVersionId);
  assert.equal(validateWorkspace(imported).length, 0);
});

test('single project export and import preserves its resource bookings and independent plan history', () => {
  const project: Project = { id: 'p', name: '设备项目', startDate: '2026-11-02', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-11-06', deadlineType: 'soft', requiredTaskIds: ['t'], requiredDeliverableIds: [] }], tasks: [{ id: 't', stageId: 's', title: '测试', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }] };
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [project], dependencies: [], resources: [{ id: 'r', name: '设备', exclusive: true }], bookings: [{ id: 'b', resourceId: 'r', taskId: 't', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 2 }], planRevisions: [{ id: 'rev', createdAt: '2026-10-29T00:00:00Z', affectedProjectIds: ['p'], changes: [{ kind: 'task_duration', entityId: 't', previous: 2, proposed: 1 }], adoptedByUser: true, acceptedGateDates: { g: '2026-11-03' } }], riskEvents: [] };
  const exported = exportProject(workspace, 'p');
  assert.equal(exported.id, 'p');
  assert.ok(exported.exportedAt);
  const imported = importProjectIntoWorkspace(workspace, exported);
  assert.equal(imported.resources.length, 2);
  assert.equal(imported.bookings.length, 2);
  assert.equal(imported.planRevisions.length, 2);
  const copiedTask = imported.projects[1].tasks[0];
  assert.equal(imported.bookings[1].taskId, copiedTask.id);
  assert.equal(imported.planRevisions[1].changes.at(-1)?.entityId, copiedTask.id);
  assert.equal(validateWorkspace(imported).length, 0);
});
