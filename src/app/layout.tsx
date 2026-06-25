import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ads Metrics — Dashboard de Marketing Digital',
  description: 'Plataforma profissional de análise de métricas de campanhas publicitárias.',
};

// Aplica o tema salvo ANTES do primeiro paint para evitar flash (FOUC).
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
