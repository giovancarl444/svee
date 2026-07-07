import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from './components/AppShell';
import { geistMono, geistSans, instrumentSerif } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'CORTEX',
  description: 'A single-operator personal brain.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#F4F1EA',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
