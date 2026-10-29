import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastWorkspace } from './forecast';
import { validateWorkspace } from './validation';
import type { WorkspaceV1 } from './model';

test('10 projects × 100 tasks × 3 outcomes forecast without an unbounded search', () => {
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  for (let projectIndex = 0; projectIndex < 10; projectIndex++) {
    const projectId = `p${projectIndex}`;
    const stageId = `s${projectIndex}`;
    const tasks = Array.from({ length: 100 }, (_, taskIndex) => ({ id: `t${projectIndex}-${taskIndex}`, stageId, title: `任务 ${taskIndex}`, status: 'not_started' as const, standardDurationDays: 2, minimumDurationDays: 1, deliverables: Array.from({ length: 3 }, (_, outcomeIndex) => ({ id: `d${projectIndex}-${taskIndex}-${outcomeIndex}`, name: `成果 ${outcomeIndex}`, kind: outcomeIndex === 0 ? 'required' as const : 'ordinary' as const, status: 'pending' as const, standardOffsetDays: 1, versionHistory: [] })) }));
    workspace.projects.push({ id: projectId, name: projectId, startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: stageId, name: 'TR1', order: 0 }], gates: [{ id: `g${projectIndex}`, name: 'GA', targetDate: '2027-12-31', deadlineType: 'soft', requiredTaskIds: [tasks[99].id], requiredDeliverableIds: [] }], tasks });
    for (let taskIndex = 1; taskIndex < 100; taskIndex++) workspace.dependencies.push({ id: `edge${projectIndex}-${taskIndex}`, sourceType: 'deliverable', sourceId: `d${projectIndex}-${taskIndex - 1}-0`, targetType: 'task_start', targetId: `t${projectIndex}-${taskIndex}` });
  }
  const start = performance.now();
  assert.equal(validateWorkspace(workspace).length, 0);
  const result = forecastWorkspace(workspace);
  assert.equal(Object.keys(result.tasks).length, 1000);
  assert.equal(Object.keys(result.deliverables).length, 3000);
  assert.ok(performance.now() - start < 5000, 'large workspace should finish within 5 seconds in test environment');
});
