import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tweet Virality Score — AI Automation Niche',
  description: 'Score your tweets before posting. Predict impressions, tier, and get actionable recommendations. Ridge Regression trained on 7,138 tweets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  );
}
