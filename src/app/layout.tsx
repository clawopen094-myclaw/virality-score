import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tweet Virality Score — AI Automation Niche',
  description: 'Score your tweets before posting. Predict impressions, tier, and get actionable recommendations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
