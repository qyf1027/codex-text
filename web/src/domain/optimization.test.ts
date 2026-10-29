import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeForGate } from './optimization';
import { forecastWorkspace } from './forecast';
import type { WorkspaceV1 } from './model';

test('candidate reduces only adjustable predecessor and leaves baseline unchanged', () => {
  const workspace: WorkspaceV1 = {
    schemaVersion: 1, id: 'ws', resources: [], bookings: [], planRevisions: [], riskEvents: [], dependencies: [
      { id: 'e', sourceType: 'task_completion', sourceId: 'a', targetType: 'task_start', targetId: 'b' },
    ], projects: [{ id: 'p', name: 'P', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], tasks: [
      { id: 'a', stageId: 's', title: 'A', status: 'not_started', standardDurationDays: 5, minimumDurationDays: 3, deliverables: [] },
      { id: 'b', stageId: 's', title: 'B', status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] },
      { id: 'x', stageId: 's', title: 'X', status: 'not_started', standardDurationDays: 8, minimumDurationDays: 1, deliverables: [] },
    ], gates: [{ id: 'g', name: 'GA', targetDate: '2026-10-29', deadlineType: 'soft', requiredTaskIds: ['b'], requiredDeliverableIds: [] }] }],
  };
  const proposal = proposeForGate(workspace, 'g', '2026-10-25');
  assert.deepEqual(proposal.changes.map(change => change.entityId), ['a']);
  assert.equal(proposal.feasible, true);
  assert.equal(workspace.projects[0].tasks[0].standardDurationDays, 5);
});

function outcomeFixture(earliestOffsetDays?: number): WorkspaceV1 {
  return { schemaVersion: 1, id: 'ws', resources: [], bookings: [], planRevisions: [], riskEvents: [], dependencies: [], projects: [{ id: 'p', name: 'P', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's', name: 'TR1', order: 0 }], tasks: [{ id: 't', stageId: 's', title: '开发', status: 'not_started', standardDurationDays: 10, minimumDurationDays: 7, deliverables: [{ id: 'd', name: '样品', kind: 'required', standardOffsetDays: 8, earliestOffsetDays, status: 'pending', versionHistory: [] }] }], gates: [{ id: 'g', name: 'GA', targetDate: '2026-11-03', deadlineType: 'soft', requiredTaskIds: ['t'], requiredDeliverableIds: [] }] }] };
}

test('task and required outcome compress independently within their own limits', () => {
  const workspace = outcomeFixture(6);
  const normal = forecastWorkspace(workspace, { today: '2026-10-25' });
  const proposal = proposeForGate(workspace, 'g', '2026-10-25');
  assert.equal(normal.gates.g.date, '2026-11-06');
  assert.equal(proposal.proposedDate, '2026-11-03');
  assert.equal(proposal.feasible, true);
  assert.deepEqual(proposal.changes.map(change => [change.kind, change.proposed]), [['task_duration', 7], ['deliverable_offset', 7]]);
  assert.equal(workspace.projects[0].tasks[0].deliverables[0].standardOffsetDays, 8);
});

test('outcome without earliest offset is not automatically pulled earlier', () => {
  const workspace = outcomeFixture();
  const proposal = proposeForGate(workspace, 'g', '2026-10-25');
  assert.equal(proposal.feasible, false);
  assert.equal(proposal.changes.some(change => change.kind === 'deliverable_offset'), false);
  assert.ok(proposal.reasons.some(reason => reason.includes('无法确保')));
});

test('optimization proposal does not hide the standard GA delay', () => {
  const workspace = outcomeFixture(6);
  const normal = forecastWorkspace(workspace, { today: '2026-10-25' });
  assert.ok(normal.risks.some(risk => risk.type === 'GA_DELAY'));
  assert.equal(proposeForGate(workspace, 'g', '2026-10-25').feasible, true);
  assert.ok(forecastWorkspace(workspace, { today: '2026-10-25' }).risks.some(risk => risk.type === 'GA_DELAY'));
});
