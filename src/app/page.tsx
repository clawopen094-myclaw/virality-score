'use client';

import { useState, useCallback, useRef } from 'react';
import { score, type ScoreResult, type PredictionInput } from '@/lib/virality-v3';

// ─── Color tokens ───────────────────────────────────────────────────────────
const TIER = {
  MEGA:    { bg: '#7f1d1d', border: '#ef4444', glow: '#ef4444', label: 'MEGA', emoji: '🔥' },
  HIGH:    { bg: '#78350f', border: '#f97316', glow: '#f97316', label: 'HIGH', emoji: '⚡' },
  MEDIUM:  { bg: '#1e3a5f', border: '#3b82f6', glow: '#3b82f6', label: 'MEDIUM', emoji: '📈' },
  LOW:     { bg: '#134e4a', border: '#14b8a6', glow: '#14b8a6', label: 'LOW', emoji: '📊' },
  MINIMAL: { bg: '#1f2937', border: '#6b7280', glow: '#6b7280', label: 'MINIMAL', emoji: '🔇' },
};

const FACTOR_LABELS: Record<string, string> = {
  log_fl:            'Follower count (log)',
  verified:          'X Premium badge',
  is_weekend:        'Weekend post',
  is_prime:          'Prime time (14-23 UTC)',
  is_late_night:     'Late night (00-05 UTC)',
  is_early_morning:  'Early morning (06-07 UTC)',
  is_lunch:          'Lunch time (11-13 UTC)',
  is_best_hour:      'Best hour (6-7,10,15,17,23)',
  is_original:       'Original tweet',
  is_reply:          'Reply',
  is_quote:          'Quote tweet',
  has_workflow:      'Workflow/automation kw',
  has_ai_agent:      'AI agent keywords',
  has_llm:           'LLM/GPT keywords',
  has_niche:         'Niche keywords (combined)',
  has_launch:        'Launch/announce kw',
  has_opinion:       'Opinion / hot take',
  has_study:         'Study / research kw',
  has_dev:           'Developer tool kw',
  text_len:          'Text length',
  word_count:        'Word count',
  has_link:          'Contains a link',
  has_hashtag:       'Has hashtag(s)',
  has_mention:       'Has @mention(s)',
  has_thread:         'Thread format',
  has_media:         'Has media',
};

// ─── Animated arc gauge ──────────────────────────────────────────────────────
function Gauge({ score: s, tier }: { score: number; tier: keyof typeof TIER }) {
  const r = 52;
  const circ = Math.PI * r;
  const filled = (s / 100) * circ;
  const c = TIER[tier];

  return (
    <svg viewBox="0 0 160 100" className="w-36">
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y2="0%">
          <stop offset="0%" stopColor={c.glow} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c.glow} stopOpacity="1" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none"
        stroke="#1f2937" strokeWidth="12" strokeLinecap="round"/>
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none"
        stroke={c.glow} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        filter="url(#glow)"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease' }}/>
      <text x="80" y="70" textAnchor="middle" fontSize="22" fontWeight="800" fill={c.glow}>
        {s}
      </text>
      <text x="80" y="86" textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="500" letterSpacing="2">
        VIRALITY SCORE
      </text>
    </svg>
  );
}

// ─── Tier badge ──────────────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: keyof typeof TIER }) {
  const t = TIER[tier];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border"
      style={{ color: t.glow, borderColor: t.glow + '60', background: t.bg + '40' }}>
      <span>{t.emoji}</span>
      <span>{t.label}</span>
    </span>
  );
}

// ─── Factor bar ──────────────────────────────────────────────────────────────
function FactorBar({ label, value }: { label: string; value: number }) {
  const abs = Math.abs(value);
  const positive = value > 0;
  const pct = Math.min(100, abs * 60);
  const color = positive ? '#22c55e' : '#ef4444';

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 text-gray-400 text-xs truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{
          width: `${pct}%`,
          background: color,
          marginLeft: positive ? 0 : 'auto',
          marginRight: positive ? 'auto' : 0,
          transition: 'width 0.6s ease',
        }}/>
      </div>
      <span className="w-12 text-right font-mono text-xs" style={{ color }}>
        {positive ? '+' : ''}{value.toFixed(3)}
      </span>
    </div>
  );
}

