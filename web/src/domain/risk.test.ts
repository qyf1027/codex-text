import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRiskHistory } from './risk';
import type { Forecast } from './forecast';

const forecast = (risks: Forecast['risks']): Forecast => ({ tasks: {}, deliverables: {}, gates: {}, risks });

test('repeat evaluation preserves first risk occurrence and user acceptance', () => {
  const risk = { type: 'GA_DELAY' as const, sourceId: 'ga', detail: '预计晚 3 天' };
  const first = reconcileRiskHistory([], forecast([risk]), '2026-10-26T00:00:00Z');
  first[0].handlingDecision = 'accepted';
  const second = reconcileRiskHistory(first, forecast([{ ...risk, detail: '预计晚 4 天' }]), '2026-10-27T00:00:00Z');
  assert.equal(second.length, 1);
  assert.equal(second[0].firstDetectedAt, '2026-10-26T00:00:00Z');
  assert.equal(second[0].initialSnapshot, '预计晚 3 天');
  assert.equal(second[0].latestSnapshot, '预计晚 4 天');
  assert.equal(second[0].handlingDecision, 'accepted');
  assert.equal(second[0].state, 'open');
});

test('resolved risk remains historical and recurrence opens a new event', () => {
  const risk = { type: 'GA_DELAY' as const, sourceId: 'ga', detail: '预计晚 3 天' };
  const first = reconcileRiskHistory([], forecast([risk]), '2026-10-26T00:00:00Z');
  const cleared = reconcileRiskHistory(first, forecast([]), '2026-10-27T00:00:00Z');
  assert.equal(cleared[0].state, 'resolved');
  assert.equal(cleared[0].resolvedAt, '2026-10-27T00:00:00Z');
  const recurring = reconcileRiskHistory(cleared, forecast([risk]), '2026-10-28T00:00:00Z');
  assert.equal(recurring.length, 2);
  assert.equal(recurring[0].state, 'resolved');
  assert.equal(recurring[1].state, 'open');
});

test('first GA delay preserves the original number of late workdays', () => {
  const input = forecast([{ type: 'GA_DELAY', sourceId: 'ga', detail: '预计 2026-11-04，目标 2026-10-30' }]);
  input.gates.ga = { date: '2026-11-04', targetDate: '2026-10-30', blocked: false };
  const events = reconcileRiskHistory([], input, '2026-10-29T00:00:00Z');
  assert.equal(events[0].initialDelayWorkdays, 3);
});
