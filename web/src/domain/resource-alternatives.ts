import { addWorkdaysInclusive, nextWorkday, shiftWorkdays } from './calendar';
import { forecastWorkspace } from './forecast';
import type { Booking, PlanChange, WorkspaceV1 } from './model';

export type GateImpact = { gateId: string; projectId: string; before?: string; after?: string; target: string; deadlineType: 'soft' | 'hard' };
export type ResourceAlternative = { id: string; resourceId: string; title: string; changes: PlanChange[]; gateImpacts: GateImpact[]; feasible: boolean; reasons: string[]; onTimeCount: number };

function bookingStart(booking: Booking, taskStarts: Record<string, string>): string | undefined {
  if (booking.anchor === 'fixed_date') return booking.fixedStartDate;
  const taskStart = taskStarts[booking.taskId];
  return taskStart ? shiftWorkdays(taskStart, booking.offsetDays || 0) : undefined;
}

function evaluateMove(workspace: WorkspaceV1, resourceId: string, moved: Booking, other: Booking, desiredBookingDate: string, today: string): ResourceAlternative {
  const original = forecastWorkspace(workspace, { today });
  const task = workspace.projects.flatMap(project => project.tasks).find(item => item.id === moved.taskId)!;
  const project = workspace.projects.find(item => item.tasks.some(task => task.id === moved.taskId))!;
  const draft = structuredClone(workspace);
  const copied = draft.bookings.find(item => item.id === moved.id)!;
  const beforeDate = bookingStart(moved, Object.fromEntries(Object.entries(original.tasks).map(([id, entry]) => [id, entry.startDate])))!;
  const taskStarts: Record<string, string> = {};
  const changes: PlanChange[] = [];
  if (moved.anchor === 'fixed_date') {
    copied.fixedStartDate = desiredBookingDate;
    changes.push({ kind: 'booking_date', entityId: moved.id, previous: beforeDate, proposed: desiredBookingDate });
    // A future fixed appointment may move independently of the task start.
  } else {
    const proposedStart = shiftWorkdays(desiredBookingDate, -(moved.offsetDays || 0));
    taskStarts[moved.taskId] = proposedStart;
    changes.push({ kind: 'task_start', entityId: moved.taskId, previous: original.tasks[moved.taskId].startDate, proposed: proposedStart });
  }
  const after = forecastWorkspace(draft, { taskStarts, today });
  const reasons: string[] = [];
  if (task.status !== 'not_started') reasons.push('任务已开始或结束，不能自动移动已发生的执行记录');
  if (moved.actualOccupiedDates?.length) reasons.push('预约已有真实占用记录，不能移动历史');
  if (desiredBookingDate <= today) reasons.push('候选预约日期不在未来');
  if (after.risks.some(risk => risk.type === 'RESOURCE_CONFLICT' && risk.sourceId === resourceId)) reasons.push('同一独占资源仍有预约重叠');
  if (after.risks.some(risk => risk.type === 'HARD_DEADLINE')) reasons.push('至少一个硬截止不可达');
  if (after.risks.some(risk => ['DEPENDENCY_MISSING', 'INCOMPLETE_INPUT', 'DELIVERABLE_INVALID'].includes(risk.type))) reasons.push('前置成果或 GA 完成判据信息尚不完整');
  if (moved.anchor === 'task_relative' && bookingStart(moved, Object.fromEntries(Object.entries(after.tasks).map(([id, entry]) => [id, entry.startDate]))) !== desiredBookingDate) reasons.push('前置依赖推迟了任务，候选预约日无法成立');
  const gateImpacts = workspace.projects.flatMap(owner => owner.gates.map(gate => ({ gateId: gate.id, projectId: owner.id, before: original.gates[gate.id]?.date, after: after.gates[gate.id]?.date, target: gate.targetDate, deadlineType: gate.deadlineType })));
  const onTimeCount = gateImpacts.filter(gate => gate.after && gate.after <= gate.target).length;
  return { id: `${other.id}->${moved.id}`, resourceId, title: `${project.name} / ${task.title} 调整至 ${desiredBookingDate}`, changes, gateImpacts, feasible: reasons.length === 0, reasons, onTimeCount };
}

export function proposeResourceAlternatives(workspace: WorkspaceV1, resourceId: string, today = new Date().toISOString().slice(0, 10)): ResourceAlternative[] {
  const forecast = forecastWorkspace(workspace, { today });
  const taskStarts = Object.fromEntries(Object.entries(forecast.tasks).map(([id, item]) => [id, item.startDate]));
  const bookings = workspace.bookings.filter(item => item.resourceId === resourceId && item.durationWorkdays > 0).map(item => ({ item, start: bookingStart(item, taskStarts) })).filter((entry): entry is { item: Booking; start: string } => Boolean(entry.start));
  const candidates: ResourceAlternative[] = [];
  for (let index = 0; index < bookings.length; index++) for (let next = index + 1; next < bookings.length; next++) {
    const first = bookings[index], second = bookings[next];
    if (first.item.taskId === second.item.taskId) continue;
    const firstEnd = addWorkdaysInclusive(first.start, first.item.durationWorkdays);
    const secondEnd = addWorkdaysInclusive(second.start, second.item.durationWorkdays);
    if (first.start > secondEnd || second.start > firstEnd) continue;
    candidates.push(evaluateMove(workspace, resourceId, second.item, first.item, nextWorkday(firstEnd), today));
    candidates.push(evaluateMove(workspace, resourceId, first.item, second.item, nextWorkday(secondEnd), today));
    return candidates.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.onTimeCount - a.onTimeCount);
  }
  return [];
}
