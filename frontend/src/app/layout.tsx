import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Research Scout — Follow the evidence',
  description: 'A focused workspace for discovering papers, inspecting their provenance and keeping a human-reviewed shortlist.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
