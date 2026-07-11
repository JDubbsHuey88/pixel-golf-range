import type { Metadata, Viewport } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'TRANSFORM',
  description: '9-month body transformation tracker',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b0f14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-lg px-4 pt-4 pb-24">{children}</main>
        <Nav />
      </body>
    </html>
  );
}
