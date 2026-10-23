import { makeProject, schedule, optimize, validateImport } from './core.mjs';

const key = 'ipd-smart-tracker-html-v1';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let workspace = { version: 1, projects: [], currentId: null };
let seed = [];
let dialogMode = 'project';

function notice(message) {
  const node = $('notice');
  node.textContent = message;
  node.hidden = !message;
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(workspace));
    $('save-status').textContent = '✓ 已保存到此浏览器';
    notice('');
  } catch (error) {
    $('save-status').textContent = '保存失败';
    notice('保存失败。请导出项目备份；当前页面数据仍可操作。');
  }
}
function current() { return workspace.projects.find(p => p.id === workspace.currentId) || workspace.projects[0]; }
function today() { return new Date().toLocaleDateString('sv-SE'); }
function plusDays(value, days) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function persistAndRender() { save(); render(); }

function render() {
  const p = current();
  if (!p) return;
  workspace.currentId = p.id;
  $('project-picker').innerHTML = workspace.projects.map(project => `<option value="${escape(project.id)}">${escape(project.name)}</option>`).join('');
  $('project-picker').value = p.id;
  $('project-name').value = p.name;
  $('project-start').value = p.startDate;
  $('target-ga').value = p.targetGA;
  let tasks;
  try { tasks = schedule(p); } catch (error) { notice(`排期无法计算：${error.message}`); tasks = p.tasks.map(t => ({ ...t, startDate: '—', endDate: '—' })); }
  const completed = p.tasks.filter(t => t.status === '已完成').length;
  const percent = p.tasks.length ? Math.round(completed / p.tasks.length * 100) : 0;
  $('progress').textContent = `${percent}%`;
  $('progress-count').textContent = `${completed} / ${p.tasks.length} 节点`;
  $('progress-bar').style.width = `${percent}%`;
  const ga = tasks.find(t => t.name === '上架开售') || tasks.at(-1);
  $('ga-date').textContent = ga?.endDate || '—';
  $('ga-target').textContent = `目标：${p.targetGA}`;
  const atRisk = Boolean(ga && ga.endDate > p.targetGA);
  $('risk-title').textContent = !ga ? '暂无排期' : atRisk ? '红色预警：GA 风险' : '当前目标可达';
  $('risk-detail').textContent = !ga ? '添加任务后显示风险' : atRisk ? '标准预计已晚于目标日期' : '按当前标准预计可以如期完成';
  try {
    const proposal = optimize(p);
    $('proposal-copy').textContent = !atRisk ? '标准排期已达目标；无需压缩。' : proposal.changes.length ? `可压缩 ${proposal.changes.length} 个未开始节点；候选 GA ${proposal.gaDate}，${proposal.feasible ? '可达到目标' : '仍无法达到目标'}。此建议尚未采纳。` : '没有可压缩的未开始节点，当前目标可能无法达成。';
    $('proposal-count').textContent = proposal.changes.length ? `${proposal.changes.length} 项候选调整` : '未采纳建议';
  } catch { $('proposal-copy').textContent = '请先修复任务依赖，再生成排期建议。'; }

  const filter = $('status-filter').value;
  const phases = [...new Set(p.tasks.map(t => t.phase))];
  $('phase-list').innerHTML = phases.map(phase => {
    const phaseTasks = tasks.filter(t => t.phase === phase && (filter === 'all' || t.status === filter));
    if (!phaseTasks.length) return '';
    return `<details class="phase" open><summary><span>${escape(phase)}</span><span class="phase-count">${phaseTasks.length} 个任务</span></summary><div class="table-wrap"><table><thead><tr><th>任务 / 流程</th><th>标准预测</th><th>实际开始</th><th>实际完成</th><th>标准耗时</th><th>极限耗时</th><th>状态</th><th>延期天数</th></tr></thead><tbody>${phaseTasks.map(taskRow).join('')}</tbody></table></div></details>`;
  }).join('') || '<p class="empty">当前筛选下没有任务。</p>';
}

