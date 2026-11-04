import { Fraunces } from 'next/font/google';
import './globals.css';

// Cartographic display face for landmark names, charts and banners.
const fraunces = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], weight: ['400', '500', '600'], variable: '--font-display', display: 'swap' });

export const metadata = {
  title: 'SKYBOUND — First Charter',
  description: 'Every world is uncharted. Fly a Cessna 182 over a new procedurally generated wilderness on every visit, survey its landmarks and land on bush strips. Built with Next.js and three.js.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07111c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={fraunces.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
