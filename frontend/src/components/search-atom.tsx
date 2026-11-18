import styles from './search-atom.module.css';

function Orbit({ plane }: { plane: string }) {
  return <span className={`${styles.plane} ${plane}`} data-atom-plane="true">
    <svg className={styles.canvas} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <circle className={styles.ring} cx="32" cy="32" r="26" />
      <g transform="translate(32 32)">
        <g className={styles.spin}>
          <g transform="translate(26 0)">
            <g className={styles.counterSpin}>
              <circle className={styles.particleAura} r="3.8" />
              <circle className={styles.particle} r="2.6" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  </span>;
}

/** CSS-only activity illustration. The parent supplies the accessible loading status. */
export default function SearchAtom({ size = 56, fill = false, className = '' }: { size?: number; fill?: boolean; className?: string }) {
  return <span className={`${styles.atom} ${className}`} style={{ width: fill ? '100%' : size, height: fill ? '100%' : size }} aria-hidden="true" data-testid="search-atom">
    <span className={styles.scene}>
      <Orbit plane={styles.planeA} />
      <Orbit plane={styles.planeB} />
      <Orbit plane={styles.planeC} />
    </span>
    <svg className={`${styles.canvas} ${styles.nucleusLayer}`} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <circle className={styles.nucleusHalo} cx="32" cy="32" r="7.2" />
      <circle className={styles.nucleus} cx="32" cy="32" r="3.9" />
      <circle className={styles.highlight} cx="30.8" cy="30.7" r="1.1" />
    </svg>
  </span>;
}