function taskRow(t) {
  const id = escape(t.id);
  const field = (name, input) => `<td>${input.replace('FIELD', `data-field="${name}" data-id="${id}"`)}</td>`;
  return `<tr><td><strong>${escape(t.name)}</strong><span class="sub">${escape((t.dependencies || []).join('、') || '无前置任务')}</span><select aria-label="${escape(t.name)}流转方式" data-field="flowType" data-id="${id}"><option ${t.flowType === '串行' ? 'selected' : ''}>串行</option><option ${t.flowType === '并行' ? 'selected' : ''}>并行</option></select></td><td>${escape(t.startDate)} → <b class="${t.endDate > current().targetGA ? 'risk-late' : ''}">${escape(t.endDate)}</b></td>${field('actualStartDate', `<input FIELD aria-label="${escape(t.name)}实际开始" type="date" value="${escape(t.actualStartDate || '')}">`)}${field('actualEndDate', `<input FIELD aria-label="${escape(t.name)}实际完成" type="date" value="${escape(t.actualEndDate || '')}">`)}${field('standardDuration', `<input FIELD aria-label="${escape(t.name)}标准耗时" type="number" min="1" value="${escape(t.standardDuration)}">`)}${field('limitDuration', `<input FIELD aria-label="${escape(t.name)}极限耗时" type="number" min="1" value="${escape(t.limitDuration)}">`)}${field('status', `<select FIELD aria-label="${escape(t.name)}状态">${['未开始', '进行中', '已完成', '延期'].map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}${field('delayDays', `<input FIELD aria-label="${escape(t.name)}延期工作日" type="number" min="0" value="${escape(t.delayDays || 0)}">`)}</tr>`;
}

function download(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function init() {
  seed = await fetch('./seed.json').then(r => r.json());
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored?.version === 1 && validateImport(stored).ok) workspace = stored;
  } catch { /* start with fresh demo */ }
  if (!workspace.projects.length) {
    const project = makeProject('项目管理', '2026-10-26', '2027-05-11', seed);
    workspace.projects.push(project); workspace.currentId = project.id; save();
  }
  render();
}

$('project-picker').addEventListener('change', e => { workspace.currentId = e.target.value; persistAndRender(); });
$('new-project').addEventListener('click', () => {
  dialogMode = 'project';
  $('dialog-title').textContent = '新建项目';
  $('dialog-phase-label').hidden = true;
  $('dialog-name').value = '';
  $('edit-dialog').showModal();
  $('dialog-name').focus();
});
for (const [id, field] of [['project-name', 'name'], ['project-start', 'startDate'], ['target-ga', 'targetGA']]) {
  $(id).addEventListener('change', e => {
    const value = e.target.value.trim();
    try {
      const draft = { ...current(), [field]: value };
      if (!draft.name || !draft.startDate || !draft.targetGA) throw new Error('项目名称和日期不能为空');
      if (field !== 'name') makeProject(draft.name, draft.startDate, draft.targetGA);
      current()[field] = value;
      persistAndRender();
    } catch (error) { notice(error.message); render(); }
  });
}
$('status-filter').addEventListener('change', render);
$('phase-list').addEventListener('change', e => {
  const input = e.target.closest('[data-field]');
  if (!input) return;
  const task = current().tasks.find(t => t.id === input.dataset.id);
  if (!task) return;
  const field = input.dataset.field;
  const numeric = ['standardDuration', 'limitDuration', 'delayDays'].includes(field);
  const value = numeric ? Number(input.value) : input.value;
  if (numeric && (!Number.isInteger(value) || value < (field === 'delayDays' ? 0 : 1))) { notice('工期必须为正整数，延期不能为负数。'); render(); return; }
  if (field === 'standardDuration' && value < task.limitDuration || field === 'limitDuration' && value > task.standardDuration) { notice('极限耗时不能超过标准耗时。'); render(); return; }
  if (field === 'actualEndDate' && value && task.actualStartDate && value < task.actualStartDate) { notice('实际完成不能早于实际开始。'); render(); return; }
  task[field] = value;
  if (field === 'status' && value === '已完成' && !task.actualEndDate) { task.status = '未开始'; notice('请先填写实际完成日期，再标记已完成。'); render(); return; }
  persistAndRender();
});
$('export-project').addEventListener('click', () => download(`${current().name || '项目'}-ipd.json`, JSON.stringify({ version: 1, projects: [current()], currentId: current().id }, null, 2)));
$('import-project').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  const result = validateImport(await file.text());
  e.target.value = '';
  if (!result.ok) { notice(`导入失败：${result.error}`); return; }
  const imported = result.data.projects.map(p => ({ ...p, id: crypto.randomUUID(), tasks: p.tasks.map(t => ({ ...t })) }));
  workspace.projects.push(...imported);
  workspace.currentId = imported[0].id;
  persistAndRender();
});
$('add-task').addEventListener('click', () => {
  dialogMode = 'task';
  $('dialog-title').textContent = '添加任务';
  $('dialog-phase-label').hidden = false;
  $('dialog-name').value = '';
  $('edit-dialog').showModal();
  $('dialog-name').focus();
});
$('dialog-cancel').addEventListener('click', () => $('edit-dialog').close());
$('edit-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('dialog-name').value.trim();
  if (!name) return;
  if (dialogMode === 'project') {
    const project = makeProject(name, today(), plusDays(today(), 200), seed.map(t => ({ ...t })));
    workspace.projects.push(project); workspace.currentId = project.id;
  } else {
    current().tasks.push({ id: crypto.randomUUID(), name, phase: $('dialog-phase').value.trim() || '自定义', dependencies: [], flowType: '串行', standardDuration: 1, limitDuration: 1, status: '未开始', actualStartDate: '', actualEndDate: '' });
  }
  $('edit-dialog').close();
  persistAndRender();
});
init().catch(error => notice(`应用启动失败：${error.message}`));
