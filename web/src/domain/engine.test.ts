import test from 'node:test';
import assert from 'node:assert/strict';
import { addWorkdaysInclusive, nextWorkday } from './calendar';
import { forecastWorkspace } from './forecast';
import { validateWorkspace } from './validation';
import type { WorkspaceV1 } from './model';

function fixture(): WorkspaceV1 {
  return {
    schemaVersion: 1,
    id: 'ws',
    projects: [
      { id: 'p1', name: '吹风机', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's1', name: 'TR1', order: 0 }], gates: [], tasks: [
        { id: 't1', stageId: 's1', title: '设计', status: 'not_started', standardDurationDays: 3, minimumDurationDays: 2, deliverables: [
          { id: 'd1', name: '方案', kind: 'required', standardOffsetDays: 2, earliestOffsetDays: 1, status: 'pending', versionHistory: [] },
          { id: 'd2', name: '清单', kind: 'ordinary', standardOffsetDays: 3, status: 'pending', versionHistory: [] },
        ] },
      ] },
      { id: 'p2', name: '扩香仪', startDate: '2026-10-26', priority: 'medium', status: 'active', stages: [{ id: 's2', name: 'TR1', order: 0 }], gates: [], tasks: [
        { id: 't2', stageId: 's2', title: '打样', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] },
      ] },
    ],
    dependencies: [{ id: 'dep1', sourceType: 'deliverable', sourceId: 'd1', targetType: 'task_start', targetId: 't2' }],
    resources: [], bookings: [], planRevisions: [], riskEvents: [],
  };
}

test('inclusive dates and next workday match PRD AT-01/02', () => {
  assert.equal(addWorkdaysInclusive('2026-10-26', 3), '2026-10-28');
  assert.equal(nextWorkday('2026-10-30'), '2026-11-02');
});

test('cross project deliverable moves dependent task without moving sibling deliverable', () => {
  const workspace = fixture();
  const first = forecastWorkspace(workspace);
  assert.equal(first.tasks.t2.startDate, '2026-10-28');
  assert.equal(first.deliverables.d2.date, '2026-10-28');
  workspace.projects[0].tasks[0].deliverables[0].standardOffsetDays = 3;
  const moved = forecastWorkspace(workspace);
  assert.equal(moved.tasks.t2.startDate, '2026-10-29');
  assert.equal(moved.deliverables.d2.date, '2026-10-28');
});

test('cross project cycles are rejected', () => {
  const workspace = fixture();
  workspace.dependencies.push({ id: 'dep2', sourceType: 'task_completion', sourceId: 't2', targetType: 'task_start', targetId: 't1' });
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('循环')));
});

test('actual early start is retained and reported as dependency risk', () => {
  const workspace = fixture();
  workspace.projects[1].tasks[0].status = 'in_progress';
  workspace.projects[1].tasks[0].actualStartDate = '2026-10-26';
  const result = forecastWorkspace(workspace);
  assert.equal(result.tasks.t2.startDate, '2026-10-26');
  assert.ok(result.risks.some(risk => risk.type === 'DEPENDENCY_UNMET' && risk.sourceId === 't2'));
});

test('legacy parallel start link may begin with its predecessor', () => {
  const workspace = fixture();
  workspace.projects[0].tasks[0].actualStartDate = '2026-10-28';
  workspace.dependencies[0] = { id: 'dep1', sourceType: 'task_start', sourceId: 't1', targetType: 'task_start', targetId: 't2' };
  assert.equal(forecastWorkspace(workspace).tasks.t2.startDate, '2026-10-28');
});

test('task cannot be confirmed done without actual date and required delivery', () => {
  const workspace = fixture();
  workspace.projects[0].tasks[0].status = 'done';
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('实际完成')));
  workspace.projects[0].tasks[0].actualFinishDate = '2026-10-28';
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('必需成果')));
});

test('same exclusive resource booking conflicts only on occupied days', () => {
  const workspace = fixture();
  workspace.resources.push({ id: 'r1', name: '测试设备', exclusive: true });
  workspace.bookings.push(
    { id: 'b1', resourceId: 'r1', taskId: 't1', anchor: 'fixed_date', fixedStartDate: '2026-10-26', durationWorkdays: 2 },
    { id: 'b2', resourceId: 'r1', taskId: 't2', anchor: 'fixed_date', fixedStartDate: '2026-10-27', durationWorkdays: 1 },
  );
  assert.ok(forecastWorkspace(workspace).risks.some(risk => risk.type === 'RESOURCE_CONFLICT'));
  workspace.bookings[1].fixedStartDate = '2026-10-28';
  assert.equal(forecastWorkspace(workspace).risks.filter(risk => risk.type === 'RESOURCE_CONFLICT').length, 0);
});

