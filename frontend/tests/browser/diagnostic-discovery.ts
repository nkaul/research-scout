import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import type { ProviderId } from '../../src/lib/api';
import type { Conversation } from '../../src/lib/conversations';
import { DEFAULT_SEARCH_PREFERENCES, publicationYears } from '../../src/lib/search-preferences';

/** Explicit test-only raw admission; interactive topic searches must require AI. */
export async function admitFixtureDiscovery(request: APIRequestContext, question: string, options: {
  routing?: 'auto' | 'manual'; providers?: ProviderId[]; sourceScope?: ProviderId[];
  filters?: { year_from?: number; year_to?: number }; videoCount?: number;
} = {}): Promise<Conversation> {
  const configuration = await request.get('/api/providers');
  expect(configuration.ok(), 'Diagnostic fixtures require real local provider services.').toBe(true);
  const providers = (await configuration.json()).providers;
  expect(providers).toHaveLength(9);
  expect(providers.every((provider: { mode: string }) => provider.mode === 'fixture')).toBe(true);
  const routing = options.routing || 'auto';
  const scope = routing === 'auto' ? { source_scope: options.sourceScope || DEFAULT_SEARCH_PREFERENCES.sources } : {};
  const years = publicationYears(DEFAULT_SEARCH_PREFERENCES);
  const settings = {
    routing, ...scope, ...(options.providers ? { providers: options.providers } : {}),
    filters: options.filters || { year_from: Number(years.from), year_to: Number(years.to) },
    video_count: options.videoCount || 10,
  };
  const created = await request.post('/api/conversations', { data: settings });
  expect(created.status()).toBe(201);
  const conversation = await created.json();
  const admitted = await request.post(`/api/conversations/${conversation.id}/turns`, { data: {
    ...settings, message: question, action: 'discover', agentic: false,
    idempotency_key: `diagnostic-${randomUUID()}`, expected_revision: conversation.revision,
  } });
  expect(admitted.status()).toBe(202);
  return admitted.json();
}
