import { forecastWorkspace } from './forecast';
import type { PlanChange, WorkspaceV1 } from './model';

export type Proposal = { gateId: string; baselineDate?: string; proposedDate?: string; feasible: boolean; changes: PlanChange[]; reasons: string[] };

export function proposeForGate(workspace: WorkspaceV1, gateId: string): Proposal {
  const project = workspace.projects.find(item => item.gates.some(gate => gate.id === gateId));
  const gate = project?.gates.find(item => item.id === gateId);
  if (!gate) throw new Error('GA 不存在');
  const normal = forecastWorkspace(workspace);
  const baselineDate = normal.gates[gateId]?.date;
  if (!baselineDate) return { gateId, baselineDate, feasible: false, changes: [], reasons: ['缺少可靠的 GA 预测依据'] };
  const ownerByDeliverable = new Map(workspace.projects.flatMap(item => item.tasks.flatMap(task => task.deliverables.map(deliverable => [deliverable.id, task.id] as const))));
  const relevant = new Set<string>();
  function mark(id: string) {
    if (relevant.has(id)) return;
    relevant.add(id);
    const owner = ownerByDeliverable.get(id);
    if (owner) mark(owner);
    for (const edge of workspace.dependencies.filter(item => item.targetId === id)) mark(edge.sourceId);
  }
  [...gate.requiredTaskIds, ...gate.requiredDeliverableIds].forEach(mark);
  const taskDurations: Record<string, number> = {};
  const deliverableOffsets: Record<string, number> = {};
  const reasons: string[] = [];
  let current = normal;
  let simulations = 0;
  let capped = false;
  const allTasks = workspace.projects.flatMap(item => item.tasks);
  outer: for (const task of allTasks) {
    if (current.gates[gateId]?.date && current.gates[gateId].date! <= gate.targetDate) break;
    if (!relevant.has(task.id) || task.status !== 'not_started') continue;
    for (let duration = task.standardDurationDays - 1; duration >= task.minimumDurationDays; duration--) {
      if (simulations >= 120) { capped = true; break outer; }
      taskDurations[task.id] = duration;
      simulations++;
      current = forecastWorkspace(workspace, { taskDurations, deliverableOffsets });
      if (current.gates[gateId]?.date && current.gates[gateId].date! <= gate.targetDate) break;
    }
    for (const item of task.deliverables) {
      if (!relevant.has(item.id) || item.status !== 'pending' || item.earliestOffsetDays === undefined) continue;
      for (let offset = item.standardOffsetDays - 1; offset >= item.earliestOffsetDays; offset--) {
        if (simulations >= 120) { capped = true; break outer; }
        deliverableOffsets[item.id] = offset;
        simulations++;
        current = forecastWorkspace(workspace, { taskDurations, deliverableOffsets });
        if (current.gates[gateId]?.date && current.gates[gateId].date! <= gate.targetDate) break;
      }
    }
  }
  const changes: PlanChange[] = [
    ...Object.entries(taskDurations).map(([entityId, proposed]) => ({ kind: 'task_duration' as const, entityId, previous: allTasks.find(task => task.id === entityId)!.standardDurationDays, proposed })),
    ...Object.entries(deliverableOffsets).map(([entityId, proposed]) => ({ kind: 'deliverable_offset' as const, entityId, previous: allTasks.flatMap(task => task.deliverables).find(item => item.id === entityId)!.standardOffsetDays, proposed })),
  ];
  const proposedDate = current.gates[gateId]?.date;
  const forbidden = current.risks.some(risk => ['RESOURCE_CONFLICT', 'DEPENDENCY_MISSING', 'INCOMPLETE_INPUT'].includes(risk.type));
  const feasible = Boolean(proposedDate && proposedDate <= gate.targetDate && !forbidden);
  if (capped) reasons.push('已达到 120 次候选计算上限；可缩小目标范围或人工调整约束后重算');
  if (!feasible) reasons.push('当前已知约束下无法确保目标日期；需要确认额外资源或调整条件');
  return { gateId, baselineDate, proposedDate, feasible, changes, reasons };
}
