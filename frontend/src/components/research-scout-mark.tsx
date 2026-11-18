/** Decorative compass needle and discovery point; pair with the Research Scout name. */
export default function ResearchScoutMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} style={{ width: size, height: size, display: 'block', flexShrink: 0 }} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" data-testid="research-scout-mark">
    <circle cx="24" cy="24" r="20.5" fill="#eaf3fc" stroke="none" />
    <circle cx="24" cy="24" r="17.8" fill="none" stroke="#64a8e8" strokeWidth="1.5" />
    <path d="M24 4v4M44 24h-4M24 44v-4M4 24h4" stroke="#1976d2" strokeWidth="1.6" strokeLinecap="round" />
    <path d="m34.5 12.5-6.3 15.7-9.4-9.4Z" fill="#1565c0" stroke="none" />
    <path d="m12.5 34.5 6.3-15.7 9.4 9.4Z" fill="#86bdf0" stroke="none" />
    <circle cx="23.5" cy="23.5" r="2.6" fill="white" stroke="#1565c0" strokeWidth="1.25" />
    <circle cx="38.2" cy="10.1" r="4.1" fill="white" stroke="none" />
    <circle cx="38.2" cy="10.1" r="2.6" fill="#1976d2" stroke="none" />
  </svg>;
}
