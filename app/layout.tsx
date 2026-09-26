import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Global Finance – Digital Finance Platform',
  description: 'Secure • Transparent • Digital Finance Platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
