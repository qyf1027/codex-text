export type LocalDate = string;
export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'cancelled';
export type DeliverableStatus = 'pending' | 'delivered' | 'invalidated' | 'cancelled';

export type DeliverableVersion = { id: string; label: string; createdAt: string; deliveredAt?: LocalDate; invalidatedAt?: string; changeNote?: string };
export type Deliverable = {
  id: string; name: string; kind: 'required' | 'ordinary'; standardOffsetDays: number; earliestOffsetDays?: number;
  status: DeliverableStatus; actualDeliveredDate?: LocalDate; currentVersionId?: string; versionHistory: DeliverableVersion[];
  invalidationReason?: string;
};
export type Task = {
  id: string; stageId: string; title: string; status: TaskStatus; standardDurationDays: number; minimumDurationDays: number;
  actualStartDate?: LocalDate; actualFinishDate?: LocalDate; remainingWorkdays?: number; manualDelayWorkdays?: number;
  description?: string; ownerNote?: string; notes?: string; deliverables: Deliverable[];
};
export type Gate = { id: string; name: string; stageId?: string; targetDate: LocalDate; deadlineType: 'soft' | 'hard'; requiredTaskIds: string[]; requiredDeliverableIds: string[]; actualAchievedDate?: LocalDate };
export type Stage = { id: string; name: string; order: number };
export type Project = { id: string; name: string; startDate: LocalDate; priority: 'high' | 'medium' | 'low'; status: 'active' | 'archived'; description?: string; stages: Stage[]; gates: Gate[]; tasks: Task[] };
export type Dependency = { id: string; sourceType: 'deliverable' | 'task_completion' | 'task_start'; sourceId: string; targetType: 'task_start' | 'deliverable'; targetId: string; acceptedSourceVersionId?: string; sourceNameSnapshot?: string };
export type Resource = { id: string; name: string; exclusive: true; note?: string };
export type Booking = { id: string; resourceId: string; taskId: string; anchor: 'task_relative' | 'fixed_date'; offsetDays?: number; fixedStartDate?: LocalDate; durationWorkdays: number; actualOccupiedDates?: LocalDate[] };
export type PlanChange = { kind: 'task_duration' | 'deliverable_offset' | 'booking_date' | 'task_start'; entityId: string; previous: number | string; proposed: number | string };
export type PlanRevision = { id: string; createdAt: string; affectedProjectIds: string[]; changes: PlanChange[]; note?: string; basedOnRevisionId?: string; adoptedByUser: true; acceptedGateDates?: Record<string, LocalDate> };
export type RiskType = 'GA_DELAY' | 'HARD_DEADLINE' | 'DEPENDENCY_UNMET' | 'DELIVERABLE_INVALID' | 'DEPENDENCY_MISSING' | 'RESOURCE_CONFLICT' | 'ACCEPTED_PLAN_CONFLICT' | 'INCOMPLETE_INPUT';
export type RiskEvent = { id: string; type: RiskType; sourceId: string; firstDetectedAt: string; lastEvaluatedAt: string; state: 'open' | 'mitigated' | 'resolved'; initialSnapshot: string; latestSnapshot: string; resolutionNote?: string };
export type BaselineSnapshot = { projectId: string; capturedAt: string; taskDurations: Record<string, number>; deliverableOffsets: Record<string, number>; gateTargets: Record<string, LocalDate> };
export type WorkspaceV1 = { schemaVersion: 1; id: string; projects: Project[]; dependencies: Dependency[]; resources: Resource[]; bookings: Booking[]; planRevisions: PlanRevision[]; riskEvents: RiskEvent[]; baselineSnapshots?: BaselineSnapshot[] };
