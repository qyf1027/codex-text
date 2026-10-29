import { forecastWorkspace } from './forecast';
import { adoptPlanChanges } from './plan';
import type { ResourceAlternative } from './resource-alternatives';
import type { PlanChange, WorkspaceV1 } from './model';

export function proposeBookingRemedy(workspace: WorkspaceV1, bookingId: string, resourceId: string, date: string, today = new Date().toISOString().slice(0, 10)): ResourceAlternative {
  const booking = workspace.bookings.find(item => item.id === bookingId);
  const resource = workspace.resources.find(item => item.id === resourceId);
  if (!booking || booking.anchor !== 'fixed_date' || !resource) throw new Error('请选择固定日期预约与已确认可用的资源');
  const changes: PlanChange[] = [
    { kind: 'booking_resource', entityId: booking.id, previous: booking.resourceId, proposed: resource.id },
    { kind: 'booking_date', entityId: booking.id, previous: booking.fixedStartDate!, proposed: date },
  ];
  const before = forecastWorkspace(workspace, { today });
  const trial = structuredClone(workspace);
  const trialBooking = trial.bookings.find(item => item.id === bookingId)!;
  trialBooking.resourceId = resourceId;
  trialBooking.fixedStartDate = date;
  let after = before;
  try { after = forecastWorkspace(trial, { today }); } catch { /* invalid date is reported by adoption validation */ }
  const gateImpacts = workspace.projects.flatMap(project => project.gates.map(gate => ({ gateId: gate.id, projectId: project.id, before: before.gates[gate.id]?.date, after: after.gates[gate.id]?.date, target: gate.targetDate, deadlineType: gate.deadlineType })));
  const reasons: string[] = [];
  try { adoptPlanChanges(workspace, changes, '已确认资源条件模拟', undefined, today); }
  catch (cause) { reasons.push(cause instanceof Error ? cause.message : '条件不可行'); }
  return { id: `remedy:${bookingId}:${resourceId}:${date}`, resourceId, title: `${resource.name} · ${date}（用户确认条件）`, changes, gateImpacts, feasible: reasons.length === 0, reasons, onTimeCount: gateImpacts.filter(gate => gate.after && gate.after <= gate.target).length };
}
