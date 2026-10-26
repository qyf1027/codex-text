import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Download, FileJson, FolderPlus, Layers3, Plus, Save, Workflow, Zap } from 'lucide-react';
import { createDefaultWorkspace } from './domain/migration';
import { loadV1, saveV1 } from './domain/storage';
import { forecastWorkspace, type Forecast } from './domain/forecast';
import { validateWorkspace } from './domain/validation';
import { proposeForGate, type Proposal } from './domain/optimization';
import { exportProject, importProjectIntoWorkspace, type ProjectExport } from './domain/import-export';
import { captureBaseline } from './domain/baseline';
import { proposeResourceShift, type ResourceShift } from './domain/resource-options';
import type { Deliverable, Dependency, PlanChange, Project, RiskEvent, Task, WorkspaceV1 } from './domain/model';

type Tab = 'overview' | 'tasks' | 'dependencies' | 'resources' | 'data';
const dateToday = () => new Date().toLocaleDateString('sv-SE');
const id = () => crypto.randomUUID();
const classes = { input: 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200', button: 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700', secondary: 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50' };
function remedy(type: string): string | null {
  if (type === 'HARD_DEADLINE') return '条件性补救：确认可提前的成果交付、外部测试资源或最短工期后重新模拟；未经确认不能视为达成。';
  if (type === 'RESOURCE_CONFLICT') return '条件性补救：核实是否可错峰预约或增加设备；当前预约尚未自动变更。';
  return null;
}
function mergeChanges(previous: PlanChange[], next: PlanChange[]): PlanChange[] {
  const merged = new Map(previous.map(change => [`${change.kind}:${change.entityId}`, change]));
  next.forEach(change => merged.set(`${change.kind}:${change.entityId}`, change));
  return [...merged.values()];
}
function planOptions(changes: PlanChange[]) {
  const taskDurations: Record<string, number> = {};
  const deliverableOffsets: Record<string, number> = {};
  const taskStarts: Record<string, string> = {};
  for (const change of changes) {
    if (change.kind === 'task_duration') taskDurations[change.entityId] = Number(change.proposed);
    if (change.kind === 'deliverable_offset') deliverableOffsets[change.entityId] = Number(change.proposed);
    if (change.kind === 'task_start') taskStarts[change.entityId] = String(change.proposed);
  }
  return { taskDurations, deliverableOffsets, taskStarts };
}

function reconcileRiskHistory(workspace: WorkspaceV1, forecast: Forecast): RiskEvent[] {
  const now = new Date().toISOString();
  const keys = new Set(forecast.risks.map(risk => `${risk.type}:${risk.sourceId}`));
  const history = workspace.riskEvents.map(event => {
    const current = forecast.risks.find(risk => risk.type === event.type && risk.sourceId === event.sourceId);
    const active = keys.has(`${event.type}:${event.sourceId}`);
    return { ...event, lastEvaluatedAt: now, latestSnapshot: current?.detail || event.latestSnapshot, state: active ? event.state === 'mitigated' ? 'mitigated' as const : 'open' as const : 'resolved' as const };
  });
  for (const risk of forecast.risks) if (!history.some(event => event.type === risk.type && event.sourceId === risk.sourceId && event.state !== 'resolved')) {
    history.push({ id: id(), type: risk.type, sourceId: risk.sourceId, firstDetectedAt: now, lastEvaluatedAt: now, state: 'open', initialSnapshot: risk.detail, latestSnapshot: risk.detail });
  }
  return history;
}

export default function V1App() {
  const [workspace, setWorkspace] = useState<WorkspaceV1 | null>(null);
  const [recoveryData, setRecoveryData] = useState<unknown>(null);
  const [loadError, setLoadError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [saveStatus, setSaveStatus] = useState('正在读取本地数据…');
  const [error, setError] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newTask, setNewTask] = useState('');
  const [newTaskStage, setNewTaskStage] = useState('');
  const [newStage, setNewStage] = useState('');
  const [newGate, setNewGate] = useState('');
  const [newGateTarget, setNewGateTarget] = useState(dateToday());
  const [newGateTask, setNewGateTask] = useState('');
  const [newGateDeadline, setNewGateDeadline] = useState<'soft' | 'hard'>('soft');
  const [dependencyTargetType, setDependencyTargetType] = useState<Dependency['targetType']>('task_start');
  const [newDeliverable, setNewDeliverable] = useState('');
  const [newDeliverableKind, setNewDeliverableKind] = useState<Deliverable['kind']>('required');
  const [deliverableTask, setDeliverableTask] = useState('');
  const [dependencySource, setDependencySource] = useState('');
  const [dependencyTarget, setDependencyTarget] = useState('');
  const [newResource, setNewResource] = useState('');
  const [bookingResource, setBookingResource] = useState('');
  const [bookingTask, setBookingTask] = useState('');
  const [bookingDate, setBookingDate] = useState(dateToday());
  const [bookingDays, setBookingDays] = useState(1);
  const [pendingImport, setPendingImport] = useState<WorkspaceV1 | null>(null);
  const [pendingProjectImport, setPendingProjectImport] = useState<WorkspaceV1 | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [resourceProposal, setResourceProposal] = useState<ResourceShift | null>(null);

  useEffect(() => {
    loadV1().then(saved => {
      if (saved) {
        if (saved.schemaVersion !== 1) { setRecoveryData(saved); setLoadError('本地数据版本不受支持，尚未覆盖原数据'); return; }
        try {
          const issues = validateWorkspace(saved);
          if (issues.length) { setRecoveryData(saved); setLoadError(`本地数据校验失败：${issues[0]}`); return; }
        } catch { setRecoveryData(saved); setLoadError('本地数据结构无法读取'); return; }
      }
      const value = saved?.schemaVersion === 1 ? saved : createDefaultWorkspace();
      value.baselineSnapshots ||= value.projects.map(captureBaseline);
      value.riskEvents = reconcileRiskHistory(value, forecastWorkspace(value));
      setWorkspace(value); setProjectId(value.projects[0]?.id || '');
    }).catch(() => { setLoadError('本地存储读取失败，尚未覆盖原数据。请检查浏览器存储权限后刷新。'); });
  }, []);

  useEffect(() => {
    if (!workspace) return;
    let active = true;
    setSaveStatus('正在保存…');
    saveV1(workspace).then(() => { if (active) setSaveStatus('已保存到此浏览器'); }).catch(() => { if (active) setSaveStatus('保存失败，请导出备份'); });
    return () => { active = false; };
  }, [workspace]);

  const computed = useMemo(() => {
    if (!workspace) return null;
    try { return forecastWorkspace(workspace); } catch (cause) { return { error: cause instanceof Error ? cause.message : '排期计算失败' }; }
  }, [workspace]);
  const forecast = computed && 'tasks' in computed ? computed : null;
  const project = workspace?.projects.find(item => item.id === projectId) || workspace?.projects[0];
  const allTasks = workspace?.projects.flatMap(item => item.tasks.map(task => ({ task, project: item }))) || [];
  const allDeliverables = allTasks.flatMap(({ task, project: owner }) => task.deliverables.map(deliverable => ({ deliverable, task, project: owner })));
  const activeRisks = workspace?.riskEvents.filter(event => event.state !== 'resolved') || [];
  const acceptedForecast = useMemo(() => {
    if (!workspace?.planRevisions.length) return null;
    const latest = workspace.planRevisions.at(-1)!;
    try { return forecastWorkspace(workspace, planOptions(latest.changes)); } catch { return null; }
  }, [workspace]);

  function change(mutator: (draft: WorkspaceV1) => void): boolean {
    if (!workspace) return false;
    const draft: WorkspaceV1 = structuredClone(workspace);
    try {
      mutator(draft);
      const issues = validateWorkspace(draft);
      if (issues.length) { setError(issues[0]); return false; }
      draft.riskEvents = reconcileRiskHistory(draft, forecastWorkspace(draft));
      setWorkspace(draft); setError(''); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); return false; }
  }
  function editTask(taskId: string, mutator: (task: Task) => void) { change(draft => { const task = draft.projects.flatMap(p => p.tasks).find(item => item.id === taskId); if (!task) throw new Error('任务不存在'); mutator(task); }); }
  function editDeliverable(deliverableId: string, mutator: (item: Deliverable) => void) { change(draft => { const item = draft.projects.flatMap(p => p.tasks).flatMap(t => t.deliverables).find(entry => entry.id === deliverableId); if (!item) throw new Error('成果不存在'); mutator(item); }); }
  function addProject(event: React.FormEvent) {
    event.preventDefault(); if (!newProject.trim()) return;
    const nextId = id();
    change(draft => { const next: Project = { id: nextId, name: newProject.trim(), startDate: dateToday(), priority: 'medium', status: 'active', stages: [{ id: id(), name: 'TR1', order: 0 }], gates: [], tasks: [] }; draft.projects.push(next); draft.baselineSnapshots ||= []; draft.baselineSnapshots.push(captureBaseline(next)); });
    setProjectId(nextId); setNewProject('');
  }
  function addTask(event: React.FormEvent) {
    event.preventDefault(); if (!newTask.trim() || !project) return;
    change(draft => {
      const target = draft.projects.find(item => item.id === project.id)!;
      target.tasks.push({ id: id(), stageId: newTaskStage || target.stages[0].id, title: newTask.trim(), status: 'not_started', standardDurationDays: 1, minimumDurationDays: 1, deliverables: [] });
    }); setNewTask('');
  }
  function addStage(event: React.FormEvent) {
    event.preventDefault(); if (!newStage.trim() || !project) return;
    change(draft => { const target = draft.projects.find(item => item.id === project.id)!; target.stages.push({ id: id(), name: newStage.trim(), order: target.stages.length }); });
    setNewStage('');
  }
  function addGate(event: React.FormEvent) {
    event.preventDefault(); if (!newGate.trim() || !project) return;
    change(draft => { const target = draft.projects.find(item => item.id === project.id)!; target.gates.push({ id: id(), name: newGate.trim(), targetDate: newGateTarget, deadlineType: newGateDeadline, requiredTaskIds: newGateTask ? [newGateTask] : [], requiredDeliverableIds: [] }); });
    setNewGate('');
  }
  function addDeliverable(event: React.FormEvent) {
    event.preventDefault(); if (!newDeliverable.trim() || !deliverableTask) return;
    editTask(deliverableTask, task => task.deliverables.push({ id: id(), name: newDeliverable.trim(), kind: newDeliverableKind, standardOffsetDays: 1, earliestOffsetDays: 1, status: 'pending', versionHistory: [] }));
    setNewDeliverable('');
  }
  function transferDeliverable(deliverableId: string, targetTaskId: string) {
    if (!targetTaskId) return;
    change(draft => {
      const tasks = draft.projects.flatMap(item => item.tasks);
      const owner = tasks.find(task => task.deliverables.some(item => item.id === deliverableId));
      const target = tasks.find(task => task.id === targetTaskId);
      if (!owner || !target || owner.id === target.id) throw new Error('请选择其他任务接收成果');
      const item = owner.deliverables.find(entry => entry.id === deliverableId)!;
      if (item.kind !== 'ordinary') throw new Error('必需成果不能直接转移；请先修改验收条件');
      owner.deliverables = owner.deliverables.filter(entry => entry.id !== deliverableId);
      target.deliverables.push(item);
    });
  }
  function addDependency(event: React.FormEvent) {
    event.preventDefault(); if (!dependencySource || !dependencyTarget) return;
    const source = allDeliverables.find(item => item.deliverable.id === dependencySource);
    change(draft => draft.dependencies.push({ id: id(), sourceType: 'deliverable', sourceId: dependencySource, targetType: dependencyTargetType, targetId: dependencyTarget, sourceNameSnapshot: source?.deliverable.name, acceptedSourceVersionId: source?.deliverable.currentVersionId }));
  }
  function download(name: string, value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function adoptProposal() {
    if (!proposal?.feasible || !workspace) return;
    const affectedProjectIds: string[] = workspace.projects.filter(item => item.tasks.some(task => proposal.changes.some(change => change.entityId === task.id || task.deliverables.some(deliverable => deliverable.id === change.entityId)))).map(item => item.id);
    const saved = change(draft => {
      const changes = mergeChanges(draft.planRevisions.at(-1)?.changes || [], proposal.changes);
      const accepted = forecastWorkspace(draft, { ...planOptions(changes), skipAcceptedCheck: true });
      const gate = draft.projects.flatMap(item => item.gates).find(item => item.id === proposal.gateId)!;
      if (!accepted.gates[gate.id]?.date || accepted.gates[gate.id].date! > gate.targetDate || accepted.risks.some(risk => ['HARD_DEADLINE', 'RESOURCE_CONFLICT', 'INCOMPLETE_INPUT'].includes(risk.type))) throw new Error('现有计划与此候选合并后不可行，请重新生成候选');
      draft.planRevisions.push({ id: id(), createdAt: new Date().toISOString(), affectedProjectIds, changes, basedOnRevisionId: draft.planRevisions.at(-1)?.id, adoptedByUser: true, acceptedGateDates: Object.fromEntries(Object.entries(accepted.gates).filter(([, item]) => item.date).map(([gateId, item]) => [gateId, item.date!])), note: `GA ${proposal.gateId} 候选 ${proposal.proposedDate}` });
    });
    if (saved) setProposal(null);
  }
  function adoptResourceProposal() {
    if (!resourceProposal?.feasible || !workspace) return;
    const item = workspace.bookings.find(booking => booking.id === resourceProposal.bookingId);
    const owner = workspace.projects.find(project => project.tasks.some(task => task.id === item?.taskId));
    const saved = change(draft => {
      const booking = draft.bookings.find(entry => entry.id === resourceProposal.bookingId)!;
      booking.fixedStartDate = resourceProposal.newDate;
      const changes = mergeChanges(draft.planRevisions.at(-1)?.changes || [], [{ kind: 'booking_date', entityId: booking.id, previous: resourceProposal.oldDate, proposed: resourceProposal.newDate }, { kind: 'task_start', entityId: resourceProposal.affectedTaskId, previous: resourceProposal.oldTaskStart, proposed: resourceProposal.newTaskStart }]);
      const accepted = forecastWorkspace(draft, { ...planOptions(changes), skipAcceptedCheck: true });
      if (accepted.risks.some(risk => ['HARD_DEADLINE', 'RESOURCE_CONFLICT', 'INCOMPLETE_INPUT'].includes(risk.type))) throw new Error('错峰候选与现有计划合并后不可行，请重新模拟');
      draft.planRevisions.push({ id: id(), createdAt: new Date().toISOString(), affectedProjectIds: owner ? [owner.id] : [], changes, acceptedGateDates: Object.fromEntries(Object.entries(accepted.gates).filter(([, gate]) => gate.date).map(([gateId, gate]) => [gateId, gate.date!])), basedOnRevisionId: draft.planRevisions.at(-1)?.id, adoptedByUser: true, note: '用户确认资源错峰' });
    });
    if (saved) setResourceProposal(null);
  }
  async function importWorkspace(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('workspace' in parsed)) throw new Error('缺少工作区数据');
      if (!('schemaVersion' in parsed) || parsed.schemaVersion !== '1.0.0' || !('exportType' in parsed) || parsed.exportType !== 'workspace') throw new Error('备份版本或类型不受支持');
      const candidate = (parsed as { workspace: WorkspaceV1 }).workspace;
      if (candidate.schemaVersion !== 1) throw new Error('不支持的备份版本');
      const issues = validateWorkspace(candidate);
      if (issues.length) throw new Error(issues[0]);
      setPendingImport(candidate); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败'); }
  }
  async function importSingleProject(file: File) {
    if (!workspace) return;
    try {
      const parsed = JSON.parse(await file.text()) as ProjectExport;
      const candidate = importProjectIntoWorkspace(workspace, parsed);
      const issues = validateWorkspace(candidate);
      if (issues.length) throw new Error(issues[0]);
      candidate.baselineSnapshots ||= [];
      candidate.baselineSnapshots.push(captureBaseline(candidate.projects.at(-1)!));
      setPendingProjectImport(candidate); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '项目导入失败'); }
  }

  if (loadError) return <main className="max-w-xl mx-auto p-8"><h1 className="text-xl font-bold mb-3">无法安全读取工作区</h1><p role="alert" className="text-red-700 mb-4">{loadError}</p>{recoveryData && <button className={classes.button} onClick={() => download('ipd-recovery.json', recoveryData)}>下载原始数据以便修复</button>}</main>;
  if (!workspace) return <main className="p-8">正在读取项目…</main>;
  if (!project) return <main className="max-w-xl mx-auto p-8"><h1 className="text-xl font-bold mb-3">还没有项目</h1><p className="text-slate-600 mb-4">新建第一个项目，或从备份文件恢复工作区。</p><form onSubmit={addProject} className="flex gap-2"><input className={classes.input} aria-label="新项目名称" value={newProject} onChange={event => setNewProject(event.target.value)} /><button className={classes.button}>新建项目</button></form><label className={`${classes.secondary} inline-block mt-4`}>选择工作区备份<input hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importWorkspace(file); event.target.value = ''; }} /></label>{pendingImport && <button className={`${classes.button} mt-4`} onClick={() => { setWorkspace(pendingImport); setProjectId(pendingImport.projects[0]?.id || ''); setPendingImport(null); }}>确认恢复 {pendingImport.projects.length} 个项目</button>}</main>;
  const gateRows = project.gates.map(gate => ({ gate, predicted: forecast?.gates[gate.id] }));
  const done = project.tasks.filter(task => task.status === 'done').length;
  const progress = project.tasks.length ? Math.round(done / project.tasks.length * 100) : 0;

  return <div className="min-h-screen bg-[#f5f8fc] text-slate-900">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40"><div className="max-w-[1500px] mx-auto px-4 sm:px-8 py-4 flex flex-wrap gap-4 items-center">
      <div className="w-12 h-12 bg-blue-600 rounded-xl grid place-items-center text-white shadow-lg shadow-blue-100"><Zap /></div>
      <div><h1 className="text-xl font-bold">项目管理</h1><p className="text-xs text-slate-500">IPD 智能排期工作区</p></div>
      <select aria-label="切换项目" className={`${classes.input} max-w-64 ml-auto`} value={project.id} onChange={event => setProjectId(event.target.value)}>{workspace.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <span role="status" className="text-xs text-slate-500">{saveStatus}</span>
    </div></header>
    <main className="max-w-[1500px] mx-auto p-4 sm:p-8 space-y-6">
      {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{error}</div>}
      {computed && 'error' in computed && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{computed.error}</div>}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 grid md:grid-cols-4 gap-4 items-end">
        <label className="text-xs font-semibold text-slate-500">项目名称<input className={classes.input} value={project.name} onChange={event => change(draft => { draft.projects.find(item => item.id === project.id)!.name = event.target.value; })} /></label>
        <label className="text-xs font-semibold text-slate-500">项目启动<input type="date" className={classes.input} value={project.startDate} onChange={event => change(draft => { draft.projects.find(item => item.id === project.id)!.startDate = event.target.value; })} /></label>
        <label className="text-xs font-semibold text-slate-500">项目优先级<select className={classes.input} value={project.priority} onChange={event => change(draft => { draft.projects.find(item => item.id === project.id)!.priority = event.target.value as Project['priority']; })}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
        <label className="text-xs font-semibold text-slate-500">状态<select className={classes.input} value={project.status} onChange={event => change(draft => { draft.projects.find(item => item.id === project.id)!.status = event.target.value as Project['status']; })}><option value="active">进行中</option><option value="archived">已归档</option></select></label>
      </section>
      <nav aria-label="工作区页面" className="flex gap-2 overflow-x-auto border-b border-slate-200">{([['overview','总览'],['tasks','任务与成果'],['dependencies','跨项目依赖'],['resources','关键资源'],['data','数据管理']] as [Tab,string][]).map(([key,label]) => <button key={key} className={`whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 ${tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`} onClick={() => setTab(key)}>{label}</button>)}</nav>
      {tab === 'overview' && <>
        <form onSubmit={addGate} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end"><label className="text-xs font-semibold text-slate-500">新增 GA<input className={classes.input} value={newGate} onChange={event => setNewGate(event.target.value)} placeholder="例如 TR1 评审" /></label><label className="text-xs font-semibold text-slate-500">目标日期<input type="date" className={classes.input} value={newGateTarget} onChange={event => setNewGateTarget(event.target.value)} /></label><label className="text-xs font-semibold text-slate-500">截止类型<select className={classes.input} value={newGateDeadline} onChange={event => setNewGateDeadline(event.target.value as 'soft' | 'hard')}><option value="soft">普通目标</option><option value="hard">硬截止</option></select></label><label className="text-xs font-semibold text-slate-500">完成判据<select className={classes.input} value={newGateTask} onChange={event => setNewGateTask(event.target.value)}><option value="">手动确认</option>{project.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><button className={classes.button}>添加 GA</button></form>
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6"><Layers3 className="text-blue-600 mb-6" /><p className="text-sm text-slate-500">当前进度</p><strong className="text-4xl">{progress}%</strong><p className="text-slate-500 text-sm">{done} / {project.tasks.length} 任务</p></div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6"><CalendarDays className="text-blue-600 mb-6" /><p className="text-sm text-slate-500">下一个 GA</p><strong className="text-2xl">{gateRows[0]?.predicted?.date || '未配置预测依据'}</strong><p className="text-slate-500 text-sm">目标：{gateRows[0]?.gate.targetDate || '未设置'}</p></div>
          <div className="bg-white rounded-2xl border border-orange-200 p-6"><AlertTriangle className="text-orange-600 mb-6" /><p className="text-sm text-slate-500">当前风险</p><strong className="text-4xl">{activeRisks.length}</strong><p className="text-slate-500 text-sm">所有项目合计</p></div>
        </div>
        <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">阶段 GA</h2><div className="space-y-3">{gateRows.map(({ gate, predicted }) => <div key={gate.id} className="flex flex-wrap gap-3 items-center border-b pb-3 text-sm"><input aria-label={`${gate.name}名称`} className="border rounded px-2 py-1 font-semibold" value={gate.name} onChange={event => change(draft => { draft.projects.flatMap(item => item.gates).find(item => item.id === gate.id)!.name = event.target.value; })} /><label>目标 <input aria-label={`${gate.name}目标日期`} type="date" className="border rounded px-2 py-1" value={gate.targetDate} onChange={event => change(draft => { draft.projects.flatMap(item => item.gates).find(item => item.id === gate.id)!.targetDate = event.target.value; })} /></label><span>原始目标 {workspace.baselineSnapshots?.find(item => item.projectId === project.id)?.gateTargets[gate.id] || '未冻结'}</span><span>标准预计 {predicted?.date || '无法预测'}</span>{acceptedForecast && <span className="text-blue-700">已采纳版预计 {acceptedForecast.gates[gate.id]?.date || '无法预测'}</span>}<label>截止类型 <select aria-label={`${gate.name}截止类型`} className="border rounded px-2 py-1" value={gate.deadlineType} onChange={event => change(draft => { draft.projects.flatMap(item => item.gates).find(item => item.id === gate.id)!.deadlineType = event.target.value as 'soft' | 'hard'; })}><option value="soft">普通目标</option><option value="hard">硬截止</option></select></label><label>实际达成 <input aria-label={`${gate.name}实际达成日期`} type="date" className="border rounded px-2 py-1" value={gate.actualAchievedDate || ''} onChange={event => change(draft => { draft.projects.flatMap(item => item.gates).find(item => item.id === gate.id)!.actualAchievedDate = event.target.value || undefined; })} /></label><button className={classes.secondary} onClick={() => { try { setProposal(proposeForGate(workspace, gate.id)); } catch (cause) { setError(cause instanceof Error ? cause.message : '候选计算失败'); } }}>生成候选</button></div>)}{!gateRows.length && <p className="text-slate-500">暂无 GA。请在任务页添加。</p>}</div></section>
        {proposal && <section className="bg-orange-50 rounded-2xl border border-orange-200 p-6"><h2 className="font-bold text-lg mb-3">未采纳的排期候选</h2><p className="text-sm">标准预计 {proposal.baselineDate || '未知'} → 候选 {proposal.proposedDate || '未知'}；{proposal.feasible ? '在当前已知约束内可达' : '当前约束下不可达'}</p><ul className="my-3 text-sm space-y-1">{proposal.changes.map(change => <li key={change.entityId}>{change.entityId}：{change.previous} → {change.proposed} 工作日</li>)}</ul>{proposal.reasons.map(reason => <p key={reason} className="text-sm text-orange-800">{reason}</p>)}<div className="mt-4 flex gap-2"><button disabled={!proposal.feasible} className={`${classes.button} disabled:opacity-40`} onClick={adoptProposal}>确认采纳为新版计划</button><button className={classes.secondary} onClick={() => setProposal(null)}>放弃候选</button></div></section>}
        <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">风险与原因</h2>{forecast?.risks.map(risk => <div key={`${risk.type}:${risk.sourceId}`} className="py-2 border-b text-sm"><strong className="text-orange-700">{risk.type}</strong> · {risk.detail}{remedy(risk.type) && <p className="mt-1 text-slate-600">{remedy(risk.type)}</p>}</div>)}{!forecast?.risks.length && <p className="text-slate-500">当前无计算风险。</p>}</section>
        <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">风险历史</h2>{workspace.riskEvents.map(event => <div key={event.id} className="py-2 border-b text-sm flex flex-wrap gap-3 items-center"><strong>{event.type}</strong><span>{event.firstDetectedAt.slice(0, 10)} 首次发现</span><span>{event.initialSnapshot}</span><span className={event.state === 'resolved' ? 'text-green-700' : 'text-orange-700'}>{event.state === 'resolved' ? '已解除' : event.state === 'mitigated' ? '已接受风险，仍需关注' : '待处理'}</span>{event.state === 'open' && <button className="text-blue-700" onClick={() => change(draft => { draft.riskEvents.find(item => item.id === event.id)!.state = 'mitigated'; })}>接受风险</button>}</div>)}{!workspace.riskEvents.length && <p className="text-slate-500">暂无历史风险。</p>}</section>
      </>}
      {tab === 'tasks' && <>
        <form onSubmit={addStage} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end"><label className="text-xs font-semibold text-slate-500">新增阶段<input className={classes.input} value={newStage} onChange={event => setNewStage(event.target.value)} placeholder="阶段名称" /></label><button className={classes.button}>添加阶段</button></form>
        <section className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap gap-3 items-end"><form onSubmit={addTask} className="flex gap-2 items-end"><label className="text-xs font-semibold text-slate-500">阶段<select className={classes.input} value={newTaskStage} onChange={event => setNewTaskStage(event.target.value)}><option value="">首个阶段</option>{project.stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">新任务<input className={classes.input} value={newTask} onChange={event => setNewTask(event.target.value)} placeholder="任务名称" /></label><button className={classes.button}><Plus className="inline w-4 h-4" /> 添加</button></form><form onSubmit={addDeliverable} className="flex flex-wrap gap-2 items-end"><label className="text-xs font-semibold text-slate-500">所属任务<select className={classes.input} value={deliverableTask} onChange={event => setDeliverableTask(event.target.value)}><option value="">选择任务</option>{project.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">新成果<input className={classes.input} value={newDeliverable} onChange={event => setNewDeliverable(event.target.value)} placeholder="成果名称" /></label><select aria-label="成果类别" className={classes.input} value={newDeliverableKind} onChange={event => setNewDeliverableKind(event.target.value as Deliverable['kind'])}><option value="required">必需成果</option><option value="ordinary">普通成果</option></select><button className={classes.secondary}>添加成果</button></form></section>
        {project.stages.map(stage => <section key={stage.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="bg-slate-50 p-4"><input aria-label={`${stage.name}阶段名称`} className="font-bold bg-transparent border-b border-transparent focus:border-blue-500" value={stage.name} onChange={event => change(draft => { draft.projects.flatMap(item => item.stages).find(item => item.id === stage.id)!.name = event.target.value; })} /></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="text-left text-slate-500"><tr><th className="p-3">任务</th><th>标准预测</th><th>标准/最短工作日</th><th>剩余/延期</th><th>状态</th><th>实际开始</th><th>实际完成</th><th>成果</th></tr></thead><tbody>{project.tasks.filter(task => task.stageId === stage.id).map(task => <tr key={task.id} className="border-t align-top"><td className="p-3 font-semibold">{task.title}</td><td className="py-3">{forecast?.tasks[task.id]?.startDate || '—'} → {forecast?.tasks[task.id]?.finishDate || '—'}</td><td className="py-3"><input aria-label={`${task.title}标准工期`} type="number" min="1" className="w-16 border rounded p-1" value={task.standardDurationDays} onChange={event => editTask(task.id, t => { t.standardDurationDays = Number(event.target.value); })} /> / <input aria-label={`${task.title}最短工期`} type="number" min="1" className="w-16 border rounded p-1" value={task.minimumDurationDays} onChange={event => editTask(task.id, t => { t.minimumDurationDays = Number(event.target.value); })} /></td><td className="py-3"><input aria-label={`${task.title}剩余工作日`} title="进行中任务使用剩余工作日预测" type="number" min="1" placeholder="剩余" className="w-16 border rounded p-1" value={task.remainingWorkdays ?? ''} onChange={event => editTask(task.id, t => { t.remainingWorkdays = event.target.value ? Number(event.target.value) : undefined; })} /> / <input aria-label={`${task.title}人工延期工作日`} title="未开始任务的人工延期" type="number" min="0" placeholder="延期" className="w-16 border rounded p-1" value={task.manualDelayWorkdays ?? ''} onChange={event => editTask(task.id, t => { t.manualDelayWorkdays = event.target.value ? Number(event.target.value) : undefined; })} /></td><td className="py-3"><select aria-label={`${task.title}状态`} className="border rounded p-1" value={task.status} onChange={event => editTask(task.id, t => { t.status = event.target.value as Task['status']; })}><option value="not_started">未开始</option><option value="in_progress">进行中</option><option value="done">已完成</option><option value="cancelled">已取消</option></select></td><td className="py-3"><input aria-label={`${task.title}实际开始`} type="date" className="border rounded p-1" value={task.actualStartDate || ''} onChange={event => editTask(task.id, t => { t.actualStartDate = event.target.value || undefined; })} /></td><td className="py-3"><input aria-label={`${task.title}实际完成`} type="date" className="border rounded p-1" value={task.actualFinishDate || ''} onChange={event => editTask(task.id, t => { t.actualFinishDate = event.target.value || undefined; })} /></td><td className="py-3">{task.deliverables.map(item => <div key={item.id} className="mb-2 rounded bg-slate-50 p-2"><span className="font-semibold">{item.name}</span> <span className="text-slate-500">预计 {forecast?.deliverables[item.id]?.date || '—'}</span><input aria-label={`${item.name}失效原因`} className="ml-2 border rounded p-1" placeholder="失效原因（标记失效前填写）" value={item.invalidationReason || ''} onChange={event => editDeliverable(item.id, d => { d.invalidationReason = event.target.value; })} /><select aria-label={`${item.name}状态`} className="ml-2 border rounded p-1" value={item.status} onChange={event => editDeliverable(item.id, d => { d.status = event.target.value as Deliverable['status']; if (d.status === 'invalidated') { const current = d.versionHistory.find(v => v.id === d.currentVersionId); if (current) current.invalidatedAt = new Date().toISOString(); } if (d.status === 'delivered') { d.actualDeliveredDate = dateToday(); d.currentVersionId = id(); d.versionHistory.push({ id: d.currentVersionId, label: `V${d.versionHistory.length + 1}`, createdAt: new Date().toISOString(), deliveredAt: d.actualDeliveredDate }); } })}><option value="pending">未交付</option><option value="delivered">已交付</option><option value="invalidated">已失效</option><option value="cancelled">已取消</option></select><div className="mt-2 flex flex-wrap gap-2 items-center"><label>标准第 <input aria-label={`${item.name}标准交付工作日`} type="number" min="1" className="w-14 border rounded p-1" value={item.standardOffsetDays} onChange={event => editDeliverable(item.id, d => { d.standardOffsetDays = Number(event.target.value); })} /> 天</label><label>最早第 <input aria-label={`${item.name}最早交付工作日`} type="number" min="1" className="w-14 border rounded p-1" value={item.earliestOffsetDays || ''} onChange={event => editDeliverable(item.id, d => { d.earliestOffsetDays = event.target.value ? Number(event.target.value) : undefined; })} /> 天</label><label>实际交付 <input aria-label={`${item.name}实际交付日期`} type="date" className="border rounded p-1" value={item.actualDeliveredDate || ''} onChange={event => editDeliverable(item.id, d => { d.actualDeliveredDate = event.target.value || undefined; })} /></label>{item.kind === 'ordinary' && item.status === 'pending' && <label>转移到 <select aria-label={`${item.name}转移目标`} className="border rounded p-1" value="" onChange={event => transferDeliverable(item.id, event.target.value)}><option value="">选择任务</option>{allTasks.filter(entry => entry.task.id !== task.id).map(entry => <option key={entry.task.id} value={entry.task.id}>{entry.project.name} / {entry.task.title}</option>)}</select></label>}</div></div>)}</td></tr>)}</tbody></table></div></section>)}
      </>}
      {tab === 'dependencies' && <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">跨项目成果依赖</h2><form onSubmit={addDependency} className="flex flex-wrap gap-3 items-end"><label className="text-xs font-semibold text-slate-500">前置成果<select className={classes.input} value={dependencySource} onChange={event => setDependencySource(event.target.value)}><option value="">选择成果</option>{allDeliverables.map(({ deliverable, project: owner }) => <option key={deliverable.id} value={deliverable.id}>{owner.name} / {deliverable.name}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">后续对象<select className={classes.input} value={dependencyTargetType} onChange={event => { setDependencyTargetType(event.target.value as Dependency['targetType']); setDependencyTarget(''); }}><option value="task_start">任务开始</option><option value="deliverable">成果交付</option></select></label><label className="text-xs font-semibold text-slate-500">目标<select className={classes.input} value={dependencyTarget} onChange={event => setDependencyTarget(event.target.value)}><option value="">选择目标</option>{dependencyTargetType === 'task_start' ? allTasks.map(({ task, project: owner }) => <option key={task.id} value={task.id}>{owner.name} / {task.title}</option>) : allDeliverables.map(({ deliverable, project: owner }) => <option key={deliverable.id} value={deliverable.id}>{owner.name} / {deliverable.name}</option>)}</select></label><button className={classes.button}><Workflow className="inline w-4 h-4" /> 建立依赖</button></form><div className="mt-5 space-y-2">{workspace.dependencies.map((dependency: Dependency) => <div key={dependency.id} className="rounded-lg border p-3 text-sm">{dependency.sourceNameSnapshot || allDeliverables.find(item => item.deliverable.id === dependency.sourceId)?.deliverable.name || '任务完成'} → {(dependency.targetType === 'deliverable' ? allDeliverables.find(item => item.deliverable.id === dependency.targetId)?.deliverable.name : allTasks.find(item => item.task.id === dependency.targetId)?.task.title) || '目标缺失'} {dependency.sourceType === 'deliverable' && allDeliverables.find(item => item.deliverable.id === dependency.sourceId)?.deliverable.currentVersionId !== dependency.acceptedSourceVersionId && <button className="ml-3 text-blue-700" onClick={() => change(draft => { const edge = draft.dependencies.find(item => item.id === dependency.id)!; edge.acceptedSourceVersionId = allDeliverables.find(item => item.deliverable.id === edge.sourceId)?.deliverable.currentVersionId; })}>接纳当前成果版本</button>}{dependency.sourceType === 'deliverable' && !allDeliverables.some(item => item.deliverable.id === dependency.sourceId) && <select aria-label="重新绑定缺失成果" className="ml-3 border rounded p-1" value="" onChange={event => change(draft => { const edge = draft.dependencies.find(item => item.id === dependency.id)!; edge.sourceId = event.target.value; edge.acceptedSourceVersionId = draft.projects.flatMap(item => item.tasks).flatMap(task => task.deliverables).find(item => item.id === event.target.value)?.currentVersionId; })}><option value="">重新绑定来源</option>{allDeliverables.map(item => <option key={item.deliverable.id} value={item.deliverable.id}>{item.project.name} / {item.deliverable.name}</option>)}</select>}<button className="ml-3 text-red-700" onClick={() => change(draft => { draft.dependencies = draft.dependencies.filter(item => item.id !== dependency.id); })}>移除</button></div>)}</div></section>}
      {tab === 'resources' && <section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">独占资源</h2><form className="flex gap-2 mb-4" onSubmit={event => { event.preventDefault(); if (!newResource.trim()) return; change(draft => draft.resources.push({ id: id(), name: newResource.trim(), exclusive: true })); setNewResource(''); }}><input aria-label="新资源名称" className={classes.input} value={newResource} onChange={event => setNewResource(event.target.value)} placeholder="例如：测试设备 A" /><button className={classes.button}>添加资源</button></form><form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (!bookingResource || !bookingTask) return; change(draft => draft.bookings.push({ id: id(), resourceId: bookingResource, taskId: bookingTask, anchor: 'fixed_date', fixedStartDate: bookingDate, durationWorkdays: bookingDays })); }}><select aria-label="预约资源" className={classes.input} value={bookingResource} onChange={event => setBookingResource(event.target.value)}><option value="">资源</option>{workspace.resources.map(resource => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select><select aria-label="预约任务" className={classes.input} value={bookingTask} onChange={event => setBookingTask(event.target.value)}><option value="">任务</option>{allTasks.map(({ task, project: owner }) => <option key={task.id} value={task.id}>{owner.name} / {task.title}</option>)}</select><input aria-label="预约日期" type="date" className={classes.input} value={bookingDate} onChange={event => setBookingDate(event.target.value)} /><input aria-label="预约工作日数" type="number" min="1" className={`${classes.input} w-24`} value={bookingDays} onChange={event => setBookingDays(Number(event.target.value))} /><button className={classes.secondary}>添加预约</button></form><div className="mt-5 space-y-2">{workspace.bookings.map(booking => <div key={booking.id} className="text-sm rounded border p-3">{workspace.resources.find(resource => resource.id === booking.resourceId)?.name} · {allTasks.find(item => item.task.id === booking.taskId)?.task.title} · {booking.fixedStartDate}</div>)}</div><div className="mt-4 flex flex-wrap gap-2">{workspace.resources.map(resource => <button key={resource.id} className={classes.secondary} onClick={() => { const candidate = proposeResourceShift(workspace, resource.id); setResourceProposal(candidate); if (!candidate) setError(`${resource.name} 当前没有可自动错峰的固定预约`); }}>{resource.name} · 生成错峰候选</button>)}</div>{resourceProposal && <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm"><strong>未采纳的资源候选</strong><p>预约 {resourceProposal.bookingId}：{resourceProposal.oldDate} → {resourceProposal.newDate}</p><p>{resourceProposal.feasible ? '当前已知约束内可采纳' : '仍有硬约束或数据缺口，需要人工核实'}</p><div className="mt-2 flex gap-2"><button disabled={!resourceProposal.feasible} className={`${classes.button} disabled:opacity-40`} onClick={adoptResourceProposal}>确认采纳</button><button className={classes.secondary} onClick={() => setResourceProposal(null)}>放弃</button></div></div>}</section>}
      {tab === 'data' && <div className="grid lg:grid-cols-2 gap-5"><section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">项目管理</h2><form onSubmit={addProject} className="flex gap-2"><input aria-label="新项目名称" className={classes.input} value={newProject} onChange={event => setNewProject(event.target.value)} placeholder="新项目名称" /><button className={classes.button}><FolderPlus className="inline w-4 h-4" /> 新建</button></form><div className="mt-4 flex flex-wrap gap-2"><button className={classes.secondary} onClick={() => download(`${project.name}-ipd-project.json`, exportProject(workspace, project.id))}>导出当前项目</button><label className={classes.secondary}>导入为新项目<input hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importSingleProject(file); event.target.value = ''; }} /></label></div>{pendingProjectImport && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><p>将新增项目「{pendingProjectImport.projects.at(-1)?.name}」。外部成果引用若缺失，会保留为待修复风险。</p><button className={classes.button} onClick={() => { setWorkspace(pendingProjectImport); setProjectId(pendingProjectImport.projects.at(-1)!.id); setPendingProjectImport(null); }}>确认导入</button><button className={classes.secondary} onClick={() => setPendingProjectImport(null)}>取消</button></div>}<p className="mt-4 text-sm text-slate-500">项目可归档；归档不会删除跨项目依赖。</p></section><section className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-lg mb-4">工作区备份</h2><div className="flex flex-wrap gap-2"><button className={classes.button} onClick={() => download('ipd-workspace.json', { schemaVersion: '1.0.0', exportType: 'workspace', exportedAt: new Date().toISOString(), workspace })}><Download className="inline w-4 h-4" /> 导出完整工作区</button><label className={classes.secondary}><FileJson className="inline w-4 h-4" /> 导入完整工作区<input hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importWorkspace(file); event.target.value = ''; }} /></label></div><p className="mt-4 text-sm text-slate-500">导入会替换当前工作区，请先导出备份。</p>{pendingImport && <div className="mt-4 rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm"><p>待导入 {pendingImport.projects.length} 个项目。确认后将替换当前全部项目和风险历史。</p><div className="mt-3 flex gap-2"><button className={classes.button} onClick={() => { setWorkspace(pendingImport); setProjectId(pendingImport.projects[0]?.id || ''); setPendingImport(null); }}>确认替换</button><button className={classes.secondary} onClick={() => setPendingImport(null)}>取消</button></div></div>}</section></div>}
    </main>
  </div>;
}
