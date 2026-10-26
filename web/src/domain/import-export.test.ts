import test from 'node:test';
import assert from 'node:assert/strict';
import { importProjectIntoWorkspace } from './import-export';
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
