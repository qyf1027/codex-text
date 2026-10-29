import type { AuditEntry, WorkspaceV1 } from './model';

export function recordAuditChanges(before: WorkspaceV1, after: WorkspaceV1, at = new Date().toISOString()): void {
  after.auditTrail ||= [];
  const append = (entityType: AuditEntry['entityType'], entityId: string, action: string, previous: unknown, next: unknown) => {
    if (previous === next) return;
    after.auditTrail!.push({ id: crypto.randomUUID(), at, entityType, entityId, action, previous: previous == null ? undefined : String(previous), next: next == null ? undefined : String(next) });
  };
  const oldProjects = new Map(before.projects.map(project => [project.id, project]));
  for (const project of after.projects) {
    const previous = oldProjects.get(project.id);
    if (!previous) { append('project', project.id, 'create', undefined, project.name); continue; }
    for (const field of ['name', 'startDate', 'status', 'priority'] as const) append('project', project.id, field, previous[field], project[field]);
    const oldGates = new Map(previous.gates.map(gate => [gate.id, gate]));
    for (const gate of project.gates) {
      const old = oldGates.get(gate.id);
      if (!old) { append('gate', gate.id, 'create', undefined, gate.name); continue; }
      for (const field of ['name', 'targetDate', 'deadlineType', 'actualAchievedDate'] as const) append('gate', gate.id, field, old[field], gate[field]);
    }
    const oldTasks = new Map(previous.tasks.map(task => [task.id, task]));
    const oldDeliverables = new Map(previous.tasks.flatMap(task => task.deliverables.map(item => [item.id, item] as const)));
    for (const task of project.tasks) {
      const old = oldTasks.get(task.id);
      if (!old) append('task', task.id, 'create', undefined, task.title);
      else for (const field of ['title', 'stageId', 'status', 'standardDurationDays', 'minimumDurationDays', 'actualStartDate', 'actualFinishDate', 'remainingWorkdays', 'manualDelayWorkdays'] as const) append('task', task.id, field, old[field], task[field]);
      for (const item of task.deliverables) {
        const prior = oldDeliverables.get(item.id);
        if (!prior) { append('deliverable', item.id, 'create', undefined, item.name); continue; }
        for (const field of ['name', 'status', 'kind', 'standardOffsetDays', 'earliestOffsetDays', 'actualDeliveredDate', 'currentVersionId', 'invalidationReason', 'cancellationReason'] as const) append('deliverable', item.id, field, prior[field], item[field]);
        if (item.versionHistory.length > prior.versionHistory.length) append('deliverable', item.id, 'versionUpdate', prior.versionHistory.at(-1)?.label, item.versionHistory.at(-1)?.label);
      }
    }
  }
  const priorBookings = new Map(before.bookings.map(item => [item.id, item]));
  for (const booking of after.bookings) {
    const prior = priorBookings.get(booking.id);
    if (!prior) { append('booking', booking.id, 'create', undefined, booking.taskId); continue; }
    for (const field of ['resourceId', 'fixedStartDate', 'offsetDays', 'durationWorkdays'] as const) append('booking', booking.id, field, prior[field], booking[field]);
    if (JSON.stringify(prior.actualOccupiedDates || []) !== JSON.stringify(booking.actualOccupiedDates || [])) append('booking', booking.id, 'actualOccupiedDates', JSON.stringify(prior.actualOccupiedDates || []), JSON.stringify(booking.actualOccupiedDates || []));
  }
}
