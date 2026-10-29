import type { BaselineSnapshot, Project } from './model';
import type { Forecast } from './forecast';
import type { WorkspaceV1 } from './model';

export function captureBaseline(project: Project): BaselineSnapshot {
  return {
    projectId: project.id,
    capturedAt: new Date().toISOString(),
    projectStartDate: project.startDate,
    taskDurations: Object.fromEntries(project.tasks.map(task => [task.id, task.standardDurationDays])),
    taskStartDates: {},
    taskFinishDates: {},
    deliverableOffsets: Object.fromEntries(project.tasks.flatMap(task => task.deliverables.map(item => [item.id, item.standardOffsetDays]))),
    deliverableDates: {},
    gateTargets: Object.fromEntries(project.gates.map(gate => [gate.id, gate.targetDate])),
    gatePredictedDates: {},
  };
}

export function extendBaseline(workspace: WorkspaceV1, forecast: Forecast): void {
  workspace.baselineSnapshots ||= [];
  for (const project of workspace.projects) {
    let baseline = workspace.baselineSnapshots.find(item => item.projectId === project.id);
    if (!baseline) { baseline = captureBaseline(project); workspace.baselineSnapshots.push(baseline); }
    // Older snapshots lack projectStartDate; do not infer old dates from later edits.
    // New entities in an older workspace still get a baseline at creation.
    baseline.taskStartDates ||= {}; baseline.taskFinishDates ||= {}; baseline.deliverableDates ||= {}; baseline.gatePredictedDates ||= {};
    for (const task of project.tasks) {
      const newTask = baseline.taskDurations[task.id] === undefined;
      baseline.taskDurations[task.id] ??= task.standardDurationDays;
      if ((baseline.projectStartDate || newTask) && forecast.tasks[task.id]) { baseline.taskStartDates[task.id] ??= forecast.tasks[task.id].startDate; baseline.taskFinishDates[task.id] ??= forecast.tasks[task.id].finishDate; }
      for (const item of task.deliverables) {
        const newDeliverable = baseline.deliverableOffsets[item.id] === undefined;
        baseline.deliverableOffsets[item.id] ??= item.standardOffsetDays;
        if ((baseline.projectStartDate || newDeliverable) && forecast.deliverables[item.id]) baseline.deliverableDates[item.id] ??= forecast.deliverables[item.id].date;
      }
    }
    for (const gate of project.gates) {
      const newGate = baseline.gateTargets[gate.id] === undefined;
      baseline.gateTargets[gate.id] ??= gate.targetDate;
      if ((baseline.projectStartDate || newGate) && forecast.gates[gate.id]?.date) baseline.gatePredictedDates[gate.id] ??= forecast.gates[gate.id].date!;
    }
  }
}
