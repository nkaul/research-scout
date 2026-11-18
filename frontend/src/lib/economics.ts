'use client';

import { useSyncExternalStore } from 'react';
import { ApiError, request } from './api';

export type EconomicsTokens = {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
};

export type Economics = {
  policy_version: string;
  daily_budget: number;
  used: number;
  reserved: number;
  remaining: number;
  window_id: string;
  day: string;
  timezone: string;
  reset_at: string;
  epoch: number;
  revision: number;
  invocations: { total: number; known_usage: number; unknown_usage: number };
  tokens: EconomicsTokens;
  token_coverage?: EconomicsTokens;
  cost_coverage?: number;
  estimated_cost_usd: number;
  unknown_held_usd: number;
  cost_basis_version: string;
};

export type EconomicsAggregate = EconomicsTokens & {
  invocations: number;
  estimated_cost_usd: number;
  unknown_usage: number;
  token_coverage?: EconomicsTokens;
  cost_coverage?: number;
  totals_basis?: string;
};

export type EconomicsInvocation = {
  step: string | number;
  role: string;
  model: string;
  status: string;
  dispatched_at: string | null;
  settled_at: string | null;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  estimated_cost_usd: number | null;
  cost_basis_version: string;
};

export type EconomicsOperation = {
  operation_id: string;
  purpose: string;
  model: string;
  status: string;
  window_id: string;
  day: string;
  created_at: string;
  completed_at: string | null;
  reserved_credits: number;
  used_credits: number;
  max_invocations: number;
  reservation_usd: number;
  estimated_cost_usd: number | null;
  known_cost_usd: number;
  unknown_held_usd: number;
  invocations: EconomicsInvocation[];
};

export type EconomicsReport = {
  economics: Economics;
  totals: EconomicsAggregate & { operations: number; known_usage: number; unknown_held_usd: number };
  by_role: (EconomicsAggregate & { role: string })[];
  by_model: (EconomicsAggregate & { model: string })[];
  by_day: (EconomicsAggregate & { day: string })[];
  by_hour: (EconomicsAggregate & { hour: string })[];
  operations: EconomicsOperation[];
  next_cursor: string | null;
};

export const ECONOMICS_UPDATED = 'scout:economics-updated';
export const ECONOMICS_BALANCE_CHANGED = 'scout:economics-balance-changed';

export function notifyEconomicsUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ECONOMICS_UPDATED));
}

export function getEconomicsReport({ day, cursor, limit = 25 }: { day?: string; cursor?: string; limit?: number } = {}) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (day) query.set('day', day);
  if (cursor) query.set('cursor', cursor);
  return request<EconomicsReport>(`/admin/economics?${query}`);
}

type EconomicsSnapshot = {
  budget: Economics | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  resetting: boolean;
  lastUpdated: number | null;
};

const initial: EconomicsSnapshot = { budget: null, error: null, loading: true, refreshing: false, resetting: false, lastUpdated: null };
let snapshot: EconomicsSnapshot = initial;
let pending: Promise<Economics | null> | null = null;
let requestSequence = 0;
let latestApplied = 0;
let disconnect: (() => void) | undefined;
const listeners = new Set<() => void>();

function update(patch: Partial<EconomicsSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}

function applyBudget(budget: Economics, sequence: number) {
  const current = snapshot.budget;
  if (sequence < latestApplied || (current && budget.revision < current.revision)) return;
  latestApplied = sequence;
  update({ budget, error: null, loading: false, lastUpdated: Date.now() });
  if (!current || current.window_id !== budget.window_id || current.used !== budget.used || current.reserved !== budget.reserved || current.remaining !== budget.remaining) {
    window.dispatchEvent(new CustomEvent(ECONOMICS_BALANCE_CHANGED, { detail: budget }));
  }
}

/** Read-only refresh. Shared across the header and Admin so concurrent reads are coalesced. */
export function refreshEconomics(): Promise<Economics | null> {
  if (snapshot.resetting) return Promise.resolve(snapshot.budget);
  if (pending) return pending;
  const sequence = ++requestSequence;
  update({ refreshing: true });
  pending = request<Economics>('/economics').then(budget => {
    applyBudget(budget, sequence);
    return budget;
  }).catch(error => {
    if (sequence >= latestApplied) update({ error: error instanceof Error ? error.message : 'Credit allowance could not be refreshed.', loading: false });
    return null;
  }).finally(() => {
    pending = null;
    update({ refreshing: false });
  });
  return pending;
}

/** Only call from the explicit Reset today action. No reads can reset a window. */
export async function resetEconomics(expectedWindowId: string, idempotencyKey: string): Promise<Economics> {
  if (snapshot.resetting) throw new Error('A credit reset is already in progress.');
  const sequence = ++requestSequence;
  latestApplied = sequence; // An older in-flight GET must not overwrite the reset result.
  update({ resetting: true });
  try {
    const budget = await request<Economics>('/economics/reset', {
      method: 'POST',
      body: JSON.stringify({ expected_window_id: expectedWindowId, idempotency_key: idempotencyKey }),
    });
    applyBudget(budget, sequence);
    return budget;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new ApiError(409, 'The allowance changed while this page was open. Its latest balance is being refreshed. Review it before resetting again.');
    }
    throw error;
  } finally {
    update({ resetting: false });
    // Read the canonical window even if a previously completed idempotency key was retried.
    if (pending) await pending;
    await refreshEconomics();
    notifyEconomicsUpdated();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const refresh = () => { if (document.visibilityState !== 'hidden') void refreshEconomics(); };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(ECONOMICS_UPDATED, refresh);
    window.addEventListener('scout:saved-run-updated', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 5_000);
    disconnect = () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(ECONOMICS_UPDATED, refresh);
      window.removeEventListener('scout:saved-run-updated', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { disconnect?.(); disconnect = undefined; }
  };
}

export function useEconomics() {
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}

export function formatEconomicsMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  if (value === 0) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(value);
}
