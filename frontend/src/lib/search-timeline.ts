import { isActive, normalStatus } from './api';
import type { ExplorationTurn, TimingSpan } from './conversations';

export type TimelineRow = {
  span: TimingSpan;
  start: number | null;
  end: number | null;
  duration: number | null;
  active: boolean;
};
export type TimelineContext = Pick<ExplorationTurn, 'status' | 'created_at' | 'completed_at' | 'timing_spans' | 'retrieval'>;

const timestamp = (value?: string) => {
  const number = value ? Date.parse(value) : NaN;
  return Number.isFinite(number) ? number : null;
};
const working = (status: string) => isActive(status) || ['started', 'active', 'in_progress', 'prepared', 'dispatched'].includes(normalStatus(status));

/** Intervals share the turn's wall clock. Overlap is unioned, never added. */
export function searchTimeline(turn?: TimelineContext, now?: number) {
  const origin = timestamp(turn?.created_at);
  const activeTurn = !!turn && isActive(turn.status);
  const finish = activeTurn ? Number.isFinite(now) ? now! : null : timestamp(turn?.completed_at);
  const wall = origin !== null && finish !== null && finish >= origin ? finish - origin : null;
  const rows: TimelineRow[] = (turn?.timing_spans || []).slice(0, 200).map(span => {
    const began = timestamp(span.started_at), ended = timestamp(span.completed_at);
    const active = activeTurn && working(span.status) && ended === null;
    const start = origin !== null && began !== null && began >= origin ? began - origin : null;
    const endClock = ended ?? (active ? finish : null);
    const end = start !== null && endClock !== null && began !== null && endClock >= began ? endClock - origin! : null;
    const measured = typeof span.duration_ms === 'number' && Number.isFinite(span.duration_ms) && span.duration_ms >= 0 ? span.duration_ms : null;
    const duration = measured ?? (start !== null && end !== null ? end - start : null);
    return { span, start, end, duration, active };
  }).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  const intervals = rows.flatMap(row => row.start !== null && row.end !== null && wall !== null && row.start <= wall ? [[row.start, Math.min(row.end, wall)]] : []).sort((a, b) => a[0] - b[0]);
  let covered = 0, previousEnd = 0;
  for (const [start, end] of intervals) {
    covered += Math.max(0, end - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, end);
  }
  return { rows, wall, covered: wall !== null && intervals.length ? covered : null, unattributed: wall !== null && intervals.length ? Math.max(0, wall - covered) : null };
}
