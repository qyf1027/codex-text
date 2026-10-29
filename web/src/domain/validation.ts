import { isWorkday, validLocalDate } from './calendar';
import type { WorkspaceV1 } from './model';

export function validateWorkspace(workspace: WorkspaceV1): string[] {
  if (!workspace || typeof workspace !== 'object' || !Array.isArray(workspace.projects) || !Array.isArray(workspace.dependencies) || !Array.isArray(workspace.resources) || !Array.isArray(workspace.bookings) || !Array.isArray(workspace.planRevisions) || !Array.isArray(workspace.riskEvents)) return ['工作区实体结构无效'];
  if (workspace.schemaVersion !== 1 || typeof workspace.id !== 'string' || !workspace.id.trim()) return ['工作区版本或 ID 无效'];
  if (workspace.dependencies.some(item => !item) || workspace.resources.some(item => !item) || workspace.bookings.some(item => !item)) return ['依赖或资源结构无效'];
  if (workspace.planRevisions.some(item => !item || !Array.isArray(item.changes) || !Array.isArray(item.affectedProjectIds)) || workspace.riskEvents.some(item => !item || typeof item.type !== 'string' || typeof item.sourceId !== 'string' || !['open', 'mitigated', 'resolved'].includes(item.state) || typeof item.initialSnapshot !== 'string' || typeof item.latestSnapshot !== 'string')) return ['计划版本或风险历史结构无效'];
  if (workspace.auditTrail && (!Array.isArray(workspace.auditTrail) || workspace.auditTrail.some(item => !item || typeof item.id !== 'string' || typeof item.action !== 'string'))) return ['审计记录结构无效'];
  if (workspace.impactDecisions && (!Array.isArray(workspace.impactDecisions) || workspace.impactDecisions.some(item => !item || !['unaffected', 'accept_risk', 'rework', 'pending'].includes(item.decision)))) return ['影响处理记录结构无效'];
  for (const project of workspace.projects) {
    if (!project || !Array.isArray(project.stages) || !Array.isArray(project.tasks) || !Array.isArray(project.gates)) return ['项目阶段、任务或 GA 列表无效'];
    if (project.stages.some(stage => !stage) || project.gates.some(gate => !gate || !Array.isArray(gate.requiredTaskIds) || !Array.isArray(gate.requiredDeliverableIds)) || project.tasks.some(task => !task || !Array.isArray(task.deliverables) || task.deliverables.some(item => !item || !Array.isArray(item.versionHistory)))) return [`项目 ${project.id} 子项结构无效`];
  }
  const issues: string[] = [];
  const ids = new Set<string>();
  const taskIds = new Set<string>();
  const deliverableIds = new Set<string>();
  const deliverableOwner = new Map<string, string>();
  const requiredDeliverables = new Set<string>();
  function addId(id: string, context: string) {
    if (!id || ids.has(id)) issues.push(`${context} ID 缺失或重复`);
    ids.add(id);
  }
  addId(workspace.id, '工作区');
  if (workspace.currentProjectId && !workspace.projects.some(project => project.id === workspace.currentProjectId)) issues.push('当前项目引用缺失');
  for (const project of workspace.projects) {
    if (!project || !Array.isArray(project.stages) || !Array.isArray(project.tasks) || !Array.isArray(project.gates)) { issues.push('项目阶段、任务或 GA 列表无效'); continue; }
    addId(project.id, '项目');
    if (!project.stages.length) issues.push(`项目 ${project.id} 至少需要一个阶段`);
    if (typeof project.name !== 'string' || !project.name.trim() || !validLocalDate(project.startDate)) issues.push(`项目 ${project.id} 名称或开始日期无效`);
    if (!['high', 'medium', 'low'].includes(project.priority) || !['active', 'archived'].includes(project.status)) issues.push(`项目 ${project.id} 优先级或状态无效`);
    for (const stage of project.stages) { if (!stage || typeof stage.name !== 'string') { issues.push('阶段结构无效'); continue; } addId(stage.id, '阶段'); }
    const stageIds = new Set(project.stages.map(stage => stage.id));
    for (const gate of project.gates) { if (!gate || !Array.isArray(gate.requiredTaskIds) || !Array.isArray(gate.requiredDeliverableIds)) { issues.push('GA 完成判据结构无效'); continue; } addId(gate.id, 'GA'); if (!validLocalDate(gate.targetDate) || gate.actualAchievedDate && !validLocalDate(gate.actualAchievedDate)) issues.push(`GA ${gate.id} 日期无效`); if (!['soft', 'hard'].includes(gate.deadlineType)) issues.push(`GA ${gate.id} 截止类型无效`); if (gate.stageId && !stageIds.has(gate.stageId)) issues.push(`GA ${gate.id} 阶段缺失`); }
    for (const task of project.tasks) {
      if (!task || !Array.isArray(task.deliverables)) { issues.push(`项目 ${project.id} 的任务成果列表无效`); continue; }
      addId(task.id, '任务'); taskIds.add(task.id);
      if (!stageIds.has(task.stageId)) issues.push(`任务 ${task.id} 阶段缺失`);
      if (typeof task.title !== 'string' || !task.title.trim() || !Number.isInteger(task.standardDurationDays) || !Number.isInteger(task.minimumDurationDays) || task.minimumDurationDays < 1 || task.minimumDurationDays > task.standardDurationDays) issues.push(`任务 ${task.id} 工期或名称无效`);
      if (!['not_started', 'in_progress', 'done', 'cancelled'].includes(task.status)) issues.push(`任务 ${task.id} 状态无效`);
      if (task.remainingWorkdays !== undefined && (!Number.isInteger(task.remainingWorkdays) || task.remainingWorkdays < 1) || task.manualDelayWorkdays !== undefined && (!Number.isInteger(task.manualDelayWorkdays) || task.manualDelayWorkdays < 0)) issues.push(`任务 ${task.id} 剩余工期或延期无效`);
      if (task.actualStartDate && !validLocalDate(task.actualStartDate) || task.actualFinishDate && !validLocalDate(task.actualFinishDate) || task.actualStartDate && task.actualFinishDate && task.actualFinishDate < task.actualStartDate) issues.push(`任务 ${task.id} 实际日期无效`);
      if (task.status === 'done' && !task.actualFinishDate) issues.push(`任务 ${task.id} 缺少实际完成日期`);
      if (task.status === 'done' && task.deliverables.some(item => item.kind === 'required' && item.status !== 'delivered' && !(item.status === 'invalidated' && item.versionHistory.some(version => version.deliveredAt)))) issues.push(`任务 ${task.id} 必需成果尚未交付`);
      if (task.status === 'done' && task.deliverables.some(item => item.kind === 'ordinary' && item.status === 'pending')) issues.push(`任务 ${task.id} 普通成果尚未处理`);
      for (const deliverable of task.deliverables) {
        if (!deliverable || !Array.isArray(deliverable.versionHistory)) { issues.push(`任务 ${task.id} 成果版本结构无效`); continue; }
        addId(deliverable.id, '成果'); deliverableIds.add(deliverable.id);
        deliverableOwner.set(deliverable.id, task.id);
        if (deliverable.kind === 'required') requiredDeliverables.add(deliverable.id);
        if (typeof deliverable.name !== 'string' || !deliverable.name.trim() || !Number.isInteger(deliverable.standardOffsetDays) || deliverable.standardOffsetDays < 1 || deliverable.earliestOffsetDays !== undefined && (!Number.isInteger(deliverable.earliestOffsetDays) || deliverable.earliestOffsetDays < 1 || deliverable.earliestOffsetDays > deliverable.standardOffsetDays)) issues.push(`成果 ${deliverable.id} 日期偏移无效`);
        if (!['required', 'ordinary'].includes(deliverable.kind) || !['pending', 'delivered', 'invalidated', 'cancelled'].includes(deliverable.status)) issues.push(`成果 ${deliverable.id} 类别或状态无效`);
        if (deliverable.actualDeliveredDate && !validLocalDate(deliverable.actualDeliveredDate)) issues.push(`成果 ${deliverable.id} 实际日期无效`);
        if (deliverable.versionHistory.some(version => !version || typeof version.id !== 'string' || typeof version.label !== 'string' || version.deliveredAt && !validLocalDate(version.deliveredAt))) issues.push(`成果 ${deliverable.id} 版本记录无效`);
        for (const version of deliverable.versionHistory) if (version && typeof version.id === 'string') addId(version.id, '成果版本');
        if (deliverable.currentVersionId && !deliverable.versionHistory.some(version => version?.id === deliverable.currentVersionId)) issues.push(`成果 ${deliverable.id} 当前版本引用无效`);
        if (deliverable.status === 'delivered' && (!deliverable.currentVersionId || !deliverable.versionHistory.some(version => version.id === deliverable.currentVersionId && version.deliveredAt === deliverable.actualDeliveredDate))) issues.push(`成果 ${deliverable.id} 有效版本无效`);
        if (deliverable.status === 'delivered' && !deliverable.actualDeliveredDate) issues.push(`成果 ${deliverable.id} 缺少实际交付日期`);
        if (deliverable.status === 'invalidated' && !deliverable.invalidationReason?.trim()) issues.push(`成果 ${deliverable.id} 缺少失效原因`);
        if (deliverable.status === 'cancelled' && !deliverable.cancellationReason?.trim()) issues.push(`成果 ${deliverable.id} 缺少取消原因`);
      }
    }
  }
  const edges = new Map<string, string[]>();
  for (const dependency of workspace.dependencies) {
    if (!dependency) { issues.push('依赖结构无效'); continue; }
    addId(dependency.id, '依赖');
    if (!['deliverable', 'task_completion', 'task_start'].includes(dependency.sourceType) || !['task_start', 'deliverable'].includes(dependency.targetType)) issues.push(`依赖 ${dependency.id} 类型无效`);
    const sourceExists = dependency.sourceType === 'deliverable' ? deliverableIds.has(dependency.sourceId) : taskIds.has(dependency.sourceId);
    const targetExists = dependency.targetType === 'deliverable' ? deliverableIds.has(dependency.targetId) : taskIds.has(dependency.targetId);
    if (!targetExists) { issues.push(`依赖 ${dependency.id} 目标缺失`); continue; }
    if (dependency.sourceType === 'task_completion' && dependency.targetType === 'deliverable' && requiredDeliverables.has(dependency.targetId) && deliverableOwner.get(dependency.targetId) === dependency.sourceId) issues.push(`依赖 ${dependency.id} 使任务完成与自身成果形成循环`);
    if (!sourceExists) continue; // Preserve missing source as a repairable risk.
    const list = edges.get(dependency.sourceId) || [];
    list.push(dependency.targetId); edges.set(dependency.sourceId, list);
  }
  const resourceIds = new Set<string>();
  for (const resource of workspace.resources) { addId(resource.id, '资源'); resourceIds.add(resource.id); if (typeof resource.name !== 'string' || !resource.name.trim() || resource.exclusive !== true) issues.push(`资源 ${resource.id} 名称或独占属性无效`); }
  for (const booking of workspace.bookings) {
    addId(booking.id, '预约');
    if (!resourceIds.has(booking.resourceId) || !taskIds.has(booking.taskId) || !Number.isInteger(booking.durationWorkdays) || booking.durationWorkdays < 1 || booking.anchor === 'fixed_date' && (!booking.fixedStartDate || !validLocalDate(booking.fixedStartDate) || !isWorkday(booking.fixedStartDate)) || booking.anchor === 'task_relative' && (!Number.isInteger(booking.offsetDays) || (booking.offsetDays || 0) < 0) || !['fixed_date', 'task_relative'].includes(booking.anchor)) issues.push(`预约 ${booking.id} 引用或日期无效`);
    if (booking.actualOccupiedDates && (!Array.isArray(booking.actualOccupiedDates) || booking.actualOccupiedDates.some(date => !validLocalDate(date)))) issues.push(`预约 ${booking.id} 实际占用日期无效`);
  }
  for (const project of workspace.projects) for (const gate of project.gates) {
    if (!gate || !Array.isArray(gate.requiredTaskIds) || !Array.isArray(gate.requiredDeliverableIds)) continue;
    if (gate.requiredTaskIds.some(id => !taskIds.has(id)) || gate.requiredDeliverableIds.some(id => !deliverableIds.has(id))) issues.push(`GA ${gate.id} 完成判据引用缺失`);
  }
  // Task-to-deliverable ownership edges expose indirect cycles without
  // treating sibling deliverables as ordered relative to one another.
  for (const project of workspace.projects) for (const task of project.tasks) for (const deliverable of task.deliverables) {
    const list = edges.get(task.id) || [];
    list.push(deliverable.id); edges.set(task.id, list);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of edges.get(id) || []) if (visit(target)) return true;
    visiting.delete(id); visited.add(id); return false;
  }
  for (const id of edges.keys()) if (visit(id)) { issues.push('存在循环依赖'); break; }
  return issues;
}
