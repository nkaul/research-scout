'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sourceTitle, type Source } from '@/lib/api';
import Icon from './icon';
import Tooltip from './tooltip';
import LoadTime from './load-time';
import { formatLoadTime, useLoadTiming, type LoadTiming } from '@/lib/load-timing';
import styles from './video-timing.module.css';
import previewStyles from './video-preview.module.css';

export function youtubeId(source: Source) {
  if (source.provider !== 'youtube') return null;
  // The record identity is canonical; older saved previews can use the
  // supplementary identifier when record_id was not a bare video ID.
  return [source.record_id, source.provider_identifiers?.youtube_video_id]
    .find(id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)) || null;
}

function thumbnailUrl(value: string | null | undefined, id: string | null) {
  if (!value || !id) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && (!url.port || url.port === '443')
      && ['i.ytimg.com', 'i9.ytimg.com'].includes(url.hostname)
      && [`/vi/${id}/`, `/vi_webp/${id}/`].some(prefix => url.pathname.startsWith(prefix))
      ? url.href : null;
  } catch { return null; }
}

export function VideoThumbnail({ source, onPreview }: { source: Source; onPreview: () => void }) {
  const id = youtubeId(source), [failedUrls, setFailedUrls] = useState<string[]>([]), [loadedUrls, setLoadedUrls] = useState<string[]>([]);
  const clock = useLoadTiming(), imageElement = useRef<HTMLImageElement>(null), imageTicket = useRef<LoadTiming | null>(null);
  const candidates = [thumbnailUrl(source.thumbnail_url, id), id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null];
  const image = candidates.find(url => url && !failedUrls.includes(url));
  useEffect(() => {
    if (!image || loadedUrls.includes(image) || !imageElement.current) return;
    const start = () => {
      const target = imageElement.current;
      // A cached image can finish before visibility is delivered. Never start
      // an elapsed clock after its load/error event, or for a replaced image.
      if (!target || target.complete || target.getAttribute('src') !== image) return;
      if (imageTicket.current?.key !== image) imageTicket.current = clock.start(image, 'Thumbnail');
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { start(); observer.disconnect(); } });
    observer.observe(imageElement.current);
    return () => observer.disconnect();
  }, [image, clock.start]);
  const imageTiming = clock.timing?.key === image ? clock.timing : null;
  const completedTime = imageTiming?.elapsedMs !== null && imageTiming?.elapsedMs !== undefined ? formatLoadTime(imageTiming.elapsedMs) : null;
  return <Tooltip content={`Open the video preview${completedTime ? ` · Thumbnail loaded in ${completedTime}` : ''}`}><button type="button" className="video-thumbnail" onClick={onPreview} aria-label={`Preview video: ${sourceTitle(source)}`} aria-busy={!!image && !loadedUrls.includes(image)}>
    {image && !loadedUrls.includes(image) && <span className="video-image-loading" aria-hidden="true"><span className="search-skeleton-line" /></span>}
    {image ? <img ref={imageElement} key={image} src={image} alt={`Video thumbnail: ${sourceTitle(source)}`} loading="lazy" referrerPolicy="no-referrer" onLoad={() => { if (imageTicket.current?.key === image) clock.finish(imageTicket.current); setLoadedUrls(previous => previous.includes(image) ? previous : [...previous.slice(-7), image]); }} onError={() => { if (imageTicket.current?.key === image) clock.finish(imageTicket.current, true); setFailedUrls(previous => previous.includes(image) ? previous : [...previous, image]); }} /> : <span className="video-thumbnail-fallback">Thumbnail unavailable · preview video</span>}
    <span className={completedTime ? 'sr-only' : styles.thumbnailTime}><LoadTime timing={imageTiming} description="Observed time while this visible thumbnail loads." /></span>
    {completedTime && <span className={styles.thumbnailClock} aria-hidden="true"><Icon name="clock" /></span>}
    <span className="video-play-mark" aria-hidden="true">▶</span>
  </button></Tooltip>;
}

function CompletedMediaTiming({ timings }: { timings: (LoadTiming | null)[] }) {
  const completed = timings.filter((timing): timing is LoadTiming => !!timing && timing.elapsedMs !== null);
  if (!completed.length) return null;
  const description = completed.map(timing => `${timing.label}: ${formatLoadTime(timing.elapsedMs!)}${timing.failed ? ' · failed' : ''}`).join(' · ');
  return <Tooltip content={`${description}. Observed browser load time; playback can still buffer.`}><span className={previewStyles.timing} tabIndex={0} aria-label="Video and captions load times"><Icon name="clock" /><span className="sr-only">{completed.map(timing => <LoadTime key={timing.label} timing={timing} />)}</span></span></Tooltip>;
}

