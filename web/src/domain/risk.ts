import type { Forecast } from './forecast';
import type { RiskEvent } from './model';
import { lateWorkdays } from './calendar';

export function reconcileRiskHistory(events: RiskEvent[], forecast: Forecast, at = new Date().toISOString()): RiskEvent[] {
  const active = new Map(forecast.risks.map(risk => [`${risk.type}:${risk.sourceId}`, risk]));
  const history = events.map(event => {
    if (event.state === 'resolved') return event;
    const current = active.get(`${event.type}:${event.sourceId}`);
    if (!current) return { ...event, state: 'resolved' as const, resolvedAt: event.resolvedAt || at, resolutionNote: event.resolutionNote || '当前排期重算已不再触发该风险', lastEvaluatedAt: at };
    return { ...event, latestSnapshot: current.detail, lastEvaluatedAt: at };
  });
  for (const risk of forecast.risks) if (!history.some(event => event.type === risk.type && event.sourceId === risk.sourceId && event.state !== 'resolved')) {
    const gate = forecast.gates[risk.sourceId];
    history.push({ id: crypto.randomUUID(), type: risk.type, sourceId: risk.sourceId, firstDetectedAt: at, lastEvaluatedAt: at, state: 'open', initialSnapshot: risk.detail, initialDelayWorkdays: gate?.date && ['GA_DELAY', 'HARD_DEADLINE'].includes(risk.type) ? lateWorkdays(gate.targetDate, gate.date) : undefined, latestSnapshot: risk.detail });
  }
  return history;
}
