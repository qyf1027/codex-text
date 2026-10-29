import test from 'node:test';
import assert from 'node:assert/strict';
import { importLegacyProject } from './legacy-import';
import { validateWorkspace } from './validation';
import { forecastWorkspace } from './forecast';
import type { WorkspaceV1 } from './model';

test('old project JSON converts tasks and keeps unknown sources repairable', () => {
  const empty: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  const converted = importLegacyProject(empty, { projectName: '旧项目', projectStart: '2026-10-26', targetGA: '2027-01-01', tasks: [{ name: '战略评级', phase: 'charter', dependencies: [], standardDuration: 3, limitDuration: 2, status: '已完成', actualEndDate: '2026-10-28' }, { name: '市场评估', phase: 'charter', dependencies: ['战略评级', '外部成果'], standardDuration: 4, limitDuration: 2 }] });
  assert.equal(validateWorkspace(converted).length, 0);
  assert.equal(converted.projects[0].tasks[0].status, 'done');
  assert.equal(converted.projects[0].tasks[0].actualFinishDate, '2026-10-28');
  assert.equal(converted.projects[0].tasks[0].deliverables.length, 0);
  assert.ok(forecastWorkspace(converted).risks.some(risk => risk.type === 'DEPENDENCY_MISSING'));
});
