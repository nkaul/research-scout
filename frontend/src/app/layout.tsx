import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Research Scout — A little curiosity goes a long way',
  description: 'A little curiosity goes a long way. Discover Research across papers, videos, data and repositories.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
