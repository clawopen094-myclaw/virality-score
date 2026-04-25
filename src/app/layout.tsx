import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tweet Virality Score — AI Automation Niche',
  description: 'Score your tweets before posting. Predict impressions, tier, and get actionable recommendations. Ridge Regression trained on 925 real tweets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: '#000000', color: '#f5f5f5', fontFamily: 'Inter, system-ui, sans-serif', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}>
        {children}
      </body>
    </html>
  );
}
