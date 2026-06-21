import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SGK Maaş & Emeklilik Hesaplama',
  description: 'Hizmet dökümüne göre emeklilik şartları ve bağlanacak maaş hesabı',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
