'use client';

import { useState, useCallback, useRef } from 'react';
import { score, type ScoreResult, type PredictionInput } from '@/lib/virality';

// ─── Color tokens ───────────────────────────────────────────────────────────
const TIER = {
  MEGA:    { bg: '#7f1d1d', border: '#ef4444', glow: '#ef4444', label: 'MEGA', emoji: '🔥' },
  HIGH:    { bg: '#78350f', border: '#f97316', glow: '#f97316', label: 'HIGH', emoji: '⚡' },
  MEDIUM:  { bg: '#1e3a5f', border: '#3b82f6', glow: '#3b82f6', label: 'MEDIUM', emoji: '📈' },
  LOW:     { bg: '#134e4a', border: '#14b8a6', glow: '#14b8a6', label: 'LOW', emoji: '📊' },
  MINIMAL: { bg: '#1f2937', border: '#6b7280', glow: '#6b7280', label: 'MINIMAL', emoji: '🔇' },
};

const FACTOR_LABELS: Record<string, string> = {
  log_fl:        'Follower count (log)',
  verified:      'X Premium badge',
  is_weekend:    'Weekend post',
  is_prime:      'Prime time (20–22 UTC)',
  is_late_night: 'Late night (01–03 UTC)',
  is_original:   'Original tweet',
  is_quote:      'Quote tweet',
  has_workflow:  'Workflow/automation keywords',
  has_ai_agent:  'AI agent keywords',
  has_llm:       'LLM/GPT keywords',
  has_launch:    'Launch/announcement keywords',
  has_opinion:   'Opinion / hot take',
  has_study:     'Study / research keywords',
  has_dev:       'Developer tool keywords',
  text_len:      'Text length',
  word_count:    'Word count',
  has_link:      'Contains a link',
  has_hashtag:   'Has hashtag(s)',
  has_mention:   'Has @mention(s)',
  has_thread:    'Thread format',
};

// ─── Animated arc gauge ──────────────────────────────────────────────────────
function Gauge({ score, tier }: { score: number; tier: keyof typeof TIER }) {
  const r = 52;
  const circ = Math.PI * r; // half-circle
  const filled = (score / 100) * circ;
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

      {/* Track */}
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none"
        stroke="#1f2937" strokeWidth="12" strokeLinecap="round"/>

      {/* Filled arc */}
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none"
        stroke={c.glow} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        filter="url(#glow)"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease' }}/>

      {/* Score text */}
      <text x="80" y="70" textAnchor="middle" fontSize="22" fontWeight="800" fill={c.glow}>
        {score}
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
  const pct = Math.min(100, abs * 60); // scale for visual
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
    if (!text.trim() || text.length > 280) return;
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

    // Small delay for loading feel
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
            AI Automation Niche · v2.0
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white">
            Tweet <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Virality</span> Score
          </h1>
          <p className="text-gray-500 text-sm">
            Ridge Regression · CV R² 0.516 · trained on 7,138 tweets
          </p>
        </div>

        {/* Main card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5 shadow-2xl shadow-black">

          {/* Tweet input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Your Tweet
              </label>
              <span className={`text-xs font-mono ${text.length > 280 ? 'text-red-400' : 'text-gray-500'}`}>
                {text.length}/280
              </span>
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's happening? Draft your tweet and see its viral potential..."
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm leading-relaxed"
              rows={4}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runPrediction();
              }}
            />
            <div className="flex justify-between mt-1 text-xs text-gray-600">
              <span>{text.trim().split(/\s+/).filter(Boolean).length} words</span>
              <span>⌘ + Enter to score</span>
            </div>
          </div>

          {/* Followers + Verified */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">Followers</label>
              <input
                type="number"
                value={followers}
                onChange={e => setFollowers(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">X Premium</label>
              <button
                onClick={() => setVerified(v => !v)}
                className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  verified
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-900'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  {verified ? (
                    <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.438-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.286-.06-.426-.16l.836-1.492 3.038 2.25a.48.48 0 0 1-.18.834H9.5c-.143 0-.286-.06-.426-.16l.836-1.492 3.038 2.25a.48.48 0 0 1-.18.834H6c-.143 0-.286-.06-.426-.16l.836-1.492L8.86 13.5l-.836 1.492a.48.48 0 0 1-.426.16H4.5c-.143 0-.286-.06-.426-.16l.836-1.492L3.1 12l.836-1.492a.48.48 0 0 1 .426-.16h2.5c.143 0 .286.06.426.16l-.836 1.492L7.56 10l3.038-2.25a.48.48 0 0 1 .426-.16H12c.143 0 .286.06.426.16l-.836 1.492 3.038 2.25a.48.48 0 0 1 .18.834h-2.5c-.143 0-.286-.06-.426-.16l.836-1.492L10.31 10l.836-1.492a.48.48 0 0 1 .426-.16H13c.143 0 .286.06.426.16l-.836 1.492L14.56 10l2.5 1.834c.277-.19.6-.307.95-.307.45 0 .85.2 1.15.55.28.33.42.75.4 1.18-.02.43-.2.84-.5 1.15-.3.32-.71.5-1.15.52H12c-.45 0-.85-.2-1.15-.55-.28-.33-.42-.75-.4-1.18.02-.43.2-.84.5-1.15.3-.32.71-.5 1.15-.52h.4z"/></svg>
                    Verified ✓</>
                  ) : 'Not verified'}
                </span>
              </button>
            </div>
          </div>

          {/* Date/Time */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Posting Date & Time
              <span className="text-gray-600 font-normal ml-1">(UTC)</span>
            </label>
            <input
              type="datetime-local"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
            />
          </div>

          {/* Tweet type */}
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
            disabled={!text.trim() || text.length > 280 || loading}
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
                  </div>
                </div>
                <Gauge score={result.score} tier={result.tier as keyof typeof TIER} />
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
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">💡 Recommendations</p>
                <ul className="space-y-2">
                  {result.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                      <span className="text-blue-400 mt-0.5 flex-shrink-0">→</span>
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
          Model: Ridge Regression · 7,138 tweets · AI automation niche · Not financial advice
        </p>
      </div>
    </div>
  );
}
