import type { Dependency, Project, WorkspaceV1 } from './model';

export type ProjectExport = { schemaVersion: '1.0.0'; exportType: 'project'; project: Project; dependencies: Dependency[] };

export function exportProject(workspace: WorkspaceV1, projectId: string): ProjectExport {
  const project = workspace.projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const targets = new Set(project.tasks.flatMap(task => [task.id, ...task.deliverables.map(item => item.id)]));
  return { schemaVersion: '1.0.0', exportType: 'project', project: structuredClone(project), dependencies: structuredClone(workspace.dependencies.filter(edge => targets.has(edge.targetId))) };
}

export function importProjectIntoWorkspace(workspace: WorkspaceV1, data: ProjectExport): WorkspaceV1 {
  if (data.schemaVersion !== '1.0.0' || data.exportType !== 'project' || !data.project || !Array.isArray(data.dependencies)) throw new Error('项目文件格式无效');
  const draft = structuredClone(workspace);
  const project = structuredClone(data.project);
  const mapping = new Map<string, string>();
  function remap(old: string): string { const next = crypto.randomUUID(); mapping.set(old, next); return next; }
  project.id = remap(project.id);
  for (const stage of project.stages) stage.id = remap(stage.id);
  for (const task of project.tasks) {
    task.id = remap(task.id);
    for (const item of task.deliverables) item.id = remap(item.id);
  }
  for (const gate of project.gates) gate.id = remap(gate.id);
  for (const task of project.tasks) task.stageId = mapping.get(task.stageId) || task.stageId;
  for (const gate of project.gates) {
    if (gate.stageId) gate.stageId = mapping.get(gate.stageId) || gate.stageId;
    gate.requiredTaskIds = gate.requiredTaskIds.map(id => mapping.get(id) || id);
    gate.requiredDeliverableIds = gate.requiredDeliverableIds.map(id => mapping.get(id) || id);
  }
  const dependencies = data.dependencies.map(edge => ({ ...edge, id: crypto.randomUUID(), sourceId: mapping.get(edge.sourceId) || edge.sourceId, targetId: mapping.get(edge.targetId) || edge.targetId }));
  draft.projects.push(project);
  draft.dependencies.push(...dependencies);
  return draft;
}