// ─── Main app ────────────────────────────────────────────────────────────────
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
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runPrediction = useCallback(() => {
    if (!text.trim()) return;
    setLoading(true);

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

    setTimeout(() => {
      setResult(score(input));
      setLoading(false);
    }, 300);
  }, [text, followers, verified, date, isReply, isQuote]);

  const allFactors = result ? { ...result.helpful_factors, ...result.harmful_factors } : {};
  const sortedFactors = Object.entries(allFactors)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">

      {/* Background gradient mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600 opacity-5 rounded-full blur-3xl"/>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-600 opacity-5 rounded-full blur-3xl"/>
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-10 space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-1 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
            AI Automation Niche · v3.0 · CV R²=0.703
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Tweet <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Virality</span> Score
          </h1>
          <p className="text-gray-500 text-sm">Predict impressions &amp; likes before you post</p>
        </div>

        {/* Input card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">

          {/* Tweet textarea */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Tweet</label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's happening in the AI automation world?"
              maxLength={8200}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
            />
            <div className="flex justify-between mt-1 text-xs text-gray-600">
              <span>{text.length} chars</span>
              <span className={text.length > 260 ? (text.length > 280 ? 'text-red-400' : 'text-yellow-400') : ''}>
                {text.length > 280 ? 'Over limit!' : `${280 - text.length} remaining`}
              </span>
            </div>
          </div>

          {/* Followers */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Followers — <span className="text-blue-400 font-mono">{followers.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={10}
              max={5_000_000}
              step={followers < 1000 ? 10 : followers < 10000 ? 100 : followers < 100000 ? 500 : followers < 1000000 ? 1000 : 10000}
              value={followers}
              onChange={e => setFollowers(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>10</span>
              <span>5M</span>
            </div>
          </div>

          {/* Verified + datetime row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">X Premium</label>
              <button
                onClick={() => setVerified(v => !v)}
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-all border ${
                  verified
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {verified ? '✓ Verified' : 'Not verified'}
              </button>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Post time (UTC)</label>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Post as */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Post as</label>
            <div className="flex gap-3">
              {[
                { label: 'Original tweet', sublabel: 'Best distribution', active: !isReply && !isQuote, onClick: () => { setIsReply(false); setIsQuote(false); } },
                { label: 'Reply', sublabel: 'Limited reach', active: isReply, onClick: () => { setIsReply(true); setIsQuote(false); } },
                { label: 'Quote tweet', sublabel: 'Mixed results', active: isQuote, onClick: () => { setIsReply(false); setIsQuote(true); } },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={opt.onClick}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all border ${
                    opt.active
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                  <div className={`text-xs mt-0.5 ${opt.active ? 'text-blue-200' : 'text-gray-600'}`}>
                    {opt.sublabel}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={runPrediction}
            disabled={!text.trim() || loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:from-gray-800 disabled:to-gray-800 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-900 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Scoring...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Predict Virality</>
            )}
          </button>
        </div>

        {/* Result */}
        {result && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl shadow-black animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Result header */}
            <div className="bg-gray-900 border-b border-gray-800 p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <TierBadge tier={result.tier as keyof typeof TIER} />
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      result.confidence === 'low' ? 'bg-red-900 text-red-300' :
                      result.confidence === 'medium-high' ? 'bg-yellow-900 text-yellow-300' :
                      'bg-green-900 text-green-300'
                    }`}>
                      {result.confidence.replace('-', ' ')} confidence
                    </span>
                  </div>
                  <div>
                    <p className="text-5xl font-black text-white tracking-tight">
                      {result.predicted_views_fmt}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">predicted impressions</p>
                    <p className="text-2xl font-bold text-gray-300 mt-2">
                      &#8776; {result.predicted_likes_fmt} <span className="text-sm font-normal text-gray-500">likes</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Gauge score={result.score} tier={result.tier as keyof typeof TIER} />
                  <p className="text-xs text-gray-600 mt-1">R&#178;=0.703 &#183; 925 tweets</p>
                </div>
              </div>
            </div>

            {/* Factor breakdown */}
            {sortedFactors.length > 0 && (
              <div className="border-t border-gray-800 px-6 py-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Factor Breakdown</p>
                <div className="space-y-3">
                  {sortedFactors.map(([key, value]) => (
                    <FactorBar
                      key={key}
                      label={FACTOR_LABELS[key] || key}
                      value={value}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <div className="border-t border-gray-800 px-6 py-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Recommendations</p>
                <ul className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                      <span className="text-blue-400 mt-0.5 flex-shrink-0">&#8594;</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-700 pb-4">
          Model: Ridge Regression &#183; 925 real tweets &#183; CV R&#178;=0.703 &#183; AI automation niche &#183; Not financial advice
        </p>
      </div>
    </div>
  );
}
