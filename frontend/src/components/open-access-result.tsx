import { humanStatus, safeUrl } from '@/lib/api';
import type { AccessLocation, AccessObservation } from '@/lib/conversations';
import Icon from './icon';

const versionLabel = (version?: string | null) => version === 'publishedVersion' ? 'Published version' : version === 'acceptedVersion' ? 'Accepted manuscript' : version === 'submittedVersion' ? 'Submitted version' : version || 'Not supplied';

function Location({ location, index, best }: { location: AccessLocation; index: number; best: boolean }) {
  const links = [
    { label: 'Open landing page', url: safeUrl(location.url_for_landing_page) },
    { label: 'Open PDF', url: safeUrl(location.url_for_pdf) },
    { label: 'Open reported location', url: safeUrl(location.url) },
  ].filter((item, i, all) => item.url && all.findIndex(other => other.url === item.url) === i);
  return <article className="access-location" data-testid="access-location"><h4>{best ? 'Preferred open-access location' : `Reported location ${index + 1}`}</h4><dl><div><dt>Version</dt><dd>{versionLabel(location.version)}</dd></div><div><dt>License</dt><dd>{location.license || 'Not supplied'}</dd></div><div><dt>Host</dt><dd>{location.host_type ? humanStatus(location.host_type) : 'Not supplied'}</dd></div></dl><div className="access-links">{links.map(item => <a className="text-button" key={item.url} href={item.url} target="_blank" rel="noreferrer noopener">{item.label}<Icon name="external" /></a>)}{!links.length && <p>No usable HTTP link was supplied for this location.</p>}</div></article>;
}

export default function OpenAccessResult({ access }: { access: AccessObservation }) {
  const best = access.best_oa_location;
  const others = (access.oa_locations || []).filter(location => !best || JSON.stringify([location.url, location.url_for_pdf, location.url_for_landing_page, location.license, location.version]) !== JSON.stringify([best.url, best.url_for_pdf, best.url_for_landing_page, best.license, best.version]));
  return <section className="open-access-result" aria-label="Open-access result" data-testid="access-result"><div className="access-result-heading"><Icon name="link" /><div><h3>{access.is_oa ? 'Open-access copy reported' : 'No open-access copy reported'}</h3><p>Unpaywall · {access.mode === 'fixture' ? 'Fixture access record' : 'Access metadata'} · DOI {access.doi}</p></div></div><dl className="access-status-fields"><div><dt>Access status</dt><dd>{humanStatus(access.oa_status)}</dd></div><div><dt>Observed</dt><dd>{access.observed_at ? new Date(access.observed_at).toLocaleDateString() : 'Not supplied'}</dd></div></dl>{best && <Location location={best} index={0} best />}{!best && access.is_oa && <p className="access-no-location">The record marks this DOI open access, but supplies no preferred location.</p>}{others.length > 0 && <details className="other-access-locations"><summary>Other reported locations ({others.length})<Icon name="chevron" /></summary>{others.map((location, index) => <Location key={`${index}:${location.url || location.url_for_pdf}`} location={location} index={index} best={false} />)}</details>}<p className="access-scope">These are access locations and license metadata, separate from research evidence. No abstract, PDF or full text has been acquired.</p></section>;
}
