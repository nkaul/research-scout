import { DISCOVERY_PROVIDERS, providerLabel, providerReadiness, type Provider } from '@/lib/api';

export default function ConnectedSources({ providers }: { providers: Provider[] }) {
  return <div className="connected-sources" aria-label="Automatically routed resources"><strong>Search connected sources</strong><p>Appropriate resources are chosen for your question. Matching DOIs appear as one paper; Unpaywall checks reported open-access locations automatically.</p><ul>{[...DISCOVERY_PROVIDERS, 'unpaywall'].map(id => <li key={id}><span>{providerLabel(id)}{id === 'unpaywall' ? ' · access' : ''}</span><small>{providerReadiness(providers.find(item => item.id === id))}</small></li>)}</ul></div>;
}
