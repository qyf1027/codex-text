import test from 'node:test';
import assert from 'node:assert/strict';
import { decideImpact, deleteProjectPreservingReferences, deleteTaskPreservingReferences, downstreamOf, ordinaryVersionUpdate, projectDeletionImpact, taskDeletionImpact, transferOrdinaryDeliverable } from './actions';
import { forecastWorkspace } from './forecast';
import { validateWorkspace } from './validation';
import type { WorkspaceV1 } from './model';

function fixture(): WorkspaceV1 {
  return { schemaVersion: 1, id: 'ws', projects: [
    { id: 'a', name: 'A', startDate: '2026-10-26', priority: 'high', status: 'active', stages: [{ id: 'sa', name: 'TR1', order: 0 }], gates: [], tasks: [{ id: 'ta', stageId: 'sa', title: '设计', status: 'done', standardDurationDays: 1, minimumDurationDays: 1, actualFinishDate: '2026-10-26', deliverables: [{ id: 'da', name: '方案', kind: 'required', standardOffsetDays: 1, status: 'delivered', actualDeliveredDate: '2026-10-26', currentVersionId: 'v1', versionHistory: [{ id: 'v1', label: 'V1', createdAt: '2026-10-26T00:00:00Z', deliveredAt: '2026-10-26' }] }] }] },
    { id: 'b', name: 'B', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 'sb', name: 'TR1', order: 0 }], gates: [], tasks: [{ id: 'tb', stageId: 'sb', title: '打样', status: 'in_progress', standardDurationDays: 2, minimumDurationDays: 1, actualStartDate: '2026-10-27', remainingWorkdays: 2, deliverables: [{ id: 'db', name: '样机', kind: 'ordinary', standardOffsetDays: 1, status: 'pending', versionHistory: [] }] }] },
  ], dependencies: [{ id: 'e1', sourceType: 'deliverable', sourceId: 'da', targetType: 'task_start', targetId: 'tb', acceptedSourceVersionId: 'v1' }], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
}

test('ordinary version update preserves effective delivery and accepted dependency', () => {
  const ws = fixture();
  const item = ws.projects[0].tasks[0].deliverables[0];
  ordinaryVersionUpdate(item, '修改了描述');
  assert.equal(item.currentVersionId, 'v1');
  assert.equal(item.status, 'delivered');
  assert.equal(forecastWorkspace(ws).risks.filter(risk => risk.type === 'DELIVERABLE_INVALID').length, 0);
  ws.dependencies[0].acceptedSourceVersionId = undefined;
  assert.equal(forecastWorkspace(ws).risks.filter(risk => risk.type === 'DELIVERABLE_INVALID').length, 0);
});

test('invalidation exposes direct and indirect descendants without changing actual facts', () => {
  const ws = fixture();
  assert.deepEqual(downstreamOf(ws, 'da'), ['tb', 'db']);
  ws.projects[0].tasks[0].deliverables[0].status = 'invalidated';
  ws.projects[0].tasks[0].deliverables[0].invalidationReason = '结构需要重做';
  decideImpact(ws, 'da', 'tb', 'rework', '安排复测');
  assert.equal(ws.impactDecisions?.[0].decision, 'rework');
  assert.equal(ws.projects[1].tasks[0].actualStartDate, '2026-10-27');
  assert.ok(forecastWorkspace(ws).risks.some(risk => risk.type === 'DELIVERABLE_INVALID'));
});

test('project deletion leaves outgoing source as a missing dependency', () => {
  const ws = fixture();
  assert.equal(projectDeletionImpact(ws, 'a').outgoingCount, 1);
  const next = deleteProjectPreservingReferences(ws, 'a');
  assert.equal(next.projects.length, 1);
  assert.equal(next.dependencies[0].sourceId, 'da');
  assert.equal(validateWorkspace(next).length, 0);
  assert.ok(forecastWorkspace(next).risks.some(risk => risk.type === 'DEPENDENCY_MISSING'));
});

test('task deletion preserves downstream source references and removes dangling targets', () => {
  const ws = fixture();
  assert.equal(taskDeletionImpact(ws, 'ta').outgoingCount, 1);
  const next = deleteTaskPreservingReferences(ws, 'ta');
  assert.equal(next.projects[0].tasks.length, 0);
  assert.equal(next.dependencies[0].sourceId, 'da');
  assert.equal(validateWorkspace(next).length, 0);
  assert.ok(forecastWorkspace(next).risks.some(risk => risk.type === 'DEPENDENCY_MISSING'));
});

test('ordinary outcome transfer keeps ID and rejects a newly created cycle', () => {
  const ws = fixture();
  ws.projects[0].tasks.push({ id: 'tc', stageId: 'sa', title: '复核', status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] });
  ws.projects[0].tasks.push({ id: 'td', stageId: 'sa', title: '整理', status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] });
  ws.dependencies.push({ id: 'e2', sourceType: 'deliverable', sourceId: 'db', targetType: 'task_start', targetId: 'tc' });
  const transferred = transferOrdinaryDeliverable(ws, 'db', 'td');
  assert.equal(transferred.projects[0].tasks[2].deliverables[0].id, 'db');
  assert.equal(transferred.dependencies[1].sourceId, 'db');
  assert.equal(ws.projects[1].tasks[0].deliverables[0].id, 'db');
  assert.throws(() => transferOrdinaryDeliverable(ws, 'db', 'tc'), /循环/);
});
