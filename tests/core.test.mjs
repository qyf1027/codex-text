import test from 'node:test';
import assert from 'node:assert/strict';
import { addWorkdays, makeProject, schedule, optimize, validateImport } from '../core.mjs';

test('one day includes the start and Friday successor begins Monday', () => {
  assert.equal(addWorkdays('2026-10-26', 1), '2026-10-26');
  assert.equal(addWorkdays('2026-10-30', 2), '2026-11-02');
});

test('serial and parallel predecessors differ', () => {
  const project = makeProject('演示', '2026-10-26', '2026-11-20', [
    { id: 'a', name: 'A', phase: 'TR1', dependencies: [], flowType: '串行', standardDuration: 3, limitDuration: 1 },
    { id: 'b', name: 'B', phase: 'TR1', dependencies: ['a'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
    { id: 'c', name: 'C', phase: 'TR1', dependencies: ['a'], flowType: '并行', standardDuration: 1, limitDuration: 1 },
  ]);
  const tasks = schedule(project);
  assert.equal(tasks.find(t => t.id === 'a').endDate, '2026-10-28');
  assert.equal(tasks.find(t => t.id === 'b').startDate, '2026-10-29');
  assert.equal(tasks.find(t => t.id === 'c').startDate, '2026-10-26');
});

test('import rejects malformed projects', () => {
  assert.equal(validateImport('{bad').ok, false);
  assert.equal(validateImport(JSON.stringify({ projects: [{ name: '' }] })).ok, false);
});

test('optimization is a proposal and does not alter actual or project tasks', () => {
  const project = makeProject('演示', '2026-10-26', '2026-10-28', [
    { id: 'a', name: 'A', phase: 'TR1', dependencies: [], flowType: '串行', standardDuration: 5, limitDuration: 3 },
    { id: 'b', name: '上架开售', phase: 'GA', dependencies: ['a'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
  ]);
  const proposal = optimize(project);
  assert.equal(proposal.tasks[0].duration, 3);
  assert.equal(project.tasks[0].standardDuration, 5);
  assert.equal(proposal.feasible, false);
});

test('optimization leaves unrelated tasks at standard duration', () => {
  const project = makeProject('演示', '2026-10-26', '2026-10-27', [
    { id: 'a', name: 'A', phase: 'TR1', dependencies: [], flowType: '串行', standardDuration: 5, limitDuration: 3 },
    { id: 'x', name: '无关任务', phase: 'TR1', dependencies: [], flowType: '串行', standardDuration: 8, limitDuration: 1 },
    { id: 'ga', name: '上架开售', phase: 'GA', dependencies: ['a'], flowType: '串行', standardDuration: 1, limitDuration: 1 },
  ]);
  assert.deepEqual(optimize(project).changes.map(c => c.id), ['a']);
});
