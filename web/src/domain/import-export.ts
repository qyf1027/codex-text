import type { BaselineSnapshot, Booking, Dependency, PlanRevision, Project, Resource, RiskEvent, WorkspaceV1 } from './model';
import { mergePlanChanges } from './plan';

export type ProjectExport = { schemaVersion: '1.0.0'; exportType: 'project'; id?: string; exportedAt?: string; project: Project; dependencies: Dependency[]; resources?: Resource[]; bookings?: Booking[]; planRevisions?: PlanRevision[]; riskEvents?: RiskEvent[]; baselineSnapshot?: BaselineSnapshot };

export function exportProject(workspace: WorkspaceV1, projectId: string): ProjectExport {
  const project = workspace.projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const targets = new Set(project.tasks.flatMap(task => [task.id, ...task.deliverables.map(item => item.id)]));
  const bookings = workspace.bookings.filter(item => project.tasks.some(task => task.id === item.taskId));
  const resourceIds = new Set(bookings.map(item => item.resourceId));
  const owned = new Set([...targets, ...project.gates.map(gate => gate.id), ...bookings.map(booking => booking.id), ...resourceIds]);
  const planRevisions = workspace.planRevisions.filter(revision => revision.affectedProjectIds.every(id => id === projectId) && revision.changes.every(change => owned.has(change.entityId)));
  return { schemaVersion: '1.0.0', exportType: 'project', id: project.id, exportedAt: new Date().toISOString(), project: structuredClone(project), dependencies: structuredClone(workspace.dependencies.filter(edge => targets.has(edge.targetId))), resources: structuredClone(workspace.resources.filter(item => resourceIds.has(item.id))), bookings: structuredClone(bookings), planRevisions: structuredClone(planRevisions), riskEvents: structuredClone(workspace.riskEvents.filter(event => owned.has(event.sourceId))), baselineSnapshot: structuredClone(workspace.baselineSnapshots?.find(item => item.projectId === projectId)) };
}

export function importProjectIntoWorkspace(workspace: WorkspaceV1, data: ProjectExport): WorkspaceV1 {
  if (!data || data.schemaVersion !== '1.0.0' || data.exportType !== 'project' || !data.project || !Array.isArray(data.dependencies) || data.resources && !Array.isArray(data.resources) || data.bookings && !Array.isArray(data.bookings) || data.planRevisions && !Array.isArray(data.planRevisions) || data.riskEvents && !Array.isArray(data.riskEvents) || data.id && data.id !== data.project.id) throw new Error('项目文件格式无效');
  const draft = structuredClone(workspace);
  const project = structuredClone(data.project);
  project.createdAt = new Date().toISOString(); project.updatedAt = project.createdAt;
  const mapping = new Map<string, string>();
  function remap(old: string): string { const next = crypto.randomUUID(); mapping.set(old, next); return next; }
  project.id = remap(project.id);
  for (const stage of project.stages) stage.id = remap(stage.id);
  for (const task of project.tasks) {
    task.id = remap(task.id);
    for (const item of task.deliverables) {
      item.id = remap(item.id);
      for (const version of item.versionHistory) version.id = remap(version.id);
      if (item.currentVersionId) item.currentVersionId = mapping.get(item.currentVersionId) || item.currentVersionId;
    }
  }
  for (const gate of project.gates) gate.id = remap(gate.id);
  for (const resource of data.resources || []) remap(resource.id);
  for (const booking of data.bookings || []) remap(booking.id);
  for (const task of project.tasks) task.stageId = mapping.get(task.stageId) || task.stageId;
  for (const gate of project.gates) {
    if (gate.stageId) gate.stageId = mapping.get(gate.stageId) || gate.stageId;
    gate.requiredTaskIds = gate.requiredTaskIds.map(id => mapping.get(id) || id);
    gate.requiredDeliverableIds = gate.requiredDeliverableIds.map(id => mapping.get(id) || id);
  }
  const dependencies = data.dependencies.map(edge => ({ ...edge, id: crypto.randomUUID(), sourceId: mapping.get(edge.sourceId) || edge.sourceId, targetId: mapping.get(edge.targetId) || edge.targetId, acceptedSourceVersionId: edge.acceptedSourceVersionId ? mapping.get(edge.acceptedSourceVersionId) || edge.acceptedSourceVersionId : undefined }));
  const resources = (data.resources || []).map(item => ({ ...item, id: mapping.get(item.id)! }));
  const bookings = (data.bookings || []).map(item => ({ ...item, id: mapping.get(item.id)!, resourceId: mapping.get(item.resourceId) || item.resourceId, taskId: mapping.get(item.taskId) || item.taskId }));
  const planRevisions = (data.planRevisions || []).map(revision => ({ ...revision, id: crypto.randomUUID(), affectedProjectIds: revision.affectedProjectIds.map(id => mapping.get(id) || id), changes: revision.changes.map(change => ({ ...change, entityId: mapping.get(change.entityId) || change.entityId, previous: typeof change.previous === 'string' ? mapping.get(change.previous) || change.previous : change.previous, proposed: typeof change.proposed === 'string' ? mapping.get(change.proposed) || change.proposed : change.proposed })), acceptedGateDates: Object.fromEntries(Object.entries(revision.acceptedGateDates || {}).map(([id, date]) => [mapping.get(id) || id, date])) }));
  const riskEvents = (data.riskEvents || []).map(event => ({ ...event, id: crypto.randomUUID(), sourceId: mapping.get(event.sourceId) || event.sourceId }));
  const baseline = data.baselineSnapshot && { ...structuredClone(data.baselineSnapshot), projectId: project.id, taskDurations: remapKeys(data.baselineSnapshot.taskDurations, mapping), taskStartDates: remapKeys(data.baselineSnapshot.taskStartDates || {}, mapping), taskFinishDates: remapKeys(data.baselineSnapshot.taskFinishDates || {}, mapping), deliverableOffsets: remapKeys(data.baselineSnapshot.deliverableOffsets, mapping), deliverableDates: remapKeys(data.baselineSnapshot.deliverableDates || {}, mapping), gateTargets: remapKeys(data.baselineSnapshot.gateTargets, mapping), gatePredictedDates: remapKeys(data.baselineSnapshot.gatePredictedDates || {}, mapping) };
  draft.projects.push(project);
  draft.dependencies.push(...dependencies);
  draft.resources.push(...resources);
  draft.bookings.push(...bookings);
  for (const revision of planRevisions) {
    revision.basedOnRevisionId = draft.planRevisions.at(-1)?.id;
    revision.changes = mergePlanChanges(draft.planRevisions.at(-1)?.changes || [], revision.changes);
    revision.acceptedGateDates = { ...draft.planRevisions.at(-1)?.acceptedGateDates, ...revision.acceptedGateDates };
    draft.planRevisions.push(revision);
  }
  draft.riskEvents.push(...riskEvents);
  if (baseline) { draft.baselineSnapshots ||= []; draft.baselineSnapshots.push(baseline); }
  return draft;
}

function remapKeys<T>(record: Record<string, T>, mapping: Map<string, string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([id, value]) => [mapping.get(id) || id, value]));
}
