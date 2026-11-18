import type { CSSProperties } from 'react';

const paths = {
  repo: <><path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V4a1 1 0 0 1 1-1Z" /><path d="M4 17h15M9 7l-2 3 2 3m5-6 2 3-2 3" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  bookmark: <path d="M6 4h12v17l-6-4-6 4Z" />,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  external: <path d="M14 4h6v6M20 4 10 14M10 5H4v15h15v-6" />,
  download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />,
  check: <path d="m5 12 4 4L19 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  chevron: <path d="m7 10 5 5 5-5" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17" /></>,
  alert: <><path d="m12 3 10 18H2Z" /><path d="M12 9v5m0 3h.01" /></>,
  layers: <><path d="m12 3 10 5-10 5L2 8Z" /><path d="m2 12 10 5 10-5M2 16l10 5 10-5" /></>,
  link: <><path d="m10 13 4-4M9 7l2-2a5 5 0 0 1 7 7l-2 2M15 17l-2 2a5 5 0 0 1-7-7l2-2" /></>,
  shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  sliders: <><path d="M4 7h7m5 0h4M4 17h3m5 0h8" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  sparkles: <><path d="m10 4 2.1 6.4L18.5 12.5l-6.4 2.1L10 21l-2.1-6.4-6.4-2.1 6.4-2.1Z" /><path d="M19 2v5m-2.5-2.5h5" /></>,
  lockOpen: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M9 10V7a4 4 0 0 1 8 0m-5 8v2" /></>,
  pdf: <><path d="M14 3H5v18h14V8Z" /><path d="M14 3v5h5" /><text x="6" y="17" fontSize="6" fontWeight="700" fill="currentColor" stroke="none">PDF</text></>,
  pdfExternal: <><path d="M11 3H5v18h14v-8M14 3h7v7M21 3l-9 9" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  video: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3Z" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />,
  folderPlus: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" /><path d="M12 10v6m-3-3h6" /></>,
  tag: <><path d="M3 4h8l10 10-7 7L3 10Z" /><circle cx="7.5" cy="8" r=".75" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 4h3" /></>,
  text: <><path d="M4 5h16M4 10h16M4 15h11M4 20h8" /><path d="m18 15 3 3-3 3" /></>,
  message: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h8a8 8 0 0 1 8 8Z" /><path d="M7 8h10M7 12h7" /></>,
  spinner: <><path d="M12 3a9 9 0 1 1-9 9" /><path d="M3 8V3h5" /></>,
  paperclip: <path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8a7 7 0 0 1 10 10l-8 8" />,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3" /></>,
};

export type IconName = keyof typeof paths;
export default function Icon({ name, className, style }: { name: IconName; className?: string; style?: CSSProperties }) {
  return <svg className={className} style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
