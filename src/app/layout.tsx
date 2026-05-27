import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ads Metrics — Facebook Ads Dashboard',
  description: 'Plataforma profissional de análise de métricas do Facebook Ads. Acompanhe impressões, cliques, CTR, ROAS, CPM, CPC e muito mais.',
  keywords: 'facebook ads, métricas, dashboard, ROAS, CTR, CPC, marketing digital',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