test('invalid resource booking is rejected before storage', () => {
  const workspace = fixture();
  workspace.resources.push({ id: 'r1', name: '测试设备', exclusive: true });
  workspace.bookings.push({ id: 'b1', resourceId: 'r1', taskId: 'missing', anchor: 'fixed_date', fixedStartDate: '2026-10-26', durationWorkdays: 0 });
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('预约')));
});

test('new deliverable version does not silently replace the accepted source version', () => {
  const workspace = fixture();
  const source = workspace.projects[0].tasks[0].deliverables[0];
  source.status = 'delivered'; source.currentVersionId = 'v2'; source.actualDeliveredDate = '2026-10-28';
  source.versionHistory = [{ id: 'v1', label: 'V1', createdAt: '2026-10-26T00:00:00Z', deliveredAt: '2026-10-27' }, { id: 'v2', label: 'V2', createdAt: '2026-10-28T00:00:00Z', deliveredAt: '2026-10-28' }];
  workspace.dependencies[0].acceptedSourceVersionId = 'v1';
  const result = forecastWorkspace(workspace);
  assert.equal(result.tasks.t2.blocked, true);
  assert.ok(result.risks.some(risk => risk.type === 'DELIVERABLE_INVALID'));
});

test('delivered and invalidated outcomes require their factual fields', () => {
  const workspace = fixture();
  const item = workspace.projects[0].tasks[0].deliverables[0];
  item.status = 'delivered';
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('交付日期')));
  item.actualDeliveredDate = '2026-10-28'; item.status = 'invalidated';
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('失效原因')));
});

test('cancelled predecessor cannot satisfy downstream task', () => {
  const workspace = fixture();
  workspace.dependencies[0] = { id: 'dep1', sourceType: 'task_completion', sourceId: 't1', targetType: 'task_start', targetId: 't2' };
  workspace.projects[0].tasks[0].status = 'cancelled';
  assert.equal(forecastWorkspace(workspace).tasks.t2.blocked, true);
});

test('upstream change flags conflict without overwriting accepted gate date', () => {
  const workspace = fixture();
  workspace.projects[1].gates.push({ id: 'g2', name: 'GA', targetDate: '2026-11-10', deadlineType: 'soft', requiredTaskIds: ['t2'], requiredDeliverableIds: [] });
  workspace.planRevisions.push({ id: 'plan1', createdAt: '2026-10-26T00:00:00Z', affectedProjectIds: ['p2'], changes: [], adoptedByUser: true, acceptedGateDates: { g2: '2026-10-29' } });
  workspace.projects[0].tasks[0].deliverables[0].standardOffsetDays = 3;
  const result = forecastWorkspace(workspace);
  assert.equal(workspace.planRevisions[0].acceptedGateDates?.g2, '2026-10-29');
  assert.ok(result.risks.some(risk => risk.type === 'ACCEPTED_PLAN_CONFLICT'));
});

test('task stage reference must exist in its project', () => {
  const workspace = fixture();
  workspace.projects[0].tasks[0].stageId = 'missing-stage';
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('阶段')));
});

test('a deliverable dependency delays only its selected target', () => {
  const workspace = fixture();
  workspace.dependencies = [{ id: 'dep1', sourceType: 'deliverable', sourceId: 'd1', targetType: 'deliverable', targetId: 'd2' }];
  workspace.projects[0].tasks[0].deliverables[0].standardOffsetDays = 4;
  const result = forecastWorkspace(workspace);
  assert.equal(result.deliverables.d2.date, '2026-10-30');
  assert.equal(result.tasks.t2.startDate, '2026-10-26');
});

test('remaining work and manual delay are validated and forecast separately', () => {
  const workspace = fixture();
  const task = workspace.projects[0].tasks[0];
  task.manualDelayWorkdays = 2;
  assert.equal(forecastWorkspace(workspace).tasks.t1.finishDate, '2026-10-30');
  task.status = 'in_progress';
  task.remainingWorkdays = 2;
  assert.equal(forecastWorkspace(workspace, { today: '2026-11-02' }).tasks.t1.finishDate, '2026-11-03');
  task.remainingWorkdays = -1;
  assert.ok(validateWorkspace(workspace).some(issue => issue.includes('剩余工期')));
});

test('confirmed actual GA date overrides blocked forecast and prediction risk', () => {
  const workspace = fixture();
  workspace.projects[1].gates.push({ id: 'g2', name: 'GA', targetDate: '2026-10-27', deadlineType: 'hard', requiredTaskIds: ['t2'], requiredDeliverableIds: [], actualAchievedDate: '2026-10-27' });
  workspace.projects[0].tasks[0].deliverables[0].status = 'invalidated';
  workspace.projects[0].tasks[0].deliverables[0].invalidationReason = '重新评估';
  const result = forecastWorkspace(workspace);
  assert.equal(result.gates.g2.date, '2026-10-27');
  assert.equal(result.gates.g2.blocked, false);
  assert.equal(result.risks.filter(risk => risk.sourceId === 'g2').length, 0);
});
