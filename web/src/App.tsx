import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Play, 
  Settings,
  TrendingUp,
  Package,
  Truck,
  FileText,
  ShieldCheck,
  Zap,
  Sparkles,
  Loader2,
  Download,
  Upload,
  Send,
  Paperclip,
  MessageSquare,
  User,
  Bot,
  X
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore, addDays, differenceInDays } from 'date-fns';
import { ScheduledTask, IPD_DATABASE, ProjectState, TaskStatus, TaskFlowType, getBusinessDaysCount } from './types';
import { generateInitialSchedule, squeezeSchedule, recalculateDates } from './engine';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getSqueezingStrategy } from './services/geminiService';
import { loadWorkspace, saveWorkspace, type Workspace } from './storage';

function ProjectView({ projectState, setProjectState }: { projectState: ProjectState; setProjectState: React.Dispatch<React.SetStateAction<ProjectState>> }) {

  const [warning, setWarning] = useState(false);
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [aiStrategies, setAiStrategies] = useState<string[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delay Modal State
  const [delayModal, setDelayModal] = useState<{ taskId: string; taskName: string } | null>(null);
  const [delayDays, setDelayDays] = useState<number>(1);
  const [delayRemark, setDelayRemark] = useState("");

  useEffect(() => {
    const ga = projectState.tasks.find(task => task.name === '上架开售');
    setWarning(Boolean(ga && isAfter(parseISO(ga.endDate), parseISO(projectState.targetGA))));
  }, [projectState.targetGA, projectState.tasks]);

  // Recalculate when dates change
  const handleProjectDateChange = (field: 'projectStart' | 'targetGA', value: string) => {
    setProjectState(prev => {
      const newState = { ...prev, [field]: value };
      let updatedTasks = [...newState.tasks];
      
      if (field === 'projectStart') {
        // If start date changes, we need to re-initialize or at least shift everything
        // For simplicity, let's re-calculate from scratch but keep actual dates if possible
        // Actually, recalculateDates already handles dependencies. We just need to update the first task's start if it's not actual.
        if (updatedTasks.length > 0 && !updatedTasks[0].actualStartDate) {
          updatedTasks[0].startDate = value;
        }
      }
      
      const { tasks: squeezed, warning: hasWarning } = squeezeSchedule(updatedTasks, newState.targetGA);
      setWarning(hasWarning);
      return { ...newState, tasks: squeezed };
    });
  };

  const handleTaskUpdate = (taskId: string, updates: Partial<ScheduledTask>) => {
    setProjectState(prev => {
      const updatedTasks = prev.tasks.map(t => {
        if (t.id === taskId) {
          const newTask = { ...t, ...updates };
          
          // If standardDuration is manually updated, reset currentDuration and compression
          if (updates.standardDuration !== undefined) {
            newTask.currentDuration = updates.standardDuration;
            newTask.isCompressed = false;
          }

          // Auto-fill actualEndDate if status becomes '已完成'
          if (updates.status === '已完成' && !newTask.actualEndDate) {
            newTask.actualEndDate = format(new Date(), 'yyyy-MM-dd');
          }
          
          // If status changes from '已完成' to something else, clear actualEndDate
          if (updates.status && updates.status !== '已完成' && t.status === '已完成') {
            newTask.actualEndDate = undefined;
          }

          // If both actual dates exist, update currentDuration
          if (newTask.actualStartDate && newTask.actualEndDate) {
            newTask.currentDuration = getBusinessDaysCount(newTask.actualStartDate, newTask.actualEndDate);
          }

          return newTask;
        }
        return t;
      });
      
      const { tasks: squeezed, warning: hasWarning } = squeezeSchedule(updatedTasks, prev.targetGA);
      setWarning(hasWarning);
      return { ...prev, tasks: squeezed };
    });
  };

  const handleReportDelay = () => {
    if (!delayModal) return;
    const { tasks: squeezed, warning: hasWarning } = squeezeSchedule(
      projectState.tasks, 
      projectState.targetGA, 
      delayModal.taskId, 
      delayDays, 
      delayRemark
    );
    setProjectState(prev => ({ ...prev, tasks: squeezed }));
    setWarning(hasWarning);
    setDelayModal(null);
    setDelayDays(1);
    setDelayRemark("");
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(projectState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${projectState.projectName}_IPD排期计划.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedState = JSON.parse(content) as ProjectState;
        setProjectState(importedState);
        const gaTask = importedState.tasks.find(t => t.name === '上架开售');
        if (gaTask) {
          setWarning(isAfter(parseISO(gaTask.endDate), parseISO(importedState.targetGA)));
        }
      } catch (error) {
        alert("导入失败：文件格式不正确");
      }
    };
    reader.readAsText(file);
  };

  const phases = useMemo<Record<string, ScheduledTask[]>>(() => {
    const p: Record<string, ScheduledTask[]> = {};
    projectState.tasks.forEach(t => {
      if (!p[t.phase]) p[t.phase] = [];
      p[t.phase].push(t);
    });
    return p;
  }, [projectState.tasks]);

  const gaTask = projectState.tasks.find(t => t.name === '上架开售');
  const isDelayingGA = gaTask && isAfter(parseISO(gaTask.endDate), parseISO(projectState.targetGA));
  const progress = projectState.tasks.length > 0 ? Math.round((projectState.tasks.filter(t => t.status === '已完成').length / projectState.tasks.length) * 100) : 0;
  const compressedCount = projectState.tasks.filter(t => t.isCompressed).length;

  // AI Strategy fetching
  useEffect(() => {
    if (warning && projectState.tasks.length > 0) {
      setLoadingAi(true);
      getSqueezingStrategy(projectState.tasks, projectState.targetGA).then(strategies => {
        setAiStrategies(strategies);
        setLoadingAi(false);
      });
    } else {
      setAiStrategies([]);
    }
  }, [warning, projectState.tasks, projectState.targetGA]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans selection:bg-blue-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Zap className="text-white w-6 h-6" />
            </div>
            <div>
              <input 
                type="text"
                value={projectState.projectName}
                onChange={(e) => setProjectState(prev => ({ ...prev, projectName: e.target.value }))}
                className="text-xl font-bold tracking-tight text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 w-64"
              />
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">IPD 智能排期看板</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-6 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">项目启动</span>
                <input 
                  type="date" 
                  value={projectState.projectStart} 
                  onChange={(e) => handleProjectDateChange('projectStart', e.target.value)}
                  className="bg-transparent text-sm font-semibold outline-none cursor-pointer"
                />
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase">目标 GA</span>
                <input 
                  type="date" 
                  value={projectState.targetGA} 
                  onChange={(e) => handleProjectDateChange('targetGA', e.target.value)}
                  className="bg-transparent text-sm font-semibold outline-none cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                导出项目
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-lg text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
              >
                <Upload className="w-4 h-4" />
                导入项目
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImport} 
                className="hidden" 
                accept=".json"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        {/* Top Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">当前进度</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <h3 className="text-3xl font-bold text-slate-900">
                  {progress}%
                </h3>
                <p className="text-sm text-slate-500">{projectState.tasks.filter(t => t.status === '已完成').length} / {projectState.tasks.length} 节点</p>
              </div>
              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-500" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          <div className={cn(
            "bg-white p-6 rounded-2xl border shadow-sm transition-colors",
            isDelayingGA ? "border-red-200 bg-red-50/30" : "border-slate-200"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-lg", isDelayingGA ? "bg-red-100" : "bg-green-50")}>
                <Calendar className={cn("w-5 h-5", isDelayingGA ? "text-red-600" : "text-green-600")} />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">预计 GA 时间</span>
            </div>
            <div>
              <h3 className={cn("text-3xl font-bold", isDelayingGA ? "text-red-600" : "text-slate-900")}>
                {gaTask?.endDate || "---"}
              </h3>
              <p className="text-sm text-slate-500">目标: {projectState.targetGA}</p>
            </div>
          </div>

          <div className={cn(
            "bg-white p-6 rounded-2xl border shadow-sm",
            warning ? "border-orange-200 bg-orange-50/30" : "border-slate-200"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-lg", warning ? "bg-orange-100" : "bg-blue-50")}>
                <AlertTriangle className={cn("w-5 h-5", warning ? "text-orange-600" : "text-blue-600")} />
              </div>
              <span className="text-xs font-bold text-slate-400 uppercase">风险预警</span>
            </div>
            <div>
              <h3 className={cn("text-xl font-bold", warning ? "text-orange-600" : "text-slate-900")}>
                {warning ? "红色预警：GA 风险" : "正常：进度可控"}
              </h3>
              <p className="text-sm text-slate-500">
                {warning ? "已尝试极限挤压，仍无法保住 GA" : "当前排期符合目标节点"}
              </p>
            </div>
          </div>
        </div>

        {/* AI Squeezing Status Banner */}
        <AnimatePresence>
          {compressedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8"
            >
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                    <Zap className="w-4 h-4 fill-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-orange-800">智能挤压算法已启动</p>
                    <p className="text-xs text-orange-600">已自动压缩 {compressedCount} 个后续节点的耗时以保住 GA 时间线</p>
                  </div>
                </div>
                <div className="text-xs font-mono font-bold text-orange-400 bg-white px-2 py-1 rounded border border-orange-100">
                  AUTO_SQUEEZE_ACTIVE
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logic Explanation Note */}
        <div className="mb-6 px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span><b>时间线逻辑：</b>优先尊重“实际开始时间”；若无实际时间，则根据前序任务自动推算。</span>
          </div>
          <div className="w-px h-3 bg-slate-300" />
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span><b>耗时逻辑：</b>正常情况下使用“预估耗时”；当触发 AI 挤压时，使用压缩后的耗时进行预测。</span>
          </div>
        </div>

        {/* AI Strategies */}
        <AnimatePresence>
          {warning && aiStrategies.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mb-8 bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl shadow-blue-200"
            >
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="w-6 h-6 text-blue-200" />
                <h2 className="text-lg font-bold">离线排期建议</h2>
                {loadingAi && <Loader2 className="w-4 h-4 animate-spin text-blue-200" />}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {aiStrategies.map((strategy, idx) => (
                  <div key={idx} className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl">
                    <div className="text-[10px] font-bold text-blue-200 uppercase mb-1">策略 {idx + 1}</div>
                    <p className="text-sm font-medium leading-relaxed">{strategy}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase Timeline */}
        <div className="space-y-6">
          {(Object.entries(phases) as [string, ScheduledTask[]][]).map(([phaseName, phaseTasks]) => (
            <div key={phaseName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <button 
                onClick={() => setActivePhase(activePhase === phaseName ? null : phaseName)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-slate-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase">{phaseName}</h2>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase">
                    {phaseTasks.length} 节点
                  </span>
                </div>
                {activePhase === phaseName ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </button>

              <AnimatePresence>
                {(activePhase === phaseName || activePhase === null) && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-6 overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[1400px]">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-40">任务名称</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-48">标准预测时间线</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">实际开始</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">实际完成</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">预估耗时</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-24">实际耗时</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-32">状态</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">AI 压缩</th>
                            <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">备注</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {phaseTasks.map((task) => (
                            <tr key={task.id} className="group hover:bg-slate-50/50 transition-colors">
                              <td className="py-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm font-semibold text-slate-700">{task.name}</span>
                                  <select
                                    value={task.flowType}
                                    onChange={(e) => handleTaskUpdate(task.id, { flowType: e.target.value as TaskFlowType })}
                                    className="text-[10px] text-slate-500 font-medium bg-transparent border-none outline-none cursor-pointer hover:bg-slate-100 rounded px-1 w-fit -ml-1"
                                  >
                                    <option value="串行">串行</option>
                                    <option value="并行">并行</option>
                                  </select>
                                </div>
                              </td>
                              <td className="py-4">
                                <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                  <span>{task.startDate}</span>
                                  <ChevronRight className="w-3 h-3 text-slate-300" />
                                  <span className={cn(
                                    task.status === '延期' ? "text-red-500 font-bold" : ""
                                  )}>{task.endDate}</span>
                                </div>
                              </td>
                              <td className="py-4">
                                <input 
                                  type="date"
                                  value={task.actualStartDate || ""}
                                  onChange={(e) => handleTaskUpdate(task.id, { actualStartDate: e.target.value })}
                                  className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 w-full"
                                />
                              </td>
                              <td className="py-4">
                                <span className="text-xs font-medium text-slate-600">{task.actualEndDate || "---"}</span>
                              </td>
                              <td className="py-4">
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number"
                                    value={task.standardDuration}
                                    onChange={(e) => handleTaskUpdate(task.id, { standardDuration: parseInt(e.target.value) || 0 })}
                                    className="text-xs font-bold bg-slate-50 border border-slate-200 rounded px-2 py-1 w-16 outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <span className="text-[10px] text-slate-400">d</span>
                                </div>
                              </td>
                              <td className="py-4">
                                {task.status === '已完成' ? (
                                  <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 w-fit",
                                    task.isCompressed ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600"
                                  )}>
                                    {task.currentDuration}d
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-300">---</span>
                                )}
                              </td>
                              <td className="py-4">
                                <select 
                                  value={task.status}
                                  onChange={(e) => {
                                    const newStatus = e.target.value as TaskStatus;
                                    if (newStatus === '延期') {
                                      setDelayModal({ taskId: task.id, taskName: task.name });
                                    } else {
                                      handleTaskUpdate(task.id, { status: newStatus });
                                    }
                                  }}
                                  className={cn(
                                    "text-[10px] font-bold uppercase px-2 py-1 rounded-full border-none outline-none cursor-pointer",
                                    task.status === '已完成' ? "bg-green-50 text-green-600" :
                                    task.status === '进行中' ? "bg-blue-50 text-blue-600" :
                                    task.status === '延期' ? "bg-red-50 text-red-600" :
                                    "bg-slate-50 text-slate-400"
                                  )}
                                >
                                  <option value="未开始">未开始</option>
                                  <option value="进行中">进行中</option>
                                  <option value="已完成">已完成</option>
                                  <option value="延期">延期</option>
                                </select>
                              </td>
                              <td className="py-4">
                                <div className="flex items-center justify-center">
                                  {task.isCompressed ? (
                                    <div className="flex flex-col items-center">
                                      <Zap className="w-4 h-4 text-orange-400 fill-orange-400" />
                                      <span className="text-[9px] font-bold text-orange-500">-{task.standardDuration - task.currentDuration}d</span>
                                    </div>
                                  ) : task.status === '延期' ? (
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                  ) : (
                                    <span className="text-slate-200">---</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4">
                                <input 
                                  type="text"
                                  value={task.remark || ""}
                                  onChange={(e) => handleTaskUpdate(task.id, { remark: e.target.value })}
                                  placeholder="添加备注..."
                                  className="text-xs bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 outline-none w-full py-1 transition-colors"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </main>

      {/* Delay Modal */}
      <AnimatePresence>
        {delayModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">上报延期: {delayModal.taskName}</h3>
                <button onClick={() => setDelayModal(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">延期天数 (工作日)</label>
                  <input 
                    type="number"
                    value={delayDays}
                    onChange={(e) => setDelayDays(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500 transition-all"
                    min={1}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">延期备注</label>
                  <textarea 
                    value={delayRemark}
                    onChange={(e) => setDelayRemark(e.target.value)}
                    placeholder="请说明延期原因及影响..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none"
                    rows={4}
                  />
                </div>
              </div>
              <div className="p-6 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setDelayModal(null)}
                  className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleReportDelay}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
                >
                  确认上报
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function defaultProject(name: string): ProjectState {
  const projectStart = format(new Date(), 'yyyy-MM-dd');
  const targetGA = format(addDays(new Date(), 200), 'yyyy-MM-dd');
  const tasks = generateInitialSchedule(projectStart);
  return { projectName: name, projectStart, targetGA, tasks };
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [saveState, setSaveState] = useState('正在读取本地项目…');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadWorkspace().then(saved => {
      if (saved?.version === 1 && saved.projects.length && saved.projects.some(project => project.id === saved.currentId)) {
        setWorkspace(saved);
      } else {
        const id = crypto.randomUUID();
        setWorkspace({ version: 1, currentId: id, projects: [{ id, state: defaultProject('项目管理') }] });
      }
    }).catch(() => {
      const id = crypto.randomUUID();
      setSaveState('本地读取失败，请及时导出项目');
      setWorkspace({ version: 1, currentId: id, projects: [{ id, state: defaultProject('项目管理') }] });
    });
  }, []);

  useEffect(() => {
    if (!workspace) return;
    let active = true;
    setSaveState('正在保存…');
    saveWorkspace(workspace).then(() => { if (active) setSaveState('已保存到此浏览器'); })
      .catch(() => { if (active) setSaveState('保存失败，请导出项目'); });
    return () => { active = false; };
  }, [workspace]);

  if (!workspace) return <main className="p-8 text-slate-700">正在读取本地项目…</main>;
  const selected = workspace.projects.find(project => project.id === workspace.currentId) ?? workspace.projects[0];
  const setProjectState: React.Dispatch<React.SetStateAction<ProjectState>> = update => {
    setWorkspace(previous => previous && ({
      ...previous,
      projects: previous.projects.map(project => project.id === previous.currentId
        ? { ...project, state: typeof update === 'function' ? update(project.state) : update }
        : project),
    }));
  };
  const createProject = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    setWorkspace(previous => previous && ({ ...previous, currentId: id, projects: [...previous.projects, { id, state: defaultProject(name) }] }));
    setNewName('');
  };

  return <>
    <div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
      <label htmlFor="workspace-project" className="font-semibold">本地项目</label>
      <select id="workspace-project" aria-label="切换项目" className="bg-white text-slate-900 rounded px-2 py-1" value={selected.id} onChange={event => setWorkspace(previous => previous && ({ ...previous, currentId: event.target.value }))}>
        {workspace.projects.map(project => <option key={project.id} value={project.id}>{project.state.projectName}</option>)}
      </select>
      <form onSubmit={createProject} className="flex gap-2">
        <input aria-label="新项目名称" className="text-slate-900 rounded px-2 py-1 w-36" value={newName} onChange={event => setNewName(event.target.value)} placeholder="新项目名称" />
        <button className="bg-blue-600 rounded px-3 py-1 font-semibold" type="submit">新建项目</button>
      </form>
      <span role="status" className="ml-auto text-slate-200">{saveState}</span>
    </div>
    <ProjectView projectState={selected.state} setProjectState={setProjectState} />
  </>;
}
