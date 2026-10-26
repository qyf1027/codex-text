import { IPDNode, IPD_DATABASE, ScheduledTask, calculateEndDate, addBusinessDays } from './types';
import { parseISO, format, max, isAfter, differenceInDays } from 'date-fns';

export function generateInitialSchedule(startDate: string): ScheduledTask[] {
  const tasks: ScheduledTask[] = [];
  const taskMap = new Map<string, ScheduledTask>();

  IPD_DATABASE.forEach((node) => {
    let taskStartDate = startDate;

    if (node.dependencies.length > 0) {
      const depDates = node.dependencies.map((depName) => {
        const depTask = taskMap.get(depName);
        if (depTask) {
          return node.flowType === '并行' ? parseISO(depTask.startDate) : parseISO(depTask.endDate);
        }
        return parseISO(startDate);
      });
      taskStartDate = format(max(depDates), 'yyyy-MM-dd');
    }

    const task: ScheduledTask = {
      ...node,
      id: node.name,
      startDate: taskStartDate,
      endDate: calculateEndDate(taskStartDate, node.standardDuration),
      status: '未开始',
      isCritical: true,
      currentDuration: node.standardDuration,
      isCompressed: false,
    };

    tasks.push(task);
    taskMap.set(node.name, task);
  });

  return tasks;
}

export function squeezeSchedule(
  tasks: ScheduledTask[],
  targetGA: string,
  delayedTaskId?: string,
  delayDays?: number,
  remark?: string
): { tasks: ScheduledTask[]; warning: boolean } {
  let updatedTasks = tasks.map(t => ({ ...t }));
  let hasWarning = false;

  // 1. If a task is delayed, update its delayDays and status
  if (delayedTaskId && delayDays !== undefined) {
    const taskIdx = updatedTasks.findIndex(t => t.id === delayedTaskId);
    if (taskIdx !== -1) {
      updatedTasks[taskIdx].delayDays = (updatedTasks[taskIdx].delayDays || 0) + delayDays;
      updatedTasks[taskIdx].status = '延期';
      updatedTasks[taskIdx].remark = remark;
    }
  }

  // 2. Reset all uncompleted tasks to their uncompressed duration
  for (const task of updatedTasks) {
    if (task.status !== '已完成') {
      task.currentDuration = task.standardDuration + (task.delayDays || 0);
      task.isCompressed = false;
    }
  }

  // 3. Recalculate all subsequent tasks
  updatedTasks = recalculateDates(updatedTasks);

  // 4. Check if GA is exceeded
  const gaTask = updatedTasks.find(t => t.name === '上架开售');
  if (!gaTask) return { tasks: updatedTasks, warning: false };

  let currentGA = gaTask.endDate;
  const targetGADate = parseISO(targetGA);

  if (isAfter(parseISO(currentGA), targetGADate)) {
    // 5. Squeezing logic: Only squeeze '未开始' tasks
    for (const task of updatedTasks) {
      const minDuration = task.limitDuration + (task.delayDays || 0);
      if (task.status === '未开始' && task.currentDuration > minDuration) {
        // Calculate how many days we need to squeeze
        const diff = differenceInDays(parseISO(currentGA), targetGADate);
        if (diff <= 0) break;

        const potentialSqueeze = task.currentDuration - minDuration;
        const actualSqueeze = Math.min(potentialSqueeze, diff);
        
        task.currentDuration -= actualSqueeze;
        task.isCompressed = true;
        
        // Recalculate after each squeeze to see if we reached target
        updatedTasks = recalculateDates(updatedTasks);
        currentGA = updatedTasks.find(t => t.name === '上架开售')?.endDate || currentGA;
        if (!isAfter(parseISO(currentGA), targetGADate)) break;
      }
    }

    // Final check
    if (isAfter(parseISO(currentGA), targetGADate)) {
      hasWarning = true;
    }
  }

  return { tasks: updatedTasks, warning: hasWarning };
}

export function recalculateDates(tasks: ScheduledTask[]): ScheduledTask[] {
  const taskMap = new Map<string, ScheduledTask>();
  const result: ScheduledTask[] = [];

  tasks.forEach((task) => {
    // Start date is either actualStartDate (if provided) or max of dependencies
    let startDate = task.startDate;

    if (task.actualStartDate) {
      startDate = task.actualStartDate;
    } else if (task.dependencies.length > 0) {
      const depDates = task.dependencies.map((depName) => {
        const depTask = taskMap.get(depName);
        if (depTask) {
          return task.flowType === '并行' ? parseISO(depTask.startDate) : parseISO(depTask.endDate);
        }
        return parseISO(task.startDate);
      });
      startDate = format(max(depDates), 'yyyy-MM-dd');
    }

    // End date calculation
    let endDate = calculateEndDate(startDate, task.currentDuration);
    
    // If completed, use actualEndDate if available
    if (task.status === '已完成' && task.actualEndDate) {
      endDate = task.actualEndDate;
    }

    const updatedTask: ScheduledTask = {
      ...task,
      startDate,
      endDate,
    };

    result.push(updatedTask);
    taskMap.set(task.name, updatedTask);
  });

  return result;
}
