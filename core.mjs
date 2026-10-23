const DAY = 86400000;

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期应为 YYYY-MM-DD');
  const valueDate = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(valueDate.getTime()) || valueDate.toISOString().slice(0, 10) !== value) throw new Error('日期无效');
  return valueDate;
}

function iso(d) { return d.toISOString().slice(0, 10); }
function isWorkday(d) { return d.getUTCDay() !== 0 && d.getUTCDay() !== 6; }

export function nextWorkday(value) {
  const d = date(value);
  do { d.setTime(d.getTime() + DAY); } while (!isWorkday(d));
  return iso(d);
}

export function addWorkdays(start, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('工期必须为正整数');
  const d = date(start);
  while (!isWorkday(d)) d.setTime(d.getTime() + DAY);
  for (let n = 1; n < count; n++) {
    do { d.setTime(d.getTime() + DAY); } while (!isWorkday(d));
  }
  return iso(d);
}

export function makeProject(name, startDate, targetGA, tasks = []) {
  if (!name?.trim()) throw new Error('请输入项目名称');
  date(startDate); date(targetGA);
  return { id: crypto.randomUUID(), name: name.trim(), startDate, targetGA, tasks: tasks.map(t => ({ ...t, status: t.status || '未开始', actualStartDate: t.actualStartDate || '', actualEndDate: t.actualEndDate || '' })) };
}

export function schedule(project, durations = {}) {
  const done = new Map();
  const pending = project.tasks.map(t => ({ ...t }));
  const output = [];
  while (pending.length) {
    const index = pending.findIndex(t => (t.dependencies || []).every(dep => done.has(dep)));
    if (index < 0) throw new Error('任务依赖缺失或存在循环');
    const task = pending.splice(index, 1)[0];
    let start = addWorkdays(project.startDate, 1);
    for (const id of task.dependencies || []) {
      const upstream = done.get(id);
      const required = task.flowType === '并行' ? upstream.startDate : nextWorkday(upstream.endDate);
      if (required > start) start = required;
    }
    if (task.actualStartDate) { date(task.actualStartDate); start = task.actualStartDate; }
    const duration = task.status === '已完成' ? task.standardDuration : (durations[task.id] ?? task.standardDuration) + (task.delayDays || 0);
    let end = addWorkdays(start, duration);
    if (task.status === '已完成' && task.actualEndDate) { date(task.actualEndDate); end = task.actualEndDate; }
    const scheduled = { ...task, duration, startDate: start, endDate: end };
    done.set(task.id, scheduled);
    output.push(scheduled);
  }
  return output;
}

export function optimize(project) {
  const normal = schedule(project);
  const durations = {};
  const target = project.targetGA;
  let proposed = normal;
  let ga = proposed.find(t => t.name === '上架开售') || proposed.at(-1);
  const taskById = new Map(normal.map(t => [t.id, t]));
  const relevant = new Set();
  function markPredecessors(id) {
    if (relevant.has(id)) return;
    relevant.add(id);
    for (const dependency of taskById.get(id)?.dependencies || []) markPredecessors(dependency);
  }
  if (ga) markPredecessors(ga.id);
  for (const task of normal) {
    if (!ga || ga.endDate <= target) break;
    if (!relevant.has(task.id)) continue;
    if (task.status !== '未开始') continue;
    if (!Number.isInteger(task.limitDuration) || task.limitDuration < 1 || task.limitDuration >= task.standardDuration) continue;
    for (let d = task.standardDuration - 1; d >= task.limitDuration; d--) {
      durations[task.id] = d;
      proposed = schedule(project, durations);
      ga = proposed.find(t => t.id === ga.id);
      if (ga.endDate <= target) break;
    }
  }
  return { tasks: proposed, feasible: Boolean(ga && ga.endDate <= target), gaDate: ga?.endDate || null, changes: Object.entries(durations).map(([id, duration]) => ({ id, duration })) };
}

export function validateImport(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || !Array.isArray(data.projects)) throw new Error('缺少项目列表');
    for (const p of data.projects) {
      if (!p.name?.trim() || !Array.isArray(p.tasks)) throw new Error('项目名称或任务列表无效');
      date(p.startDate); date(p.targetGA);
      const ids = new Set();
      for (const t of p.tasks) {
        if (!t.id || ids.has(t.id) || !t.name?.trim()) throw new Error('任务 ID 或名称无效');
        if (!Number.isInteger(t.standardDuration) || t.standardDuration < 1 || !Number.isInteger(t.limitDuration) || t.limitDuration < 1 || t.limitDuration > t.standardDuration) throw new Error('任务工期无效');
        ids.add(t.id);
      }
      schedule(p);
    }
    return { ok: true, data };
  } catch (error) { return { ok: false, error: error.message }; }
}
