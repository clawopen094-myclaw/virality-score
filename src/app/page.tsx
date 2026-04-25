'use client';

import { useState, useCallback } from 'react';
import { score, type ScoreResult, type PredictionInput } from '@/lib/virality';

const TIER_COLORS: Record<string, string> = {
  MEGA:    'bg-red-600',
  HIGH:    'bg-orange-500',
  MEDIUM:  'bg-blue-500',
  LOW:     'bg-cyan-500',
  MINIMAL: 'bg-gray-400',
};

const TIER_BG: Record<string, string> = {
  MEGA:    'bg-red-50 border-red-200',
  HIGH:    'bg-orange-50 border-orange-200',
  MEDIUM:  'bg-blue-50 border-blue-200',
  LOW:     'bg-cyan-50 border-cyan-200',
  MINIMAL: 'bg-gray-50 border-gray-200',
};

const FACTOR_LABELS: Record<string, string> = {
  log_fl:        'Follower count (log)',
  verified:      'X Premium badge',
  hour_sin:      'Hour (sin)',
  hour_cos:      'Hour (cos)',
  day_sin:       'Day of week (sin)',
  day_cos:       'Day of week (cos)',
  is_weekend:    'Weekend post',
  is_prime:      'Prime time (20-22 UTC)',
  is_late_night: 'Late night (01-03 UTC)',
  is_original:   'Original tweet',
  is_quote:      'Quote tweet',
  has_workflow:  'Workflow/automation keywords',
  has_ai_agent:  'AI agent keywords',
  has_llm:       'LLM/GPT keywords',
  has_launch:    'Launch/announcement keywords',
  has_opinion:   'Opinion/take keywords',
  has_study:     'Study/research keywords',
  has_dev:       'Developer tool keywords',
  text_len:      'Text length',
  word_count:    'Word count',
  has_link:      'Contains link',
  has_hashtag:   'Has hashtag(s)',
  has_mention:   'Has @mention(s)',
  has_thread:    'Thread format',
};

function Gauge({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#f97316' : score >= 55 ? '#3b82f6' : score >= 40 ? '#06b6d4' : '#9ca3af';

  return (
    <svg viewBox="0 0 120 80" className="w-28 mx-auto">
      <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round"/>
      <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 0.6s ease' }}/>
      <text x="60" y="62" textAnchor="middle" fontSize="14" fontWeight="700" fill={color}>{score}</text>
      <text x="60" y="74" textAnchor="middle" fontSize="7" fill="#9ca3af">/ 100</text>
    </svg>
  );
}

function ResultCard({ result }: { result: ScoreResult }) {
  return (
    <div className={`rounded-xl border p-5 ${TIER_BG[result.tier]}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${TIER_COLORS[result.tier]}`}>
              {result.tier}
            </span>
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              {result.confidence} confidence
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{result.predicted_views_fmt}</p>
          <p className="text-xs text-gray-500">predicted impressions</p>
        </div>
        <Gauge score={result.score} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {/* Helpful factors */}
        {Object.keys(result.helpful_factors).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">↑ Helps</p>
            <ul className="space-y-1">
              {Object.entries(result.helpful_factors).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2 text-sm text-green-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"/>
                  <span className="flex-1">{FACTOR_LABELS[k] || k}</span>
                  <span className="text-green-600 font-mono text-xs">+{v}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Harmful factors */}
        {Object.keys(result.harmful_factors).length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-2">↓ Hurts</p>
            <ul className="space-y-1">
              {Object.entries(result.harmful_factors).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2 text-sm text-red-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"/>
                  <span className="flex-1">{FACTOR_LABELS[k] || k}</span>
                  <span className="text-red-500 font-mono text-xs">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recommendations */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">💡 Recommendations</p>
        <ul className="space-y-1">
          {result.recommendations.map((r, i) => (
            <li key={i} className="text-sm text-gray-700 flex gap-2">
              <span className="text-gray-400 flex-shrink-0">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState('');
  const [followers, setFollowers] = useState(5000);
  const [verified, setVerified] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [isReply, setIsReply] = useState(false);
  const [isQuote, setIsQuote] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);

  const handleScore = useCallback(() => {
    if (!text.trim()) return;
    const createdAt = new Date(date).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'UTC', timeZoneName: 'short'
    }).replace(' GMT', ' +0000').replace(' UTC', ' +0000');

    // Format: "Thu Apr 24 18:00:00 +0000 2026"
    const dt = new Date(date);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const created = `${days[dt.getUTCDay()]} ${months[dt.getUTCMonth()]} ${String(dt.getUTCDate()).padStart(2,'0')} ${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}:${String(dt.getUTCSeconds()).padStart(2,'0')} +0000 ${dt.getUTCFullYear()}`;

    const input: PredictionInput = {
      text: text.trim(),
      author_followers: followers,
      author_blue_verified: verified,
      created_at: created,
      is_reply: isReply,
      is_quote: isQuote,
    };
    setResult(score(input));
  }, [text, followers, verified, date, isReply, isQuote]);

  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Tweet Virality Score</h1>
          <p className="text-gray-500 mt-1">AI automation niche · Ridge Regression · CV R² 0.516</p>
        </div>

        {/* Input card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          {/* Tweet textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tweet</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's happening? Draft your tweet and see its viral potential..."
              className="w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
            />
            <div className="flex justify-between mt-1">
              <span className={`text-xs ${charCount > 280 ? 'text-red-500' : 'text-gray-400'}`}>
                {charCount}/280
              </span>
              <span className="text-xs text-gray-400">{wordCount} words</span>
            </div>
          </div>

          {/* Followers + Verified */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Followers</label>
              <input
                type="number"
                value={followers}
                onChange={e => setFollowers(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">X Premium?</label>
              <button
                onClick={() => setVerified(v => !v)}
                className={`w-full rounded-lg px-4 py-2 font-semibold text-sm transition-colors ${
                  verified
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {verified ? '✓ Verified' : 'Not verified'}
              </button>
            </div>
          </div>

          {/* Date/Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Posting Date & Time <span className="text-gray-400 font-normal">(UTC)</span>
            </label>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tweet type */}
          <div className="flex gap-4">
            <button
              onClick={() => setIsReply(r => !r)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isReply ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Reply{isReply ? ' ✓' : ''}
            </button>
            <button
              onClick={() => setIsQuote(q => !q)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isQuote ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Quote{isQuote ? ' ✓' : ''}
            </button>
          </div>

          {/* Score button */}
          <button
            onClick={handleScore}
            disabled={!text.trim() || charCount > 280}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
          >
            Predict Virality
          </button>
        </div>

        {/* Result */}
        {result && <ResultCard result={result} />}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Trained on 7,138 tweets · AI automation niche · Not financial advice
        </p>
      </div>
    </main>
  );
}
