import { DISCOVERY_PROVIDERS, type ProviderId } from './api';
import type { ModalityLimits } from './conversations';

export type DatePreset = '1' | '2' | '3' | '5' | 'custom';
export const DATE_PRESETS: readonly DatePreset[] = ['1', '2', '3', '5', 'custom'];
export const DEFAULT_VIDEO_COUNT = 10;
export const MAX_VIDEO_COUNT = 20;
export const MAX_MODALITY_LIMIT = 20;
export const DEFAULT_MODALITY_LIMITS: ModalityLimits = { papers: 20, videos: 10, datasets: 10, repos: 10 };
export type SearchPreferences = { sources: ProviderId[]; datePreset: DatePreset; customFrom: string; customTo: string; videoCount: number; aiRefinement: boolean; modalityLimits: ModalityLimits };
export const SEARCH_PREFERENCES_KEY = 'research-scout:search-preferences:v1';
export const DEFAULT_SEARCH_PREFERENCES: SearchPreferences = { sources: ['openalex', 'crossref', 'arxiv', 'youtube'], datePreset: '5', customFrom: '', customTo: '', videoCount: DEFAULT_VIDEO_COUNT, aiRefinement: true, modalityLimits: DEFAULT_MODALITY_LIMITS };

export function readSearchPreferences(): SearchPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_PREFERENCES_KEY) || 'null');
    if (!value || !Array.isArray(value.sources) || value.sources.length > 4 || !value.sources.every((id: ProviderId) => DISCOVERY_PROVIDERS.includes(id)) || new Set(value.sources).size !== value.sources.length || !['1', '2', '3', '5', 'custom'].includes(value.datePreset)) return DEFAULT_SEARCH_PREFERENCES;
    const year = (v: unknown) => typeof v === 'string' && (/^\d{4}$/.test(v) || v === '') ? v : '';
    const videoCount = Number.isInteger(value.videoCount) && value.videoCount >= 1 && value.videoCount <= MAX_VIDEO_COUNT ? value.videoCount : DEFAULT_VIDEO_COUNT;
    const validLimit = (item: unknown): item is number => Number.isInteger(item) && Number(item) >= 0 && Number(item) <= MAX_MODALITY_LIMIT;
    const priorLimit = (key: string) => { const item = Number(localStorage.getItem(key)); return Number.isInteger(item) && item >= 1 && item <= MAX_MODALITY_LIMIT ? item : 10; };
    const fallback = { ...DEFAULT_MODALITY_LIMITS, videos: videoCount, datasets: priorLimit('research-scout:dataset-limit:v1'), repos: priorLimit('research-scout:repo-limit:v1') };
    const modalityLimits = Object.fromEntries((Object.keys(DEFAULT_MODALITY_LIMITS) as (keyof ModalityLimits)[]).map(key => [key, validLimit(value.modalityLimits?.[key]) ? value.modalityLimits[key] : fallback[key]])) as ModalityLimits;
    return { sources: value.sources, datePreset: value.datePreset, customFrom: year(value.customFrom), customTo: year(value.customTo), videoCount: modalityLimits.videos || videoCount, aiRefinement: typeof value.aiRefinement === 'boolean' ? value.aiRefinement : true, modalityLimits };
  } catch { return DEFAULT_SEARCH_PREFERENCES; }
}

export function publicationYears(preferences: SearchPreferences, currentYear = new Date().getFullYear()) {
  return preferences.datePreset === 'custom' ? { from: preferences.customFrom, to: preferences.customTo } : { from: String(currentYear - Number(preferences.datePreset) + 1), to: String(currentYear) };
}
