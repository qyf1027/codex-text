import { validLocalDate } from './calendar';
import { forecastWorkspace } from './forecast';
import { validateWorkspace } from './validation';
import type { PlanChange, WorkspaceV1 } from './model';

export function mergePlanChanges(previous: PlanChange[], next: PlanChange[]): PlanChange[] {
  const merged = new Map(previous.map(change => [`${change.kind}:${change.entityId}`, change]));
  for (const change of next) {
    const key = `${change.kind}:${change.entityId}`;
    merged.set(key, { ...change, previous: merged.get(key)?.previous ?? change.previous });
  }
  return [...merged.values()];
}

export function planOptions(changes: PlanChange[]) {
  const taskDurations: Record<string, number> = {};
  const deliverableOffsets: Record<string, number> = {};
  const taskStarts: Record<string, string> = {};
  for (const change of changes) {
    if (change.kind === 'task_duration') taskDurations[change.entityId] = Number(change.proposed);
    if (change.kind === 'deliverable_offset') deliverableOffsets[change.entityId] = Number(change.proposed);
    if (change.kind === 'task_start') taskStarts[change.entityId] = String(change.proposed);
  }
  return { taskDurations, deliverableOffsets, taskStarts };
}

export function adoptPlanChanges(workspace: WorkspaceV1, incoming: PlanChange[], note: string, targetGateId?: string, today = new Date().toISOString().slice(0, 10)): WorkspaceV1 {
  if (!incoming.length) throw new Error('候选没有可采纳的变更');
  const draft = structuredClone(workspace);
  const taskById = new Map(draft.projects.flatMap(project => project.tasks.map(task => [task.id, task] as const)));
  const outcomeById = new Map(draft.projects.flatMap(project => project.tasks.flatMap(task => task.deliverables.map(item => [item.id, item] as const))));
  for (const change of incoming) {
    if (change.kind === 'task_duration') {
      const task = taskById.get(change.entityId);
      const duration = Number(change.proposed);
      if (!task || task.status !== 'not_started' || !Number.isInteger(duration) || duration < task.minimumDurationDays || duration > task.standardDurationDays) throw new Error('任务工期候选违反最短工期或实际进度');
    } else if (change.kind === 'deliverable_offset') {
      const item = outcomeById.get(change.entityId);
      const offset = Number(change.proposed);
      if (!item || item.status !== 'pending' || item.earliestOffsetDays === undefined || !Number.isInteger(offset) || offset < item.earliestOffsetDays || offset > item.standardOffsetDays) throw new Error('成果交付候选违反最早交付约束');
    } else if (change.kind === 'task_start') {
      const task = taskById.get(change.entityId);
      if (!task || task.status !== 'not_started' || typeof change.proposed !== 'string' || !validLocalDate(change.proposed) || change.proposed <= today) throw new Error('任务开始候选不能移动已经发生的工作');
    } else if (change.kind === 'booking_date') {
      const booking = draft.bookings.find(item => item.id === change.entityId);
      if (!booking || booking.anchor !== 'fixed_date' || booking.actualOccupiedDates?.length || typeof change.proposed !== 'string' || !validLocalDate(change.proposed) || change.proposed <= today) throw new Error('固定预约候选日期无效或已经发生');
      booking.fixedStartDate = change.proposed;
    } else if (change.kind === 'booking_resource') {
      const booking = draft.bookings.find(item => item.id === change.entityId);
      const resource = draft.resources.find(item => item.id === change.proposed);
      if (!booking || !resource) throw new Error('候选独占资源不存在');
      booking.resourceId = resource.id;
    } else throw new Error('未知的计划变更类型');
  }
  const changes = mergePlanChanges(draft.planRevisions.at(-1)?.changes || [], incoming);
  const options = planOptions(changes);
  const forecast = forecastWorkspace(draft, { ...options, skipAcceptedCheck: true, today });
  for (const change of incoming) if (change.kind === 'task_start' && forecast.tasks[change.entityId]?.startDate !== change.proposed) throw new Error('前置依赖使候选开始日期无法成立');
  if (forecast.risks.some(risk => ['HARD_DEADLINE', 'RESOURCE_CONFLICT', 'INCOMPLETE_INPUT', 'DEPENDENCY_MISSING', 'DELIVERABLE_INVALID'].includes(risk.type))) throw new Error('候选与现有硬约束、资源或依赖冲突');
  if (targetGateId) {
    const gate = draft.projects.flatMap(project => project.gates).find(item => item.id === targetGateId);
    if (!gate || !forecast.gates[targetGateId]?.date || forecast.gates[targetGateId].date! > gate.targetDate) throw new Error('候选不能达到目标 GA');
  }
  const touchedTasks = new Set(incoming.map(change => change.kind === 'booking_date' || change.kind === 'booking_resource' ? draft.bookings.find(item => item.id === change.entityId)?.taskId : change.kind === 'deliverable_offset' ? draft.projects.flatMap(project => project.tasks).find(task => task.deliverables.some(item => item.id === change.entityId))?.id : change.entityId));
  draft.planRevisions.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), affectedProjectIds: draft.projects.filter(project => project.tasks.some(task => touchedTasks.has(task.id))).map(project => project.id), changes, acceptedGateDates: Object.fromEntries(Object.entries(forecast.gates).filter(([, gate]) => gate.date).map(([id, gate]) => [id, gate.date!])), basedOnRevisionId: draft.planRevisions.at(-1)?.id, adoptedByUser: true, note });
  const issues = validateWorkspace(draft);
  if (issues.length) throw new Error(issues[0]);
  return draft;
}
