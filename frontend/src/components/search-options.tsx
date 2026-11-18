'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { DISCOVERY_PROVIDERS, providerLabel, providerReadiness, type Provider, type ProviderId } from '@/lib/api';
import { DATE_PRESETS, publicationYears, type DatePreset, type SearchPreferences } from '@/lib/search-preferences';
import Icon from './icon';
import Tooltip from './tooltip';
import ModalityLimitControl from './modality-limit-control';
import AiRefinementToggle from './ai-refinement-toggle';
import ControlPopover from './control-popover';
import styles from './search-options.module.css';

export default function SearchOptions({ value, providers, onChange, onApplyRange, disabled, compact = false, refinementDisabled = disabled, manualProvider, onManualProviderChange }: { value: SearchPreferences; providers: Provider[]; onChange: (value: SearchPreferences) => void; onApplyRange?: () => void; disabled: boolean; compact?: boolean; refinementDisabled?: boolean; manualProvider?: ProviderId; onManualProviderChange?: (provider: ProviderId) => void }) {
  const years = publicationYears(value);
  const [sourcesOpen, setSourcesOpen] = useState(false), [customOpen, setCustomOpen] = useState(false);
  const sourcesTrigger = useRef<HTMLElement>(null), customTrigger = useRef<HTMLButtonElement>(null);
  const sourcePointerAction = useRef<boolean | null>(null);
  const sliderId = useId();
  useEffect(() => { if (disabled) { setSourcesOpen(false); setCustomOpen(false); } }, [disabled]);
  const rangeLabel = `${years.from || 'Any year'}–${years.to || 'present'}`;
  const selectedLabel = value.sources.length ? value.sources.map(providerLabel).join(', ') : 'No sources selected';
  const youtubeLimit = providers.find(provider => provider.id === 'youtube')?.run_attempt_cap;
  function chooseDate(datePreset: DatePreset) {
    onChange({ ...value, datePreset, ...(datePreset === 'custom' && !value.customFrom && !value.customTo ? { customFrom: years.from, customTo: years.to } : {}) });
    if (datePreset === 'custom') setCustomOpen(true);
  }
  return <div className={`search-options ${styles.options}${compact ? ' hybrid-source-options' : ''}`} data-testid="search-options">
    <div className={`search-options-row ${styles.row}`}>
      {manualProvider ? <label className={`provider-field ${styles.manual}`}><Icon name="layers" /><span>Source</span><select aria-label="Manual search provider" value={manualProvider} disabled={disabled} onChange={event => onManualProviderChange?.(event.target.value as ProviderId)}>{DISCOVERY_PROVIDERS.map(id => { const provider = providers.find(item => item.id === id); const unavailable = !provider || provider.access_configured === false || ['unavailable', 'blocked', 'needs_access', 'configuration_error', 'disabled'].includes(provider.status || ''); return <option key={id} value={id} disabled={unavailable}>{providerLabel(id)}{unavailable ? ' (unavailable)' : ''}</option>; })}</select></label> : <details className={`source-picker ${styles.sourcePicker}`} open={sourcesOpen && !disabled}>
        <Tooltip content={`Selected sources: ${selectedLabel}. Choose up to four.`}><summary role="button" tabIndex={disabled ? -1 : 0} ref={sourcesTrigger} aria-label={`Sources: ${value.sources.length} selected`} aria-haspopup="dialog" aria-expanded={sourcesOpen && !disabled} aria-disabled={disabled} onPointerDown={event => { if (event.button === 0) sourcePointerAction.current = !sourcesOpen; }} onPointerCancel={() => { sourcePointerAction.current = null; }} onClick={event => { event.preventDefault(); const next = sourcePointerAction.current ?? !sourcesOpen; sourcePointerAction.current = null; if (!disabled) setSourcesOpen(next); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sourcePointerAction.current = null; if (!disabled && !event.repeat) setSourcesOpen(previous => !previous); } }} onKeyUp={event => { if (event.key === ' ') event.preventDefault(); }}><Icon name="layers" /><strong>Sources</strong><span>{value.sources.length}</span><Icon name="chevron" /></summary></Tooltip>
      </details>}
      <div className={`date-range-control ${styles.dateGroup}`}>
        <label htmlFor={sliderId}><Icon name="calendar" />Date range</label>
        <input className="date-range-slider" id={sliderId} aria-label="Date range" type="range" min="0" max="4" step="1" value={DATE_PRESETS.indexOf(value.datePreset)} aria-valuetext={`${value.datePreset === 'custom' ? 'Custom range' : `${value.datePreset} ${value.datePreset === '1' ? 'year' : 'years'}, includes this year`}, ${rangeLabel}`} disabled={disabled} onChange={event => chooseDate(DATE_PRESETS[Number(event.target.value)])} />
        <span className={`date-range-hint ${styles.rangeHint}`} title={rangeLabel}>{value.datePreset === 'custom' ? 'Custom' : `${value.datePreset} ${value.datePreset === '1' ? 'yr' : 'yrs'}`}</span>
        <Tooltip content={`Custom publication years · ${rangeLabel}`}><button ref={customTrigger} className={`date-range-custom-button ${styles.customTrigger}`} type="button" aria-label="Custom range" aria-haspopup="dialog" aria-expanded={customOpen && !disabled} disabled={disabled} aria-pressed={value.datePreset === 'custom'} onClick={() => { if (customOpen) setCustomOpen(false); else chooseDate('custom'); }}><Icon name="calendar" /></button></Tooltip>
      </div>
      <ModalityLimitControl value={value.modalityLimits} disabled={refinementDisabled} onChange={modalityLimits => onChange({ ...value, modalityLimits, videoCount: modalityLimits.videos || value.videoCount })} />
      <AiRefinementToggle checked={value.aiRefinement} onChange={aiRefinement => onChange({ ...value, aiRefinement })} disabled={refinementDisabled} />
    </div>
    <ControlPopover open={sourcesOpen && !disabled} onClose={() => setSourcesOpen(false)} anchor={sourcesTrigger} label="Search sources" className={styles.sourcesPanel}>
      <p>Select up to four paper/video sources. Unpaywall checks paper access automatically. Enabled Data searches Hugging Face and DataCite; Repos searches GitHub through the main Search.</p>
      <fieldset disabled={disabled}><legend className="sr-only">Search sources</legend>{DISCOVERY_PROVIDERS.map(id => {
        const selected = value.sources.includes(id), provider = providers.find(p => p.id === id);
        const unavailable = !provider || provider.access_configured === false || ['unavailable', 'blocked', 'needs_access', 'configuration_error', 'disabled'].includes(provider.status || '');
        return <label key={id}><input type="checkbox" aria-label={`Search ${providerLabel(id)}`} checked={selected} disabled={!selected && (unavailable || value.sources.length >= 4)} onChange={() => onChange({ ...value, sources: selected ? value.sources.filter(p => p !== id) : [...value.sources, id] })} /><span><strong>{providerLabel(id)}</strong><small>{providerReadiness(provider)}</small></span></label>;
      })}</fieldset>
      <div className={styles.selections} aria-label="Selected search sources">{value.sources.map(id => <button key={id} type="button" disabled={disabled} aria-label={`Remove ${providerLabel(id)}`} onClick={() => onChange({ ...value, sources: value.sources.filter(source => source !== id) })}>{providerLabel(id)}<Icon name="close" /></button>)}{!value.sources.length && <span role="status">{value.modalityLimits.datasets > 0 || value.modalityLimits.repos > 0 ? 'No paper/video sources selected. Enabled Data and Repos still search.' : 'Select a paper/video source, or enable Data or Repos in Limits.'}</span>}</div>
      <p>Your choices are remembered on this browser. Changes apply when you press Search.</p>
      {value.sources.includes('youtube') && typeof youtubeLimit === 'number' && <p>YouTube allowance: {youtubeLimit} requests per run. Metadata and transcripts use this allowance separately.</p>}
    </ControlPopover>
    <ControlPopover open={customOpen && !disabled} onClose={() => setCustomOpen(false)} anchor={customTrigger} label="Custom publication range" className={styles.customPanel}>
      <strong>Custom publication years</strong>
      <div className={styles.years}><label>From year<input aria-label="Custom publication year from" type="number" min="1500" max="2200" placeholder="Any" value={value.customFrom} disabled={disabled} onChange={event => onChange({ ...value, customFrom: event.target.value })} /></label><label>To year<input aria-label="Custom publication year to" type="number" min="1500" max="2200" placeholder="Present" value={value.customTo} disabled={disabled} onChange={event => onChange({ ...value, customTo: event.target.value })} /></label></div>
      <p>Editing years updates your next search. Earlier results keep their saved scope.</p>
      <button type="button" className={`button small apply-date-range ${styles.apply}`} disabled={disabled || !onApplyRange} onClick={() => { setCustomOpen(false); onApplyRange?.(); }}><Icon name="refresh" />Apply range &amp; search</button>
    </ControlPopover>
  </div>;
}