export default function VideoPreview({ source, loading, onTranscript, children, onDetails, detailsLoading = false, detailsComplete = false, playbackRequest }: { source: Source; loading: boolean; onTranscript: () => void; children?: ReactNode; onDetails?: () => void; detailsLoading?: boolean; detailsComplete?: boolean; playbackRequest?: number }) {
  const id = youtubeId(source), [playingId, setPlayingId] = useState<string | null>(null), [loadedPlayer, setLoadedPlayer] = useState<string | null>(null);
  const playerClock = useLoadTiming(), captionsClock = useLoadTiming(), captionTicket = useRef<LoadTiming | null>(null);
  const consumedPlaybackRequest = useRef(0);
  const transcript = source.transcript;
  useEffect(() => {
    if (!playbackRequest || playbackRequest <= 0 || playbackRequest === consumedPlaybackRequest.current) return;
    consumedPlaybackRequest.current = playbackRequest;
    if (!id || playingId === id) return;
    playerClock.start(id, 'Video');
    setPlayingId(id);
  }, [playbackRequest, id, playingId, playerClock.start]);
  useEffect(() => {
    if (loading && !captionTicket.current) captionTicket.current = captionsClock.start(source.source_ref, 'Captions');
    if (!loading && captionTicket.current) { captionsClock.finish(captionTicket.current, transcript?.status === 'error'); captionTicket.current = null; }
  }, [loading, source.source_ref, transcript?.status, captionsClock.start, captionsClock.finish]);
  const captionLabel = !transcript ? null : transcript.status === 'available'
    ? transcript.origin === 'authored_fixture_captions' ? 'Fictional fixture captions' : transcript.is_generated ? 'Auto-generated captions' : 'Published captions'
    : transcript.status === 'blocked' ? 'Captions blocked' : transcript.status === 'unavailable' ? 'No captions' : 'Caption lookup failed';
  return <section className={`video-preview ${previewStyles.preview}`} aria-label="Video preview and transcript">
    {id ? playingId === id ? <div className="video-player-stage">
      {loadedPlayer !== id && <div className="video-player-loading" data-testid="video-player-loading"><p role="status"><Icon name="video" />Loading video preview…</p><span className="search-skeleton-line" aria-hidden="true" /></div>}
      <iframe className="video-player" src={`https://www.youtube-nocookie.com/embed/${id}?cc_load_policy=1`} title={`YouTube preview: ${sourceTitle(source)}`} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => { setLoadedPlayer(id); if (playerClock.timing) playerClock.finish(playerClock.timing); }} />
    </div> : <VideoThumbnail source={source} onPreview={() => { playerClock.start(id, 'Video'); setPlayingId(id); }} /> : <p role="status">This saved record has no valid YouTube video identifier. Its saved metadata remains available.</p>}
    <div className={previewStyles.actions} aria-label="Video actions and caption status">
      {id && <Tooltip content="Open the original video in a new tab"><a className={previewStyles.action} href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer"><Icon name="external" />Open on YouTube</a></Tooltip>}
      {onDetails && <Tooltip content="Load the video description and provider metadata. Public captions are a separate request."><button type="button" className={previewStyles.action} disabled={detailsLoading || detailsComplete || !id} onClick={onDetails}><Icon name={detailsLoading ? 'spinner' : detailsComplete ? 'check' : 'refresh'} />{detailsLoading ? 'Loading video details…' : detailsComplete ? 'Video details loaded' : source.details_loaded ? 'Refresh video details' : 'Load video details'}</button></Tooltip>}
      {transcript?.status !== 'available' && <Tooltip content={transcript ? 'Retry public-caption lookup within this run’s allowance. A recent failed lookup can require a cooldown.' : 'Fetch public captions on request. This does not load the video description.'}><button type="button" className={previewStyles.action} disabled={loading || !id} onClick={onTranscript}><Icon name={loading ? 'spinner' : transcript ? 'refresh' : 'text'} />{loading ? 'Loading transcript…' : transcript ? 'Retry transcript' : 'Load transcript'}</button></Tooltip>}
      {captionLabel && <span className={previewStyles.chip}>{captionLabel}</span>}
      {transcript?.status === 'available' && <span className={previewStyles.chip}>{transcript.language || 'Language not supplied'}</span>}
      <CompletedMediaTiming timings={[playerClock.timing, captionsClock.timing]} />
    </div>
    {playerClock.timing?.elapsedMs === null && <LoadTime timing={playerClock.timing} description="Time from opening to the video frame load event; playback buffering can continue." />}
    {children}
    <section className={`video-transcript ${previewStyles.transcript}`} aria-label="Video transcript" data-testid="video-transcript" aria-busy={loading}>
      <div className={previewStyles.transcriptHeading}><h3>Transcript</h3>{captionsClock.timing?.elapsedMs === null && <LoadTime timing={captionsClock.timing} />}</div>
      {!transcript && !loading && <p className={previewStyles.note}>Public captions have not been requested. Load transcript to check availability.</p>}
      {transcript?.status === 'available' && <>
        {transcript.segments.length ? <ol tabIndex={0} aria-label="Saved transcript">{transcript.segments.map((segment, index) => <li key={index}>{id ? <a href={`https://www.youtube.com/watch?v=${id}&t=${Math.floor(segment.start)}s`} target="_blank" rel="noopener noreferrer">{Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')}</a> : <span>{Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')}</span>}<span>{segment.text}</span></li>)}</ol> : <p className={previewStyles.note}>No caption text was saved.</p>}
        <p className={previewStyles.note}>{transcript.truncated ? 'Saved excerpt · Open YouTube for the rest. ' : ''}Source captions may contain errors.</p>
      </>}
      {transcript && transcript.status !== 'available' && <div role="status" className={previewStyles.outcome}>
        <strong>{transcript.status === 'blocked' ? 'Transcript access blocked' : transcript.status === 'unavailable' ? 'Transcript unavailable' : 'Transcript lookup could not complete'}</strong>
        {transcript.message && <p>{transcript.message}</p>}<p className={previewStyles.note}>Retry uses the remaining request allowance; recent attempts may need a cooldown. You can also try “Show transcript” on YouTube.</p>
      </div>}
      {loading && <><p role="status" className={previewStyles.note}>Checking public captions…</p><div className="transcript-loading-mask" aria-hidden="true"><span className="search-skeleton-line" /><span className="search-skeleton-line" /><span className="search-skeleton-line short" /></div></>}
    </section>
  </section>;
}
