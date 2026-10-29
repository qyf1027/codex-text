import { addWorkdaysInclusive, nextWorkday, onOrAfterWorkday } from './calendar';
import type { Deliverable, Dependency, Gate, Project, RiskType, Task, WorkspaceV1 } from './model';

export type TaskForecast = { startDate: string; finishDate: string; basis: string[]; blocked: boolean };
export type DeliverableForecast = { date: string; basis: string[]; blocked: boolean };
export type GateForecast = { date?: string; targetDate: string; blocked: boolean };
export type ForecastRisk = { type: RiskType; sourceId: string; detail: string };
export type Forecast = { tasks: Record<string, TaskForecast>; deliverables: Record<string, DeliverableForecast>; gates: Record<string, GateForecast>; risks: ForecastRisk[] };

export type ForecastOptions = { taskDurations?: Record<string, number>; deliverableOffsets?: Record<string, number>; taskStarts?: Record<string, string>; today?: string; skipAcceptedCheck?: boolean };
export function forecastWorkspace(workspace: WorkspaceV1, options: ForecastOptions = {}): Forecast {
  const projects = new Map<string, Project>();
  const tasks = new Map<string, Task>();
  const deliverables = new Map<string, { item: Deliverable; task: Task }>();
  const dependencies = new Map<string, Dependency[]>();
  const bookingsByTask = new Map<string, WorkspaceV1['bookings']>();
  for (const project of workspace.projects) {
    for (const task of project.tasks) {
      tasks.set(task.id, task); projects.set(task.id, project);
      for (const item of task.deliverables) deliverables.set(item.id, { item, task });
    }
  }
  for (const dependency of workspace.dependencies) {
    const list = dependencies.get(dependency.targetId) || [];
    list.push(dependency); dependencies.set(dependency.targetId, list);
  }
  for (const booking of workspace.bookings) {
    const list = bookingsByTask.get(booking.taskId) || [];
    list.push(booking); bookingsByTask.set(booking.taskId, list);
  }
  const result: Forecast = { tasks: {}, deliverables: {}, gates: {}, risks: [] };
  const visiting = new Set<string>();
  const riskKeys = new Set<string>();
  function risk(type: RiskType, sourceId: string, detail: string) {
    const key = `${type}:${sourceId}`;
    if (riskKeys.has(key)) return;
    riskKeys.add(key); result.risks.push({ type, sourceId, detail });
  }
  function sourceDate(dependency: Dependency): { date?: string; blocked: boolean; confirmed?: boolean } {
    if (dependency.sourceType === 'task_completion' || dependency.sourceType === 'task_start') {
      if (!tasks.has(dependency.sourceId)) { risk('DEPENDENCY_MISSING', dependency.targetId, '前置任务缺失'); return { blocked: true }; }
      if (tasks.get(dependency.sourceId)?.status === 'cancelled') { risk('DEPENDENCY_UNMET', dependency.targetId, '前置任务已取消'); return { blocked: true }; }
      const task = getTask(dependency.sourceId);
      return { date: dependency.sourceType === 'task_start' ? task.startDate : task.finishDate, blocked: task.blocked, confirmed: dependency.sourceType === 'task_start' ? Boolean(tasks.get(dependency.sourceId)?.actualStartDate) : tasks.get(dependency.sourceId)?.status === 'done' };
    }
    const source = deliverables.get(dependency.sourceId);
    if (!source) { risk('DEPENDENCY_MISSING', dependency.targetId, '前置成果缺失'); return { blocked: true }; }
    if (source.item.status === 'invalidated' || source.item.status === 'cancelled') {
      risk('DELIVERABLE_INVALID', dependency.targetId, `前置成果「${source.item.name}」已失效或取消`);
      return { blocked: true };
    }
    if ((dependency.acceptedSourceVersionId && dependency.acceptedSourceVersionId !== source.item.currentVersionId) || (!dependency.acceptedSourceVersionId && source.item.versionHistory.some(version => version.invalidatedAt))) {
      risk('DELIVERABLE_INVALID', dependency.targetId, `前置成果「${source.item.name}」已有新版本，需确认是否接纳`);
      return { blocked: true };
    }
    const item = getDeliverable(dependency.sourceId);
    return { date: item.date, blocked: item.blocked, confirmed: source.item.status === 'delivered' };
  }
  function constraints(targetId: string): { date?: string; blocked: boolean; unconfirmed: boolean; basis: string[] } {
    let date: string | undefined;
    let blocked = false;
    let unconfirmed = false;
    const basis: string[] = [];
    for (const dependency of dependencies.get(targetId) || []) {
      const source = sourceDate(dependency);
      unconfirmed ||= !source.confirmed;
      if (source.blocked || !source.date) { blocked = true; continue; }
      const allowed = dependency.sourceType === 'task_start' ? source.date : nextWorkday(source.date);
      if (!date || allowed > date) date = allowed;
      basis.push(`${dependency.sourceId} 于 ${source.date} ${source.confirmed ? '实际满足' : '预计满足，尚未真实满足'}`);
    }
    return { date, blocked, unconfirmed, basis };
  }
  function getTask(id: string): TaskForecast {
    if (result.tasks[id]) return result.tasks[id];
    if (visiting.has(id)) throw new Error('存在循环依赖');
    const task = tasks.get(id); const project = projects.get(id);
    if (!task || !project) throw new Error(`任务 ${id} 缺失`);
    visiting.add(id);
    const upstream = constraints(id);
    const plannedStart = [onOrAfterWorkday(project.startDate), upstream.date, options.taskStarts?.[id], task.status === 'not_started' && options.today ? onOrAfterWorkday(options.today) : undefined].filter(Boolean).sort().at(-1)!;
    const startDate = task.actualStartDate || plannedStart;
    if (task.actualStartDate && upstream.date && task.actualStartDate < upstream.date) risk('DEPENDENCY_UNMET', id, '实际开始早于前置成果可用日');
    if (task.actualStartDate && upstream.blocked) risk('DEPENDENCY_UNMET', id, '实际开始时前置依赖未满足');
    if (task.actualStartDate && upstream.unconfirmed) risk('DEPENDENCY_UNMET', id, '实际已开始，但至少一项前置条件尚未真实满足');
    const baseDuration = task.status === 'in_progress' && task.remainingWorkdays !== undefined
      ? task.remainingWorkdays
      : (options.taskDurations?.[task.id] ?? task.standardDurationDays) + (task.manualDelayWorkdays || 0);
    let finishDate = task.status === 'done' && task.actualFinishDate
      ? task.actualFinishDate
      : task.status === 'in_progress' && task.remainingWorkdays !== undefined
        ? addWorkdaysInclusive(onOrAfterWorkday(options.today || new Date().toISOString().slice(0, 10)), Math.max(1, baseDuration))
        : addWorkdaysInclusive(startDate, Math.max(1, baseDuration));
    if (task.status === 'in_progress' && options.today && finishDate < options.today) finishDate = onOrAfterWorkday(options.today);
    const required = task.deliverables.filter(item => item.kind === 'required');
    let blocked = upstream.blocked;
    for (const item of required) {
      const delivery = getDeliverable(item.id);
      if (task.status !== 'done' && delivery.date > finishDate) finishDate = delivery.date;
      blocked ||= delivery.blocked;
    }
    if (task.status !== 'done' && task.status !== 'cancelled') for (const booking of bookingsByTask.get(id) || []) {
      const bookedStart = booking.anchor === 'fixed_date' ? booking.fixedStartDate : addWorkdaysInclusive(startDate, (booking.offsetDays || 0) + 1);
      if (!bookedStart) { risk('INCOMPLETE_INPUT', booking.id, '资源预约缺少开始日期'); blocked = true; continue; }
      const bookedEnd = addWorkdaysInclusive(bookedStart, booking.durationWorkdays);
      if (booking.anchor === 'fixed_date' && bookedStart < startDate) {
        risk('INCOMPLETE_INPUT', booking.id, `固定资源预约 ${bookedStart} 早于任务可开始日 ${startDate}`);
        blocked = true;
      }
      if (bookedEnd > finishDate) finishDate = bookedEnd;
    }
    const forecast = { startDate, finishDate, basis: upstream.basis, blocked };
    result.tasks[id] = forecast;
    visiting.delete(id);
    return forecast;
  }
  function getDeliverable(id: string): DeliverableForecast {
    if (result.deliverables[id]) return result.deliverables[id];
    const owner = deliverables.get(id);
    if (!owner) throw new Error(`成果 ${id} 缺失`);
    // While the parent task is being forecast, use its start constraints
    // directly so that a required deliverable can constrain its finish.
    const project = projects.get(owner.task.id)!;
    const taskConstraints = constraints(owner.task.id);
    const plannedStart = [onOrAfterWorkday(project.startDate), taskConstraints.date, options.taskStarts?.[owner.task.id], owner.task.status === 'not_started' && options.today ? onOrAfterWorkday(options.today) : undefined].filter(Boolean).sort().at(-1)!;
    const startDate = owner.task.actualStartDate || plannedStart;
    const upstream = constraints(id);
    if (owner.item.actualDeliveredDate && upstream.unconfirmed) risk('DEPENDENCY_UNMET', id, '成果已实际交付，但至少一项前置条件尚未真实满足');
    let date = owner.item.actualDeliveredDate || addWorkdaysInclusive(startDate, options.deliverableOffsets?.[id] ?? owner.item.standardOffsetDays);
    if (upstream.date && upstream.date > date && !owner.item.actualDeliveredDate) date = upstream.date;
    if (owner.item.status === 'pending' && options.today && date < options.today) date = onOrAfterWorkday(options.today);
    const forecast = { date, basis: upstream.basis, blocked: upstream.blocked || taskConstraints.blocked || owner.item.status === 'invalidated' || owner.item.status === 'cancelled' };
    result.deliverables[id] = forecast;
    return forecast;
  }

  for (const id of tasks.keys()) getTask(id);
  for (const id of deliverables.keys()) getDeliverable(id);
  for (const project of workspace.projects) for (const gate of project.gates) {
    const gateDates: string[] = [];
    let blocked = false;
    for (const id of gate.requiredTaskIds) {
      const item = result.tasks[id];
      if (item) { gateDates.push(item.finishDate); blocked ||= item.blocked || tasks.get(id)?.status === 'cancelled'; } else blocked = true;
    }
    for (const id of gate.requiredDeliverableIds) {
      const item = result.deliverables[id];
      if (item) { gateDates.push(item.date); blocked ||= item.blocked; } else blocked = true;
    }
    const date = gate.actualAchievedDate || gateDates.sort().at(-1);
    const gateBlocked = !gate.actualAchievedDate && blocked;
    result.gates[gate.id] = { date: gateBlocked ? undefined : date, targetDate: gate.targetDate, blocked: gateBlocked };
    if (!date || gateBlocked) risk('INCOMPLETE_INPUT', gate.id, 'GA 完成判据缺少可用预测');
    else if (!gate.actualAchievedDate && date > gate.targetDate) risk(gate.deadlineType === 'hard' ? 'HARD_DEADLINE' : 'GA_DELAY', gate.id, `预计 ${date}，目标 ${gate.targetDate}`);
  }
  const occupied = new Map<string, Array<{ bookingId: string; taskId: string; start: string; end: string }>>();
  const today = options.today || new Date().toISOString().slice(0, 10);
  for (const booking of workspace.bookings) {
    const task = tasks.get(booking.taskId);
    const taskForecast = result.tasks[booking.taskId];
    if (!task || !taskForecast || task.status === 'done' || task.status === 'cancelled') continue;
    const start = booking.anchor === 'fixed_date' ? booking.fixedStartDate : addWorkdaysInclusive(taskForecast.startDate, (booking.offsetDays || 0) + 1);
    if (!start) { risk('INCOMPLETE_INPUT', booking.id, '资源预约缺少开始日期'); continue; }
    const end = addWorkdaysInclusive(start, booking.durationWorkdays);
    if (end < today) continue;
    const effectiveStart = start < today ? today : start;
    const list = occupied.get(booking.resourceId) || [];
    for (const other of list) if (effectiveStart <= other.end && other.start <= end && other.taskId !== booking.taskId) {
      risk('RESOURCE_CONFLICT', booking.resourceId, `任务 ${booking.taskId} 与 ${other.taskId} 的独占预约重叠`);
    }
    list.push({ bookingId: booking.id, taskId: booking.taskId, start: effectiveStart, end });
    occupied.set(booking.resourceId, list);
  }
  if (!options.skipAcceptedCheck) {
    const accepted = workspace.planRevisions.at(-1);
    if (accepted?.acceptedGateDates) {
      const taskDurations: Record<string, number> = {};
      const deliverableOffsets: Record<string, number> = {};
      const taskStarts: Record<string, string> = {};
      for (const change of accepted.changes) {
        if (change.kind === 'task_duration') taskDurations[change.entityId] = Number(change.proposed);
        if (change.kind === 'deliverable_offset') deliverableOffsets[change.entityId] = Number(change.proposed);
        if (change.kind === 'task_start') taskStarts[change.entityId] = String(change.proposed);
      }
      const adoptedForecast = forecastWorkspace(workspace, { taskDurations, deliverableOffsets, taskStarts, today: options.today, skipAcceptedCheck: true });
      for (const [gateId, expected] of Object.entries(accepted.acceptedGateDates)) {
        const current = adoptedForecast.gates[gateId]?.date;
        if (!current || current > expected) risk('ACCEPTED_PLAN_CONFLICT', gateId, `已采纳计划预计 ${expected}，当前重算为 ${current || '无法确定'}`);
      }
    }
  }
  return result;
}
