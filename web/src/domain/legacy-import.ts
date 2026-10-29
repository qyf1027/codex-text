import { validLocalDate } from './calendar';
import { captureBaseline, extendBaseline } from './baseline';
import { forecastWorkspace } from './forecast';
import type { Project, Task, WorkspaceV1 } from './model';

type LegacyTask = { name: string; phase: string; dependencies?: string[]; flowType?: '串行' | '并行'; standardDuration: number; limitDuration: number; startDate?: string; endDate?: string; actualStartDate?: string; actualEndDate?: string; status?: string; delayDays?: number; remark?: string };
type LegacyProject = { projectName: string; projectStart: string; targetGA: string; tasks: LegacyTask[] };

export function importLegacyProject(workspace: WorkspaceV1, input: unknown): WorkspaceV1 {
  const data = input as LegacyProject;
  if (!data || typeof data !== 'object' || typeof data.projectName !== 'string' || !validLocalDate(data.projectStart) || !validLocalDate(data.targetGA) || !Array.isArray(data.tasks)) throw new Error('旧版项目文件缺少名称、起始日、目标 GA 或任务列表');
  if (!data.projectName.trim()) throw new Error('旧版项目名称为空');
  if (data.tasks.some(task => !task || typeof task.name !== 'string' || !task.name.trim() || typeof task.phase !== 'string' || !Number.isInteger(task.standardDuration) || !Number.isInteger(task.limitDuration) || task.limitDuration < 1 || task.limitDuration > task.standardDuration)) throw new Error('旧版任务字段或工期无效');
  const draft = structuredClone(workspace);
  const stages = [...new Set(data.tasks.map(task => task.phase))].map((name, order) => ({ id: crypto.randomUUID(), name, order }));
  if (!stages.length) stages.push({ id: crypto.randomUUID(), name: 'TR1', order: 0 });
  const stageIds = new Map(stages.map(stage => [stage.name, stage.id]));
  const tasks: Task[] = data.tasks.map(item => ({
    id: crypto.randomUUID(), stageId: stageIds.get(item.phase)!, title: item.name,
    standardDurationDays: item.standardDuration, minimumDurationDays: item.limitDuration,
    status: item.status === '已完成' && item.actualEndDate && validLocalDate(item.actualEndDate) ? 'done' : item.actualStartDate && validLocalDate(item.actualStartDate) ? 'in_progress' : 'not_started',
    actualStartDate: item.actualStartDate && validLocalDate(item.actualStartDate) ? item.actualStartDate : undefined,
    actualFinishDate: item.status === '已完成' && item.actualEndDate && validLocalDate(item.actualEndDate) ? item.actualEndDate : undefined,
    manualDelayWorkdays: Number.isInteger(item.delayDays) && (item.delayDays || 0) > 0 ? item.delayDays : undefined,
    notes: item.remark,
    deliverables: [],
  }));
  const byName = new Map(tasks.map(task => [task.title, task.id]));
  const dependencies = data.tasks.flatMap((item, index) => (item.dependencies || []).map(name => ({ id: crypto.randomUUID(), sourceType: item.flowType === '并行' ? 'task_start' as const : 'task_completion' as const, sourceId: byName.get(name) || `missing:${name}`, sourceNameSnapshot: name, targetType: 'task_start' as const, targetId: tasks[index].id })));
  const gaTask = tasks.find(task => task.title === '上架开售');
  const project: Project = { id: crypto.randomUUID(), name: data.projectName.trim(), startDate: data.projectStart, priority: 'medium', status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stages, tasks, gates: [{ id: crypto.randomUUID(), name: '上市 GA', targetDate: data.targetGA, deadlineType: 'soft', requiredTaskIds: gaTask ? [gaTask.id] : [], requiredDeliverableIds: [] }] };
  draft.projects.push(project);
  draft.dependencies.push(...dependencies);
  draft.baselineSnapshots ||= [];
  const baseline = captureBaseline(project);
  for (let index = 0; index < data.tasks.length; index++) {
    if (data.tasks[index].startDate && validLocalDate(data.tasks[index].startDate!)) baseline.taskStartDates![tasks[index].id] = data.tasks[index].startDate!;
    if (data.tasks[index].endDate && validLocalDate(data.tasks[index].endDate!)) baseline.taskFinishDates![tasks[index].id] = data.tasks[index].endDate!;
  }
  draft.baselineSnapshots.push(baseline);
  extendBaseline(draft, forecastWorkspace(draft, { today: data.projectStart }));
  return draft;
}
