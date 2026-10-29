import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}/`;
try {
{
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base);
  await page.getByRole('heading', { name: '项目管理' }).waitFor();
  await page.getByRole('button', { name: '数据管理' }).click();
  await page.getByRole('textbox', { name: '新项目名称' }).fill('验收 A');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: '任务与成果' }).click();
  await page.getByRole('textbox', { name: '新任务' }).fill('设计 A');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.getByRole('combobox', { name: '所属任务' }).selectOption({ label: '设计 A' });
  await page.getByRole('textbox', { name: '新成果' }).fill('方案 A');
  await page.getByRole('button', { name: '添加成果' }).click();
  await page.getByRole('combobox', { name: '设计 A状态' }).selectOption('done');
  assert.ok(await page.getByRole('dialog', { name: '确认完成任务' }).getByText('必需成果未交付：方案 A').isVisible());
  await page.getByRole('button', { name: '确认实际完成' }).click();
  assert.match(await page.getByRole('alert').innerText(), /必需成果尚未交付/);
  await page.getByRole('textbox', { name: '方案 A实际交付日期' }).fill('2026-10-29');
  await page.getByRole('combobox', { name: '方案 A状态' }).selectOption('delivered');
  await page.getByRole('button', { name: '确认实际完成' }).click();
  assert.equal(await page.getByRole('combobox', { name: '设计 A状态' }).inputValue(), 'done');

  await page.getByRole('button', { name: '数据管理' }).click();
  await page.getByRole('textbox', { name: '新项目名称' }).fill('验收 B');
  await page.getByRole('button', { name: '新建', exact: true }).click();
  await page.getByRole('button', { name: '任务与成果' }).click();
  await page.getByRole('textbox', { name: '新任务' }).fill('打样 B');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.getByRole('button', { name: '跨项目依赖' }).click();
  await page.getByRole('combobox', { name: '前置成果' }).selectOption({ label: '验收 A / 方案 A' });
  await page.getByRole('combobox', { name: '目标' }).selectOption({ label: '验收 B / 打样 B' });
  await page.getByRole('button', { name: '建立依赖' }).click();
  assert.match(await page.locator('main').innerText(), /方案 A → 打样 B/);

  await page.getByRole('combobox', { name: '切换项目' }).selectOption({ label: '验收 A' });
  await page.getByRole('button', { name: '任务与成果' }).click();
  await page.getByRole('textbox', { name: '方案 A失效原因' }).fill('试验未通过');
  await page.getByRole('combobox', { name: '方案 A状态' }).selectOption('invalidated');
  assert.equal(await page.getByRole('combobox', { name: '设计 A状态' }).inputValue(), 'done');
  await page.getByRole('button', { name: '跨项目依赖' }).click();
  assert.match(await page.locator('main').innerText(), /成果变更影响处理/);
  assert.match(await page.locator('main').innerText(), /验收 B \/ 打样 B/);

  await page.getByRole('button', { name: '数据管理' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出完整工作区' }).click()]);
  assert.match(download.suggestedFilename(), /ipd-workspace\.json/);
  await page.reload();
  await page.getByRole('combobox', { name: '切换项目' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: '切换项目' }).inputValue(), await page.getByRole('combobox', { name: '切换项目' }).locator('option', { hasText: '验收 A' }).getAttribute('value'));
  assert.deepEqual(errors, []);
  console.log('browser-smoke: pass (completion, cross-project dependency, invalidation, backup, refresh)');
} finally {
  await browser.close();
}
}
{
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext();
const page = await context.newPage();
const fixture = { schemaVersion: 1, id: 'ws-resource', currentProjectId: 'p2', projects: [
  { id: 'p1', name: '高优先级 A', startDate: '2026-11-02', priority: 'high', status: 'active', stages: [{ id: 's1', name: 'TR1', order: 0 }], gates: [{ id: 'g1', name: 'A GA', targetDate: '2026-11-13', deadlineType: 'soft', requiredTaskIds: ['t1'], requiredDeliverableIds: [] }], tasks: [{ id: 't1', stageId: 's1', title: '测试 A', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }] },
  { id: 'p2', name: '中优先级 B', startDate: '2026-11-02', priority: 'medium', status: 'active', stages: [{ id: 's2', name: 'TR1', order: 0 }], gates: [{ id: 'g2', name: 'B GA', targetDate: '2026-11-03', deadlineType: 'hard', requiredTaskIds: ['t2'], requiredDeliverableIds: [] }], tasks: [{ id: 't2', stageId: 's2', title: '测试 B', status: 'not_started', standardDurationDays: 2, minimumDurationDays: 1, deliverables: [] }] },
], dependencies: [], resources: [{ id: 'r', name: '设备', exclusive: true }], bookings: [{ id: 'b1', resourceId: 'r', taskId: 't1', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 2 }, { id: 'b2', resourceId: 'r', taskId: 't2', anchor: 'fixed_date', fixedStartDate: '2026-11-02', durationWorkdays: 2 }], planRevisions: [], riskEvents: [] };
try {
  await page.goto(base);
  await page.getByText('已保存到此浏览器').waitFor();
  await page.evaluate(async workspace => {
    await new Promise((resolve, reject) => { const open = indexedDB.open('ipd-smart-tracker-v1', 1); open.onsuccess = () => { const db = open.result; const tx = db.transaction('workspace', 'readwrite'); tx.objectStore('workspace').put(workspace, 'main'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; open.onerror = () => reject(open.error); });
  }, fixture);
  await page.reload();
  await page.getByRole('combobox', { name: '切换项目' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: '切换项目' }).inputValue(), 'p2');
  await page.getByRole('button', { name: '关键资源' }).click();
  await page.getByRole('button', { name: '设备 · 比较两种执行顺序' }).click();
  const good = page.getByText('当前约束内可行', { exact: true });
  const bad = page.getByText('当前约束内不可行', { exact: true });
  assert.equal(await good.count(), 1);
  assert.equal(await bad.count(), 1);
  await page.getByRole('button', { name: '确认整体采纳' }).first().click();
  await page.getByText('已保存到此浏览器').waitFor();
  const saved = await page.evaluate(async () => new Promise((resolve, reject) => { const open = indexedDB.open('ipd-smart-tracker-v1', 1); open.onsuccess = () => { const db = open.result; const request = db.transaction('workspace', 'readonly').objectStore('workspace').get('main'); request.onsuccess = () => { db.close(); resolve(request.result); }; request.onerror = () => reject(request.error); }; open.onerror = () => reject(open.error); }));
  assert.equal(saved.planRevisions.length, 1);
  assert.equal(saved.bookings.find(item => item.id === 'b1').fixedStartDate, '2026-11-04');
  assert.equal(saved.bookings.find(item => item.id === 'b2').fixedStartDate, '2026-11-02');
  console.log('resource-smoke: pass (two alternatives, hard deadline, atomic adoption)');
} finally { await browser.close(); }
}

} finally { await server.close(); }
