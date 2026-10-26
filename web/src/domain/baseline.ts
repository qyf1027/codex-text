import type { BaselineSnapshot, Project } from './model';

export function captureBaseline(project: Project): BaselineSnapshot {
  return {
    projectId: project.id,
    capturedAt: new Date().toISOString(),
    taskDurations: Object.fromEntries(project.tasks.map(task => [task.id, task.standardDurationDays])),
    deliverableOffsets: Object.fromEntries(project.tasks.flatMap(task => task.deliverables.map(item => [item.id, item.standardOffsetDays]))),
    gateTargets: Object.fromEntries(project.gates.map(gate => [gate.id, gate.targetDate])),
  };
}
