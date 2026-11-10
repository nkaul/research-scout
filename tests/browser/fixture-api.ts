import type { Page, Route } from '../../frontend/node_modules/@playwright/test';
import type { Snapshot, Source } from '../../frontend/src/lib/api';

export const FIRST_SOURCE: Source = {
  source_ref: 'openalex:fixture-work-1', provider: 'openalex', record_id: 'fixture-work-1',
  title: 'Fixture study: institutional readiness and responsible AI',
  authors: ['Example Researcher', 'Example Collaborator'], year: 2025,
  venue: 'Illustrative research collection', doi: '10.0000/fixture-1',
  url: 'https://example.org/fixture-study-1',
  abstract: 'An authored fixture used to review the discovery workflow. It describes institutional readiness, governance, and faculty support without reporting a real research finding.',
  resource_type: 'article', observed_at: '2026-10-26T12:00:00Z', version: 1,
  mode: 'fixture', branch_ranks: { lexical: 1 }, eligible: true, rank_score: .01,
};
export const SECOND_SOURCE: Source = {
  ...FIRST_SOURCE, source_ref: 'openalex:fixture-work-2', record_id: 'fixture-work-2',
  title: 'Fixture review: translating AI policy into practice', doi: null,
  abstract: null, branch_ranks: { semantic: 1 }, rank_score: .02,
};

export function initialSnapshot(): Snapshot {
  return {
    id: 'fixture-run-1', question: 'Institutional AI readiness in higher education',
    provider: 'openalex', status: 'running', mode: 'fixture', created_at: '2026-10-26T12:00:00Z',
    entities: [], selections: {}, checks: {}, operations: { lexical: { status: 'running' }, semantic: { status: 'running' } },
    warnings: [], usage: { research_attempts: 2, by_provider: { openalex: 2 } },
    revision: 0, cursor: 'fixture:0', summary: null, runtime: { mode: 'fixture' },
    filters: { year_from: 2020, year_to: null },
  };
}

type Host = Window & {
  __publishScout: (snapshot: Snapshot) => void;
  __disconnectScout: () => void;
};

export async function installFixtureApi(page: Page) {
  const state = {
    snapshot: initialSnapshot(),
    starts: 0, details: 0, checks: 0, exports: 0, snapshots: 0,
    conflictNextSelection: false,
    submitted: [] as Record<string, unknown>[],
  };
  await page.addInitScript(() => {
    const streams: MockEventSource[] = [];
    class MockEventSource extends EventTarget {
      url: string; closed = false; readyState = 1;
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(url: string | URL) { super(); this.url = String(url); streams.push(this); queueMicrotask(() => this.onopen?.(new Event('open'))); }
      close() { this.closed = true; this.readyState = 2; }
    }
    window.EventSource = MockEventSource as unknown as typeof EventSource;
    const host = window as Host;
    host.__publishScout = snapshot => { for (const stream of streams) if (!stream.closed) stream.dispatchEvent(new MessageEvent('state', { data: JSON.stringify({ snapshot }), lastEventId: snapshot.cursor })); };
    host.__disconnectScout = () => { for (const stream of streams) if (!stream.closed) stream.onerror?.(new Event('error')); };
  });
  const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/providers') return json(route, { providers: [
      { id: 'openalex', label: 'OpenAlex', role: 'primary', status: 'ready', mode: 'fixture' },
      { id: 'semantic_scholar', label: 'Semantic Scholar', role: 'complementary', status: 'ready', mode: 'fixture' },
    ] });
    if (pathname === '/api/research-runs' && request.method() === 'GET') return json(route, { runs: state.starts ? [state.snapshot] : [] });
    if (pathname === '/api/research-runs' && request.method() === 'POST') {
      state.starts++; const submitted = request.postDataJSON() as Record<string, unknown>; state.submitted.push(submitted);
      state.snapshot = { ...initialSnapshot(), provider: submitted.provider as Snapshot['provider'], question: String(submitted.question), filters: submitted.filters as Snapshot['filters'] };
      return json(route, { id: state.snapshot.id });
    }
    if (pathname.endsWith('/snapshot')) { state.snapshots++; return json(route, state.snapshot); }
    if (pathname.includes('/selections/')) {
      if (state.conflictNextSelection) { state.conflictNextSelection = false; state.snapshot.revision++; return json(route, { detail: 'Selection revision conflict' }, 409); }
      const body = request.postDataJSON();
      if (body.expected_revision !== state.snapshot.revision) return json(route, { detail: 'Selection revision conflict' }, 409);
      const ref = decodeURIComponent(pathname.split('/').pop()!);
      state.snapshot = { ...state.snapshot, revision: state.snapshot.revision + 1, selections: { ...state.snapshot.selections, [ref]: { state: body.state, reason: body.reason, source_version: 1, citation_source: body.citation_source } } };
      return json(route, state.snapshot);
    }
    if (pathname.endsWith('/details')) { state.details++; return json(route, state.snapshot); }
    if (pathname.endsWith('/metadata-checks')) {
      state.checks++;
      const ref = decodeURIComponent(pathname.split('/').at(-2)!);
      state.snapshot = { ...state.snapshot, checks: { ...state.snapshot.checks, [ref]: { status: 'conflict', agency: 'crossref', record: { title: 'Fixture registry title observed separately', doi: FIRST_SOURCE.doi }, conflicts: ['title differs'] } } };
      return json(route, state.snapshot);
    }
    if (pathname.endsWith('/exports')) {
      state.exports++;
      return json(route, { revision: state.snapshot.revision, bibliography: '# Fixture bibliography\n\n' + Object.keys(state.snapshot.selections).join('\n'), manifest: { mode: 'fixture', provider: state.snapshot.provider, revision: state.snapshot.revision } });
    }
    if (pathname.endsWith('/cancel')) { state.snapshot = { ...state.snapshot, status: 'cancelled' }; return json(route, state.snapshot); }
    return json(route, { detail: `Unhandled fixture API: ${request.method()} ${pathname}` }, 404);
  });
  return {
    state,
    async publish(update: Partial<Snapshot>) {
      state.snapshot = { ...state.snapshot, ...update, cursor: `fixture:${Number(state.snapshot.cursor.split(':')[1]) + 1}` };
      await page.evaluate(snapshot => (window as Host).__publishScout(snapshot), state.snapshot);
    },
    async disconnect() { await page.evaluate(() => (window as Host).__disconnectScout()); },
  };
}
