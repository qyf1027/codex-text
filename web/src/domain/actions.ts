import type { Deliverable, ImpactDecision, WorkspaceV1 } from './model';
import { validateWorkspace } from './validation';

export function downstreamOf(workspace: WorkspaceV1, sourceId: string): string[] {
  const ownerEdges = workspace.projects.flatMap(project => project.tasks.flatMap(task => task.deliverables.map(item => ({ sourceId: task.id, targetId: item.id }))));
  const edges = [...workspace.dependencies.map(item => ({ sourceId: item.sourceId, targetId: item.targetId })), ...ownerEdges];
  const seen = new Set([sourceId]);
  const queue = [sourceId];
  const result: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) if (edge.sourceId === current && !seen.has(edge.targetId)) {
      seen.add(edge.targetId); queue.push(edge.targetId); result.push(edge.targetId);
    }
  }
  return result;
}

export function dependentProjectIds(workspace: WorkspaceV1, sourceId: string): string[] {
  const targets = new Set(downstreamOf(workspace, sourceId));
  return workspace.projects.filter(project => project.tasks.some(task => targets.has(task.id) || task.deliverables.some(item => targets.has(item.id)))).map(project => project.id);
}

export function projectDeletionImpact(workspace: WorkspaceV1, projectId: string) {
  const project = workspace.projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const owned = new Set(project.tasks.flatMap(task => [task.id, ...task.deliverables.map(item => item.id)]));
  const outgoing = workspace.dependencies.filter(edge => owned.has(edge.sourceId) && !owned.has(edge.targetId));
  return { outgoingCount: outgoing.length, targetProjectIds: [...new Set(outgoing.flatMap(edge => workspace.projects.filter(item => item.tasks.some(task => task.id === edge.targetId || task.deliverables.some(deliverable => deliverable.id === edge.targetId))).map(item => item.id)))] };
}

export function deleteProjectPreservingReferences(workspace: WorkspaceV1, projectId: string): WorkspaceV1 {
  const draft = structuredClone(workspace);
  const project = draft.projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const owned = new Set(project.tasks.flatMap(task => [task.id, ...task.deliverables.map(item => item.id)]));
  draft.projects = draft.projects.filter(item => item.id !== projectId);
  if (draft.currentProjectId === projectId) draft.currentProjectId = draft.projects[0]?.id;
  draft.dependencies = draft.dependencies.filter(edge => !owned.has(edge.targetId));
  draft.bookings = draft.bookings.filter(booking => !owned.has(booking.taskId));
  draft.baselineSnapshots = draft.baselineSnapshots?.filter(item => item.projectId !== projectId);
  draft.auditTrail ||= [];
  draft.auditTrail.push({ id: crypto.randomUUID(), at: new Date().toISOString(), entityType: 'project', entityId: projectId, action: 'delete', previous: project.name, note: '保留其他项目指向本项目的缺失引用' });
  return draft;
}

export function taskDeletionImpact(workspace: WorkspaceV1, taskId: string) {
  const task = workspace.projects.flatMap(project => project.tasks).find(item => item.id === taskId);
  if (!task) throw new Error('任务不存在');
  const owned = new Set([task.id, ...task.deliverables.map(item => item.id)]);
  return { outgoingCount: workspace.dependencies.filter(edge => owned.has(edge.sourceId) && !owned.has(edge.targetId)).length, gateCount: workspace.projects.flatMap(project => project.gates).filter(gate => gate.requiredTaskIds.includes(taskId) || gate.requiredDeliverableIds.some(id => owned.has(id))).length };
}

export function deleteTaskPreservingReferences(workspace: WorkspaceV1, taskId: string): WorkspaceV1 {
  const draft = structuredClone(workspace);
  const owner = draft.projects.find(project => project.tasks.some(task => task.id === taskId));
  const task = owner?.tasks.find(item => item.id === taskId);
  if (!owner || !task) throw new Error('任务不存在');
  const owned = new Set([taskId, ...task.deliverables.map(item => item.id)]);
  owner.tasks = owner.tasks.filter(item => item.id !== taskId);
  draft.dependencies = draft.dependencies.filter(edge => !owned.has(edge.targetId));
  draft.bookings = draft.bookings.filter(booking => booking.taskId !== taskId);
  for (const project of draft.projects) for (const gate of project.gates) {
    gate.requiredTaskIds = gate.requiredTaskIds.filter(id => id !== taskId);
    gate.requiredDeliverableIds = gate.requiredDeliverableIds.filter(id => !owned.has(id));
  }
  draft.auditTrail ||= [];
  draft.auditTrail.push({ id: crypto.randomUUID(), at: new Date().toISOString(), entityType: 'task', entityId: taskId, action: 'delete', previous: task.title, note: '其他任务的来源引用保留为缺失待修复；GA 完成判据中移除此任务' });
  return draft;
}

export function ordinaryVersionUpdate(item: Deliverable, note: string, at = new Date().toISOString()): void {
  if (!note.trim()) throw new Error('请填写版本变更说明');
  const version = { id: crypto.randomUUID(), label: `V${item.versionHistory.length + 1}`, createdAt: at, changeNote: note.trim(), deliveredAt: item.status === 'delivered' ? item.actualDeliveredDate : undefined };
  item.versionHistory.push(version);
  // A non-invalidating edit keeps the accepted effective version stable.
}

export function decideImpact(workspace: WorkspaceV1, sourceDeliverableId: string, targetId: string, decision: ImpactDecision['decision'], note?: string): void {
  if (!downstreamOf(workspace, sourceDeliverableId).includes(targetId)) throw new Error('此对象不在成果的下游');
  workspace.impactDecisions ||= [];
  const previous = workspace.impactDecisions.find(item => item.sourceDeliverableId === sourceDeliverableId && item.targetId === targetId);
  if (previous) { previous.decision = decision; previous.decidedAt = new Date().toISOString(); previous.note = note; }
  else workspace.impactDecisions.push({ id: crypto.randomUUID(), sourceDeliverableId, targetId, decision, decidedAt: new Date().toISOString(), note });
}

export function transferOrdinaryDeliverable(workspace: WorkspaceV1, deliverableId: string, targetTaskId: string): WorkspaceV1 {
  const draft = structuredClone(workspace);
  const tasks = draft.projects.flatMap(project => project.tasks);
  const owner = tasks.find(task => task.deliverables.some(item => item.id === deliverableId));
  const target = tasks.find(task => task.id === targetTaskId);
  if (!owner || !target || owner.id === target.id) throw new Error('请选择其他任务接收成果');
  const item = owner.deliverables.find(entry => entry.id === deliverableId)!;
  if (item.kind !== 'ordinary') throw new Error('必需成果不能直接转移');
  owner.deliverables = owner.deliverables.filter(entry => entry.id !== deliverableId);
  target.deliverables.push(item);
  const issues = validateWorkspace(draft);
  if (issues.length) throw new Error(issues[0]);
  draft.auditTrail ||= [];
  draft.auditTrail.push({ id: crypto.randomUUID(), at: new Date().toISOString(), entityType: 'deliverable', entityId: item.id, action: 'transfer', previous: owner.id, next: target.id });
  return draft;
}
