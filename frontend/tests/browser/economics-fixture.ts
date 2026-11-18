import type { Economics, EconomicsReport } from '../../src/lib/economics';

/** Authored accounting, never inferred from real user state or provider billing. */
export function economicsFixture(patch: Partial<Economics> = {}): Economics {
  return {
    policy_version: 'scout-daily-invocations-v1', daily_budget: 100,
    used: 0, reserved: 0, remaining: 100, window_id: 'fixture-credit-window-1',
    day: '2026-11-14', timezone: 'America/New_York', reset_at: '2026-11-15T05:00:00+00:00',
    epoch: 0, revision: 1, invocations: { total: 0, known_usage: 0, unknown_usage: 0 },
    tokens: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0 },
    estimated_cost_usd: 0, unknown_held_usd: 0, cost_basis_version: 'scout-legacy-estimate-v1',
    ...patch,
  };
}

export function economicsReportFixture(economics = economicsFixture()): EconomicsReport {
  return {
    economics,
    totals: { operations: 0, invocations: 0, known_usage: 0, unknown_usage: 0, unknown_held_usd: 0, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0, estimated_cost_usd: 0 },
    by_role: [], by_model: [], by_day: [], by_hour: [], operations: [], next_cursor: null,
  };
}
