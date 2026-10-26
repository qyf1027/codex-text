import type { ScheduledTask } from '../types';

// The browser must work without a key. A future server endpoint can provide
// opt-in Gemini advice without exposing credentials to browser JavaScript.
export async function getSqueezingStrategy(tasks: ScheduledTask[], targetGA: string): Promise<string[]> {
  const delayed = tasks.filter(task => task.status === '延期');
  const compressible = tasks.filter(task => task.status === '未开始' && task.currentDuration > task.limitDuration);
  return [
    delayed.length
      ? `先核实 ${delayed[0].name} 的剩余工作量和延期原因，再重新计算 ${targetGA} 的可达性。`
      : `核实目标 GA ${targetGA} 与各前置任务的实际日期。`,
    compressible.length
      ? `检查 ${compressible[0].name} 是否具备压缩条件；当前最低耗时为 ${compressible[0].limitDuration} 个工作日。`
      : '当前没有可自动压缩的未开始任务，请检查外部资源或目标约束。',
    '如需改用并行方式或追加资源，请先确认依赖和实际可用日期。',
  ];
}
