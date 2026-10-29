import { format, addDays } from 'date-fns';
import { IPD_DATABASE } from '../types';
import type { Project, Task, WorkspaceV1 } from './model';
import { captureBaseline, extendBaseline } from './baseline';
import { forecastWorkspace } from './forecast';

export function createDefaultWorkspace(): WorkspaceV1 {
  const now = new Date();
  const startDate = format(now, 'yyyy-MM-dd');
  const targetDate = format(addDays(now, 200), 'yyyy-MM-dd');
  const projectId = crypto.randomUUID();
  const stages = [...new Set(IPD_DATABASE.map(node => node.phase))].map((name, order) => ({ id: crypto.randomUUID(), name, order }));
  const stageId = new Map(stages.map(stage => [stage.name, stage.id]));
  const tasks: Task[] = IPD_DATABASE.map(node => ({
    id: crypto.randomUUID(), stageId: stageId.get(node.phase)!, title: node.name,
    status: 'not_started', standardDurationDays: node.standardDuration, minimumDurationDays: node.limitDuration,
    deliverables: [],
  }));
  const idByName = new Map(tasks.map(task => [task.title, task.id]));
  const dependencies = IPD_DATABASE.flatMap((node, index) => node.dependencies
    .filter(name => idByName.has(name))
    .map(name => ({ id: crypto.randomUUID(), sourceType: node.flowType === '并行' ? 'task_start' as const : 'task_completion' as const, sourceId: idByName.get(name)!, targetType: 'task_start' as const, targetId: tasks[index].id })));
  const gaTask = tasks.find(task => task.title === '上架开售');
  const project: Project = {
    id: projectId, name: '项目管理', startDate, priority: 'medium', status: 'active', createdAt: now.toISOString(), updatedAt: now.toISOString(), stages, tasks,
    gates: gaTask ? [{ id: crypto.randomUUID(), name: '上市 GA', targetDate, deadlineType: 'soft', requiredTaskIds: [gaTask.id], requiredDeliverableIds: [] }] : [],
  };
  const workspace: WorkspaceV1 = { schemaVersion: 1, id: crypto.randomUUID(), currentProjectId: projectId, projects: [project], dependencies, resources: [], bookings: [], planRevisions: [], riskEvents: [], baselineSnapshots: [captureBaseline(project)] };
  extendBaseline(workspace, forecastWorkspace(workspace, { today: startDate }));
  return workspace;
}
