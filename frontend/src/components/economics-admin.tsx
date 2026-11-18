'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ECONOMICS_UPDATED, formatEconomicsMoney, getEconomicsReport, refreshEconomics, type EconomicsAggregate, type EconomicsOperation, type EconomicsReport, type EconomicsTokens } from '@/lib/economics';
import CreditMeter from './credit-meter';
import Icon from './icon';
import ResearchScoutMark from './research-scout-mark';
import Tooltip from './tooltip';
import styles from './economics-admin.module.css';

const count = (value: number | null | undefined) => value == null ? 'Unavailable' : value.toLocaleString();
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—';
const duration = (value: number | null) => value == null ? 'Unavailable' : value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(2)} s`;
function tokenSubtotal(row: EconomicsAggregate, key: keyof EconomicsTokens) {
  if (!row.invocations) return '0';
  const coverage = row.token_coverage?.[key];
  if (coverage == null) return `${count(row[key])} recorded · coverage unavailable`;
  const missing = Math.max(0, row.invocations - coverage);
  return missing ? `${count(row[key])} known · ${count(missing)} unavailable` : count(row[key]);
}

function Breakdown({ title, rows, label }: { title: string; rows: EconomicsAggregate[]; label: (row: EconomicsAggregate, index: number) => string }) {
  return <section className={styles.panel}>
    <h2>{title}</h2>
    <div className={styles.tableScroll}><table className={styles.table}>
      <thead><tr><th scope="col">{title.replace('By ', '')}</th><th scope="col">Calls</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Cached input</th><th scope="col">Reasoning</th><th scope="col">Missing usage</th><th scope="col">Known est. USD</th></tr></thead>
      <tbody>{rows.length ? rows.map((row, index) => <tr key={label(row, index)}><th scope="row">{label(row, index)}</th><td>{count(row.invocations)}</td><td>{tokenSubtotal(row, 'input_tokens')}</td><td>{tokenSubtotal(row, 'output_tokens')}</td><td>{tokenSubtotal(row, 'cached_input_tokens')}</td><td>{tokenSubtotal(row, 'reasoning_tokens')}</td><td>{count(row.unknown_usage)}</td><td>{formatEconomicsMoney(row.estimated_cost_usd)}</td></tr>) : <tr><td colSpan={8} className={styles.empty}>No model calls recorded for this scope.</td></tr>}</tbody>
    </table></div>
  </section>;
}

function Operation({ operation }: { operation: EconomicsOperation }) {
  return <details className={styles.operation}>
    <summary>
      <span className={styles.operationLead}><strong>{operation.purpose.replace(/_/g, ' ')}</strong><small>{timestamp(operation.created_at)}</small></span>
      <span className={styles.status} data-status={operation.status}>{operation.status.replace(/_/g, ' ')}</span>
      <span className={styles.operationUsage}>{operation.used_credits} used · {operation.reserved_credits} reserved</span>
      <span className={styles.operationCost}>{formatEconomicsMoney(operation.estimated_cost_usd)}</span>
      <Icon name="chevron" />
    </summary>
    <div className={styles.operationBody}>
      <dl className={styles.record}>
        <div><dt>Operation ID</dt><dd><code>{operation.operation_id}</code></dd></div>
        <div><dt>Model</dt><dd>{operation.model || 'Not dispatched'}</dd></div>
        <div><dt>Admission day</dt><dd>{operation.day}</dd></div>
        <div><dt>Window ID</dt><dd><code>{operation.window_id}</code></dd></div>
        <div><dt>Completed</dt><dd>{timestamp(operation.completed_at)}</dd></div>
        <div><dt>Maximum calls reserved</dt><dd>{operation.max_invocations}</dd></div>
        <div><dt>Initial cost reservation</dt><dd>{formatEconomicsMoney(operation.reservation_usd)}</dd></div>
        <div><dt>Known estimated cost</dt><dd>{formatEconomicsMoney(operation.known_cost_usd)}</dd></div>
        <div><dt>Unresolved cost hold</dt><dd>{formatEconomicsMoney(operation.unknown_held_usd)}</dd></div>
      </dl>
      <div className={styles.tableScroll}><table className={styles.table}>
        <caption>Model invocations</caption>
        <thead><tr><th scope="col">Step / role</th><th scope="col">Model</th><th scope="col">Outcome</th><th scope="col">Dispatched</th><th scope="col">Settled</th><th scope="col">Duration</th><th scope="col">Input</th><th scope="col">Output</th><th scope="col">Cached input</th><th scope="col">Reasoning</th><th scope="col">Est. USD</th><th scope="col">Cost basis</th></tr></thead>
        <tbody>{operation.invocations.length ? operation.invocations.map(invocation => <tr key={`${invocation.step}:${invocation.role}`}>
          <th scope="row">{invocation.step} · {invocation.role}</th><td>{invocation.model}</td><td><span className={styles.status} data-status={invocation.status}>{invocation.status.replace(/_/g, ' ')}</span></td><td>{timestamp(invocation.dispatched_at)}</td><td>{timestamp(invocation.settled_at)}</td><td>{duration(invocation.duration_ms)}</td><td>{count(invocation.input_tokens)}</td><td>{count(invocation.output_tokens)}</td><td>{count(invocation.cached_input_tokens)}</td><td>{count(invocation.reasoning_tokens)}</td><td>{formatEconomicsMoney(invocation.estimated_cost_usd)}</td><td><code>{invocation.cost_basis_version}</code></td>
        </tr>) : <tr><td colSpan={12} className={styles.empty}>No hosted model call was dispatched for this operation.</td></tr>}</tbody>
      </table></div>
    </div>
  </details>;
}

export default function EconomicsAdmin() {
  const [day, setDay] = useState('');
  const [cursors, setCursors] = useState<string[]>([]);
  const [report, setReport] = useState<EconomicsReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [updated, setUpdated] = useState<number | null>(null);
  const sequence = useRef(0);
  const cursor = cursors.at(-1);

  useEffect(() => {
    let live = true;
    let running = false;
    const fetchReport = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      const requestId = ++sequence.current;
      try {
        const next = await getEconomicsReport({ day, cursor });
        if (live && requestId === sequence.current) { setReport(next); setError(''); setUpdated(Date.now()); }
      } catch (failure) {
        if (live && requestId === sequence.current) setError(failure instanceof Error ? failure.message : 'Economics could not be loaded.');
      } finally {
        running = false;
        if (live && requestId === sequence.current) setLoading(false);
      }
    };
    setLoading(true); setReport(null); setError(''); setUpdated(null);
    void fetchReport();
    const refresh = () => void fetchReport();
    window.addEventListener('focus', refresh);
    window.addEventListener(ECONOMICS_UPDATED, refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(ECONOMICS_UPDATED, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [day, cursor, revision]);

  function changeDay(value: string) { setDay(value); setCursors([]); }

  return <div className={styles.shell}>
    <a href="#economics-content" className="skip-link">Skip to economics</a>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}><span style={{background: 'transparent'}}><ResearchScoutMark size={28} /></span>Research Scout</Link>
      <div className={styles.headerActions}><Link href="/app" className={styles.back}><Icon name="arrow" />Workspace</Link><CreditMeter /></div>
    </header>
    <main id="economics-content" className={styles.main}>
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}><Icon name="database" />Admin · Local user</span><h1>Model economics</h1><p>Daily credits, model calls and retained usage history.</p></div>
        <Tooltip content="Reload credits and economics. This does not make a model call."><button className={styles.refresh} type="button" onClick={() => { setRevision(value => value + 1); void refreshEconomics(); }} disabled={loading}><Icon name={loading ? 'spinner' : 'refresh'} />Refresh</button></Tooltip>
      </div>

      <div className={styles.filters}>
        <div className={styles.scope}><Icon name="calendar" /><label htmlFor="economics-day">Admission day</label><input id="economics-day" type="date" value={day} onChange={event => changeDay(event.target.value)} /><button type="button" disabled={!day} onClick={() => changeDay('')}>All history</button></div>
        <span className={styles.sync} role="status">{loading ? 'Loading usage…' : error ? 'Update unavailable' : updated ? `Updated ${new Date(updated).toLocaleTimeString()}` : ''}</span>
      </div>
      <p className={styles.policy}>1 credit per dispatched hosted model call, including query planning, review and answers. Provider searches and local ranking use 0 credits. Daily allowance resets at midnight {report?.economics.timezone || 'in the configured local timezone'}. Manual resets retain earlier windows and all cost history.</p>
      {error && <div className={styles.error} role="alert"><Icon name="alert" /><span>{report ? 'Showing the last confirmed report. ' : ''}{error}</span></div>}

      {loading && !report ? <div className={styles.loading} role="status"><Icon name="spinner" />Loading recorded model usage…</div> : report && <>
        <div className={styles.cards}>
          <article className={styles.card}><span>Model calls</span><strong>{count(report.totals.invocations)}</strong><small>{count(report.totals.operations)} research operations</small></article>
          <article className={styles.card}><span>Recorded input / output tokens</span><strong>{count(report.totals.input_tokens)} <em>/</em> {count(report.totals.output_tokens)}</strong><small>Input: {tokenSubtotal(report.totals, 'input_tokens')} · Output: {tokenSubtotal(report.totals, 'output_tokens')}<br />Cached: {tokenSubtotal(report.totals, 'cached_input_tokens')} · Reasoning: {tokenSubtotal(report.totals, 'reasoning_tokens')}</small></article>
          <article className={styles.card}><span>Known estimated model cost</span><strong>{formatEconomicsMoney(report.totals.estimated_cost_usd)}</strong><small>{count(report.totals.cost_coverage ?? report.totals.known_usage)} calls with recorded estimates</small></article>
          <article className={`${styles.card} ${styles.warning}`}><span>Unresolved cost holds</span><strong>{formatEconomicsMoney(report.totals.unknown_held_usd)}</strong><small>{count(report.totals.unknown_usage)} calls with missing usage</small></article>
        </div>
        <p className={styles.costNote}><Icon name="info" />Costs use retained app accounting assumptions; they are not provider invoices or verified current pricing. Each call retains its cost-basis version. Token totals show recorded subtotals and their coverage; missing usage stays unavailable. Cached and reasoning tokens are subsets of input and output respectively; they are not added twice. Unresolved holds remain visible until reconciled.</p>

        <div className={styles.breakdowns}>
          <Breakdown title="By role" rows={report.by_role} label={(_, index) => report.by_role[index].role} />
          <Breakdown title="By model" rows={report.by_model} label={(_, index) => report.by_model[index].model} />
        </div>
        <details className={styles.history}>
          <summary><Icon name="clock" /><strong>Daily and hourly history</strong><span>{day || 'All recorded days'}</span><Icon name="chevron" /></summary>
          <div className={styles.historyBody}>
            <Breakdown title="By admission day" rows={report.by_day} label={(_, index) => report.by_day[index].day} />
            <Breakdown title="By dispatch hour (UTC)" rows={report.by_hour} label={(_, index) => report.by_hour[index].hour} />
          </div>
        </details>
        <section className={styles.operations}>
          <div className={styles.sectionHeading}><div><h2>Operations</h2><p>{day ? `Admitted on ${day}` : 'All recorded budget windows'} · Page {cursors.length + 1} · {report.operations.length} shown</p></div><span className={styles.chip}>Content-free audit</span></div>
          {report.operations.length ? report.operations.map(operation => <Operation key={operation.operation_id} operation={operation} />) : <p className={styles.empty}>No model operations recorded for this scope.</p>}
          <div className={styles.pagination}>
            <button type="button" disabled={!cursors.length || loading} onClick={() => setCursors(previous => previous.slice(0, -1))}>Previous</button>
            <span>25 operations per page</span>
            <button type="button" disabled={!report.next_cursor || loading} onClick={() => { const next = report.next_cursor; if (next) setCursors(previous => [...previous, next]); }}>Next</button>
          </div>
        </section>
        <footer className={styles.footer}>Accounting policy <code>{report.economics.policy_version}</code> · Cost basis <code>{report.economics.cost_basis_version}</code> · Reports contain call metadata; prompts and answers are excluded.</footer>
      </>}
    </main>
  </div>;
}
