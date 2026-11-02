import './globals.css';

export const metadata = {
  title: 'SKYBOUND — Procedural World Flight Simulator',
  description: 'Fly a Cessna 182 Skylane over a new procedurally generated world on every visit, lit by real HDR skies. Built with Next.js and three.js.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07111c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
