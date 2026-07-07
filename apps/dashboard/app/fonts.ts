import localFont from 'next/font/local';

// Vendored locally (Constraint §4 — the browser makes NO third-party font
// requests). Files live in ./fonts and are committed to the repo.

export const geistSans = localFont({
  src: [
    { path: './fonts/Geist-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Geist-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Geist-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-geist-sans',
  display: 'swap',
});

export const geistMono = localFont({
  src: [
    { path: './fonts/GeistMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/GeistMono-Medium.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const instrumentSerif = localFont({
  src: [{ path: './fonts/InstrumentSerif-Italic.woff2', weight: '400', style: 'italic' }],
  variable: '--font-instrument-serif',
  display: 'swap',
});
