import { addWorkdaysInclusive, nextWorkday } from './calendar';
import { forecastWorkspace } from './forecast';
import type { WorkspaceV1 } from './model';

export type ResourceShift = { bookingId: string; resourceId: string; oldDate: string; newDate: string; feasible: boolean; affectedTaskId: string; oldTaskStart: string; newTaskStart: string };

export function proposeResourceShift(workspace: WorkspaceV1, resourceId: string): ResourceShift | null {
  const bookings = workspace.bookings.filter(item => item.resourceId === resourceId && item.anchor === 'fixed_date' && item.fixedStartDate)
    .sort((a, b) => a.fixedStartDate!.localeCompare(b.fixedStartDate!));
  for (let index = 0; index < bookings.length; index++) for (let next = index + 1; next < bookings.length; next++) {
    const first = bookings[index]; const second = bookings[next];
    if (first.taskId === second.taskId) continue;
    const firstEnd = addWorkdaysInclusive(first.fixedStartDate!, first.durationWorkdays);
    if (second.fixedStartDate! > firstEnd) continue;
    const draft = structuredClone(workspace);
    const moved = draft.bookings.find(item => item.id === second.id)!;
    const oldDate = moved.fixedStartDate!;
    const ownerTask = workspace.projects.flatMap(project => project.tasks).find(task => task.id === moved.taskId);
    const oldTaskStart = forecastWorkspace(workspace).tasks[moved.taskId]?.startDate || oldDate;
    let candidate = nextWorkday(firstEnd);
    for (let attempt = 0; attempt < 30; attempt++) {
      moved.fixedStartDate = candidate;
      const forecast = forecastWorkspace(draft, { taskStarts: { [moved.taskId]: candidate } });
      const conflict = forecast.risks.some(risk => risk.type === 'RESOURCE_CONFLICT' && risk.sourceId === resourceId);
      const deadline = forecast.risks.some(risk => risk.type === 'HARD_DEADLINE' || risk.type === 'INCOMPLETE_INPUT');
      if (!conflict) return { bookingId: moved.id, resourceId, oldDate, newDate: candidate, feasible: !deadline && ownerTask?.status === 'not_started', affectedTaskId: moved.taskId, oldTaskStart, newTaskStart: candidate };
      candidate = nextWorkday(candidate);
    }
    return { bookingId: moved.id, resourceId, oldDate, newDate: candidate, feasible: false, affectedTaskId: moved.taskId, oldTaskStart, newTaskStart: candidate };
  }
  return null;
}
