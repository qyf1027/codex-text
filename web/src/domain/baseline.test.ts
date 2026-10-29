import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBaseline, extendBaseline } from './baseline';
import { forecastWorkspace } from './forecast';
import type { WorkspaceV1 } from './model';

test('initial baseline dates and durations survive later edits', () => {
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: 'ws', projects: [{ id: 'p', name: '项目', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-10-30', deadlineType: 'soft', requiredTaskIds: ['t'], requiredDeliverableIds: [] }], tasks: [{ id: 't', stageId: 's', title: '任务', status: 'not_started', standardDurationDays: 3, minimumDurationDays: 1, deliverables: [{ id: 'd', name: '成果', kind: 'ordinary', standardOffsetDays: 2, status: 'pending', versionHistory: [] }] }] }], dependencies: [], resources: [], bookings: [], planRevisions: [], riskEvents: [] };
  workspace.baselineSnapshots = [captureBaseline(workspace.projects[0])];
  extendBaseline(workspace, forecastWorkspace(workspace, { today: '2026-10-25' }));
  const original = structuredClone(workspace.baselineSnapshots[0]);
  workspace.projects[0].tasks[0].standardDurationDays = 5;
  workspace.projects[0].gates[0].targetDate = '2026-11-06';
  extendBaseline(workspace, forecastWorkspace(workspace, { today: '2026-10-25' }));
  assert.deepEqual(workspace.baselineSnapshots[0], original);
  assert.equal(original.taskFinishDates?.t, '2026-10-28');
  assert.equal(original.deliverableDates?.d, '2026-10-27');
});
