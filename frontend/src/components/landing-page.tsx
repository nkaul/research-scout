'use client';

import { useRef, useState, type ReactNode } from 'react';
import styles from './landing-page.module.css';

type IconName = 'compass' | 'menu' | 'close' | 'arrow' | 'paper' | 'video' | 'data' | 'code' | 'sparkle' | 'note' | 'search' | 'layers' | 'check' | 'bookmark';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const shapes: Record<IconName, ReactNode> = {
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.8 8.2-2.3 5.3-5.3 2.3 2.3-5.3zM12 1v3m0 16v3M1 12h3m16 0h3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    paper: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h5" /></>,
    video: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></>,
    data: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
    code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />,
    sparkle: <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4zM20 2v4m-2-2h4" />,
    note: <path d="M5 3h14v14l-4 4H5zM15 21v-5h4M8 8h8M8 12h6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    layers: <path d="m12 3 10 5-10 5L2 8zM3 12l9 5 9-5M3 16l9 5 9-5" />,
    check: <path d="m5 12 4 4L19 6" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  };
  return <svg className={`${styles.icon} ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">{shapes[name]}</svg>;
}

function Brand({ footer = false }: { footer?: boolean }) {
  return <a className={`${styles.brand} ${footer ? styles.footerBrand : ''}`} href={footer ? '/' : '#start'} aria-label="Research Scout home"><span className={styles.brandMark}><Icon name="compass" /></span><span>Research Scout</span></a>;
}

const entries: { icon: IconName; tone: string; caption: string; title: string; description: string; label: string; href: string }[] = [
  { icon: 'paper', tone: 'blue', caption: 'Papers', title: 'Read the research', description: 'Explore studies and ideas. Inspect the abstract, the publication and where each observation came from.', label: 'Explore papers', href: '/app?category=papers' },
  { icon: 'video', tone: 'violet', caption: 'Videos', title: 'See the idea explained', description: 'Move from a concept to a practical walkthrough, with source descriptions kept separate from video content.', label: 'Explore videos', href: '/app?category=videos' },
  { icon: 'data', tone: 'teal', caption: 'Data', title: 'Find data to test it', description: 'Review catalog descriptions, tasks and versions before deciding what might fit your research.', label: 'Explore datasets', href: '/app?category=data' },
  { icon: 'code', tone: 'blue', caption: 'Repos', title: 'Explore the implementation', description: 'Look inside a saved README, follow published topics and keep unknowns visible alongside a possible match.', label: 'Explore repositories', href: '/app?category=repos' },
  { icon: 'sparkle', tone: 'violet', caption: 'Question first', title: 'Keep the question in view', description: 'Return to your original question, review the saved query focus and choose how to shape your next search.', label: 'Open your workspace', href: '/app' },
  { icon: 'note', tone: 'teal', caption: 'Your thinking', title: 'Build on your observations', description: 'Keep a source-linked note, return to the original wording and let your next question take shape.', label: 'Open research notes', href: '/app' },
];

export interface LandingPageProps {
  authenticated?: boolean;
}

/** Public entry point only. Questions become URL drafts; this page starts no research. */
export default function LandingPage({ authenticated = false }: LandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const entryHref = authenticated ? '/app' : '/login';
  const entryLabel = authenticated ? 'Continue research' : 'Sign in';

  return (
    <div className={styles.page} data-testid="landing-page" onKeyDown={event => {
      if (event.key === 'Escape' && menuOpen) {
        event.preventDefault();
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }}>
      <a className={styles.skipLink} href="#landing-main">Skip to research</a>
      <header className={styles.navWrap}>
        <nav className={styles.floatingNav} aria-label="Main navigation">
          <Brand />
          <div className={styles.navLinks} id="landing-navigation-links" data-open={menuOpen}>
            <a href="#research-map" onClick={() => setMenuOpen(false)}>Research map</a>
            <a href="#evidence" onClick={() => setMenuOpen(false)}>Evidence desk</a>
            <a href="#method" onClick={() => setMenuOpen(false)}>How it works</a>
          </div>
          <button ref={menuButton} className={styles.mobileNavToggle} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="landing-navigation-links" data-testid="landing-navigation-toggle" onClick={() => setMenuOpen(value => !value)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
          <a className={`${styles.button} ${styles.navCta}`} href={entryHref}>{entryLabel}<Icon name="arrow" /></a>
        </nav>
      </header>

      <main id="landing-main" className={styles.main}>
        <section className={`${styles.hero} ${styles.pageWidth}`} id="start" aria-labelledby="landing-hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrowPill}><span className={styles.statusDot} aria-hidden="true" />A new perspective on research</span>
            <h1 className={styles.heroTitle} id="landing-hero-title">Give your question<br /><span>room to explore.</span></h1>
            <p className={styles.heroLead}>Papers, explanations, data and code. A wider view of the problem, with the original evidence always close.</p>
            <form action="/app" method="get" className={styles.commandCard} data-testid="landing-question-form">
              <label className={styles.questionLabel} htmlFor="landing-research-question"><Icon name="search" />Your research question</label>
              <textarea id="landing-research-question" name="q" className={styles.researchQuestion} rows={3} minLength={3} maxLength={2000} required placeholder="How can better context improve generation in language models?" aria-describedby="landing-question-hint" onInput={event => {
                const field = event.currentTarget;
                field.setCustomValidity(new TextEncoder().encode(field.value.trim()).byteLength > 2000 ? 'Please use a shorter research question.' : '');
              }} />
              <div className={styles.commandActions}>
                <button className={`${styles.button} ${styles.exploreButton}`} type="submit">Explore question<Icon name="arrow" /></button>
              </div>
              <p className={styles.commandHint} id="landing-question-hint">Your question opens as a draft in the research workspace. You choose when to start searching.</p>
            </form>
            <div className={styles.queryContext}>
              <p className={styles.contextLabel}><Icon name="sparkle" />Start with a question. Follow the evidence.</p>
              <div className={styles.contextChips}><span>Papers</span><span>Videos</span><span>Data</span><span>Code</span></div>
            </div>
          </div>

          <div className={styles.heroScene} data-testid="landing-evidence-illustration">
            <div className={styles.sceneGlow} aria-hidden="true" />
            <div className={`${styles.floatingBadge} ${styles.badgeSource}`}><span className={styles.successIcon}><Icon name="check" /></span><div><strong>Source-linked thinking</strong><span>Keep the evidence in view</span></div></div>
            <div className={styles.sessionVisual}>
              <div className={styles.sessionTop}><span className={styles.miniMark}><Icon name="compass" /></span><div><strong>From question to understanding</strong><span>A view of the research workflow</span></div><span className={styles.illustrationPill}>Illustration</span></div>
              <div className={styles.evidenceOrbit} role="img" aria-label="A research question connects with papers, videos, datasets and code">
                <svg className={styles.orbitLines} viewBox="0 0 520 270" aria-hidden="true"><path d="M110 66C140 66 170 135 260 135S378 66 410 66M110 212C158 212 175 135 260 135S365 212 410 212" /><path className={styles.orbitDashed} d="M110 66v146M410 66v146" /><circle cx="260" cy="135" r="63" /><circle className={styles.orbitOuter} cx="260" cy="135" r="84" /></svg>
                <div className={styles.orbitCenter}><Icon name="compass" /><span>Your question</span></div>
                <span className={`${styles.orbitNode} ${styles.nodePaper}`}><Icon name="paper" />Papers</span><span className={`${styles.orbitNode} ${styles.nodeVideo}`}><Icon name="video" />Videos</span><span className={`${styles.orbitNode} ${styles.nodeData}`}><Icon name="data" />Data</span><span className={`${styles.orbitNode} ${styles.nodeCode}`}><Icon name="code" />Code</span>
              </div>
              <div className={styles.previewSource}><div className={styles.previewKicker}><span>Original source</span><span>Illustrative source view</span></div><h2>Understand the idea. Keep its context.</h2><p>Read the original wording. Check where it came from. Keep your own observations beside it.</p><span className={styles.previewDirection}>Question, source, observation<Icon name="arrow" /></span></div>
              <div className={styles.sessionBottom}><span><Icon name="layers" />Evidence and your thinking, together</span><Icon name="bookmark" /></div>
            </div>
            <div className={`${styles.floatingBadge} ${styles.badgeNote}`}><span className={styles.violetIcon}><Icon name="note" /></span><div><strong>Your next insight</strong><span>Starts with an observation</span></div></div>
            <span className={styles.sceneCaption}>An illustration of the workflow, not a research result.</span>
          </div>
        </section>

        <section className={`${styles.researchMap} ${styles.pageWidth}`} id="research-map" aria-labelledby="landing-map-title" data-testid="landing-research-map">
          <div className={styles.sectionIntro}><span className={styles.eyebrowPill}>The research map</span><h2 id="landing-map-title">One question.<br /><span>More ways forward.</span></h2><p>Follow the thread that helps you most. Every path brings you back to the evidence.</p></div>
          <div className={styles.mapGrid}>
            {entries.map(entry => <article className={styles.mapCard} data-tone={entry.tone} key={entry.title}><div className={styles.mapCardTop}><span className={styles.featureIcon}><Icon name={entry.icon} /></span><span className={styles.mapCaption}>{entry.caption}</span></div><h3>{entry.title}</h3><p>{entry.description}</p><a className={styles.textLink} href={entry.href}>{entry.label}<Icon name="arrow" /></a></article>)}
          </div>
        </section>

        <section className={`${styles.evidenceSection} ${styles.pageWidth}`} id="evidence" aria-labelledby="landing-evidence-title">
          <div className={styles.sectionIntro}><span className={`${styles.eyebrowPill} ${styles.violetPill}`}>The evidence desk</span><h2 id="landing-evidence-title">The bigger picture.<br /><span>The original detail.</span></h2><p>A place to slow down, read closely and decide what belongs in your research.</p></div>
          <div className={styles.workspacePreview}>
            <div className={styles.workspaceCopy}><span className={styles.sectionEyebrow}>A workspace for your research</span><h3>Make room for careful reading.</h3><p>Keep source text, metadata and your notes close together. Move between resource types while keeping the question you started with.</p><ul><li><Icon name="check" />Return to the original source wording</li><li><Icon name="check" />Review source context and available metadata</li><li><Icon name="check" />Build your own source-linked observations</li></ul><a className={styles.button} href="/app">Open evidence workspace<Icon name="arrow" /></a></div>
            <div className={styles.readingIllustration} aria-label="Illustrative source reading layout"><div className={styles.readingIllustrationTop}><Icon name="paper" /><span>Source and context</span><span>Illustration</span></div><div className={styles.readingTabs} aria-hidden="true"><span>Original text</span><span>Metadata</span><span>Notes</span></div><div className={styles.readingSource}><span className={styles.readingLabel}>Read closely</span><h4>The evidence behind the idea</h4><p>Keep the source wording in view while you consider what it supports and what remains uncertain.</p><div className={styles.sourceLines} aria-hidden="true"><i /><i /><i /></div></div><div className={styles.observationNote}><Icon name="note" /><div><strong>Your observation</strong><p>What does this source add to your question?</p></div></div></div>
          </div>
        </section>

        <section className={`${styles.methodSection} ${styles.pageWidth}`} id="method" aria-labelledby="landing-method-title"><span className={styles.methodMark}><Icon name="compass" /></span><div><span className={styles.sectionEyebrow}>A little curiosity goes a long way</span><h2 id="landing-method-title">Start with the question.<br />Keep the evidence close.</h2><p>Research Scout brings different kinds of research material into one reading workspace. You decide what is useful, where to look next and which observations to carry forward.</p><a className={styles.textLink} href="/app">Find your next direction<Icon name="arrow" /></a></div></section>
      </main>
      <footer className={`${styles.pageFooter} ${styles.pageWidth}`}><Brand footer /><p>A little curiosity goes a long way.</p><a href={entryHref}>{entryLabel}<Icon name="arrow" /></a></footer>
    </div>
  );
}
