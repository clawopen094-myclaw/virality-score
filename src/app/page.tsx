'use client';

import { useState, useCallback, useRef } from 'react';
import { score, type ScoreResult, type PredictionInput } from '@/lib/virality-v3';

// ─── Design tokens (Cinematic Dark — RunwayML inspired) ──────────────────────
const TOKENS = {
  bg: '#000000',
  bgAlt: '#0a0a0a',
  surface: '#141414',
  surface2: '#1e1e1e',
  text: '#f5f5f5',
  textMuted: '#888888',
  textDim: '#555555',
  border: '#2a2a2a',
  borderBright: '#3a3a3a',
  magenta: '#ff2d8e',
  cyan: '#00e5ff',
  purple: '#a855f7',
  gradientMagentaCyan: 'linear-gradient(135deg, #ff2d8e 0%, #a855f7 50%, #00e5ff 100%)',
  gradientWarm: 'linear-gradient(135deg, #ff6b35 0%, #f72585 100%)',
};

const TIER_CONFIG = {
  MEGA:    { label: 'MEGA',    color: '#ff2d8e', bg: 'rgba(255,45,142,0.12)',  border: 'rgba(255,45,142,0.4)' },
  HIGH:    { label: 'HIGH',   color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.4)' },
  MEDIUM:  { label: 'MEDIUM', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.4)' },
  LOW:     { label: 'LOW',    color: '#14b8a6', bg: 'rgba(20,184,166,0.12)',   border: 'rgba(20,184,166,0.4)' },
  MINIMAL: { label: 'MINIMAL',color: '#6b7280', bg: 'rgba(107,114,128,0.12)',  border: 'rgba(107,114,128,0.4)' },
};

const FACTOR_LABELS: Record<string, string> = {
  log_followers:      'Follower count (log)',
  verified:           'X Premium badge',
  is_weekend:         'Weekend post',
  is_prime:           'Prime time (14-23 UTC)',
  is_late_night:      'Late night (00-05 UTC)',
  is_early_morning:   'Early morning (06-07 UTC)',
  is_lunch:           'Lunch time (11-13 UTC)',
  is_best_hour:       'Best hour (6-7,10,15,17,23 UTC)',
  is_original:        'Original tweet',
  is_reply:           'Reply',
  is_quote:           'Quote tweet',
  has_workflow:       'Workflow/automation kw',
  has_ai_agent:       'AI agent keywords',
  has_llm:            'LLM/GPT keywords',
  has_niche:          'Niche keywords (combined)',
  has_launch:         'Launch/announce kw',
  has_opinion:        'Opinion / hot take',
  has_study:          'Study / research kw',
  has_dev:            'Developer tool kw',
  text_len:           'Text length',
  word_count:         'Word count',
  has_link:           'Contains a link',
  has_hashtag:        'Has hashtag(s)',
  has_mention:        'Has @mention(s)',
  has_thread:         'Thread format',
  has_media:          'Has media',
};

// ─── Animated arc gauge ──────────────────────────────────────────────────────
function Gauge({ score: s, tier }: { score: number; tier: keyof typeof TIER_CONFIG }) {
  const r = 52;
  const circ = Math.PI * r;
  const filled = Math.min(1, Math.max(0, s / 100)) * circ;
  const c = TIER_CONFIG[tier];

  return (
    <svg viewBox="0 0 160 100" style={{ width: 140, height: 88, overflow: 'visible' }}>
      <defs>
        <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={c.color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={c.color} stopOpacity="1" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <path d="M 20 82 A 58 58 0 0 1 140 82" fill="none"
        stroke={TOKENS.border} strokeWidth="10" strokeLinecap="round" />
      {/* Fill */}
      <path d="M 20 82 A 58 58 0 0 1 140 82" fill="none"
        stroke={c.color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(2)} ${circ.toFixed(2)}`}
        filter="url(#glow)"
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease' }} />
      {/* Score text */}
      <text x="80" y="68" textAnchor="middle" fontSize="20" fontWeight="800" fill={c.color}>
        {Math.round(s)}
      </text>
      <text x="80" y="84" textAnchor="middle" fontSize="8" fill={TOKENS.textMuted}
        fontFamily="monospace" fontWeight="500" letterSpacing="2">
        VIRALITY
      </text>
    </svg>
  );
}

// ─── Tier badge ──────────────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: keyof typeof TIER_CONFIG }) {
  const t = TIER_CONFIG[tier];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      padding: '4px 12px', borderRadius: 999,
      color: t.color, border: `1px solid ${t.border}`, background: t.bg,
    }}>
      {t.label}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
      <span style={{ width: 160, color: TOKENS.textMuted, fontSize: 12, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 4, background: TOKENS.border, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999,
          width: `${pct}%`,
          background: color,
          marginLeft: positive ? 0 : 'auto',
          marginRight: positive ? 'auto' : 0,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ width: 48, textAlign: 'right', fontFamily: 'monospace', fontSize: 11, color }}>
        {positive ? '+' : ''}{value.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Section heading ────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
      color: TOKENS.textDim, textTransform: 'uppercase', margin: '0 0 16px 0',
    }}>
      {children}
    </p>
  );
}

// ─── Glass card ──────────────────────────────────────────────────────────────
function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'rgba(20,20,20,0.8)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${TOKENS.border}`,
      borderRadius: 16,
      padding: 24,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Gradient text ──────────────────────────────────────────────────────────
function GradientText({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{
      background: TOKENS.gradientMagentaCyan,
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      ...style,
    }}>
      {children}
    </span>
  );
}

// ─── Primary button ──────────────────────────────────────────────────────────
function PrimaryBtn({ children, onClick, disabled, loading }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px 24px',
        borderRadius: 12,
        border: 'none',
        background: disabled ? TOKENS.surface2 : TOKENS.gradientMagentaCyan,
        color: disabled ? TOKENS.textDim : '#fff',
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'opacity 0.2s, transform 0.1s',
        boxShadow: disabled ? 'none' : '0 0 40px rgba(255,45,142,0.25)',
      }}
    >
      {loading ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Scoring...
        </>
      ) : children}
    </button>
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

  const runPrediction = useCallback(() => {
    if (!text.trim()) return;
    setLoading(true);

    const dt = new Date(date);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const created = `${days[dt.getUTCDay()]} ${months[dt.getUTCMonth()]} ${String(dt.getUTCDate()).padStart(2, '0')} ${String(dt.getUTCHours()).padStart(2, '0')}:${String(dt.getUTCMinutes()).padStart(2, '0')}:${String(dt.getUTCSeconds()).padStart(2, '0')} +0000 ${dt.getUTCFullYear()}`;

    const input: PredictionInput = {
      text: text.trim(),
      author_followers: followers,
      author_blue_verified: verified,
      created_at: created,
      is_reply: isReply,
      is_quote: isQuote,
    };

    setTimeout(() => {
      try {
        setResult(score(input));
      } catch (e) {
        console.error('Score error:', e);
      }
      setLoading(false);
    }, 350);
  }, [text, followers, verified, date, isReply, isQuote]);

  const allFactors = result ? { ...result.helpful_factors, ...result.harmful_factors } : {};
  const sortedFactors = Object.entries(allFactors)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 8);

  const postTypeOptions = [
    { label: 'Original', sublabel: 'Best distribution', active: !isReply && !isQuote, fn: () => { setIsReply(false); setIsQuote(false); } },
    { label: 'Reply', sublabel: 'Limited reach', active: isReply, fn: () => { setIsReply(true); setIsQuote(false); } },
    { label: 'Quote', sublabel: 'Mixed results', active: isQuote, fn: () => { setIsReply(false); setIsQuote(true); } },
  ];

  return (
    <div style={{ minHeight: '100vh', background: TOKENS.bg, color: TOKENS.text, fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflowX: 'hidden' }}>

      {/* Global keyframes for spinner */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${TOKENS.bg}; }
        ::-webkit-scrollbar-thumb { background: ${TOKENS.borderBright}; border-radius: 999; }
        * { box-sizing: border-box; }
        input[type="range"] { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999; background: ${TOKENS.border}; outline: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${TOKENS.magenta}; cursor: pointer; box-shadow: 0 0 10px rgba(255,45,142,0.5); }
      `}</style>

      {/* Animated gradient mesh background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%', width: '60%', height: '60%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)',
          animation: 'float 8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '-10%', right: '-10%', width: '55%', height: '55%',
          background: 'radial-gradient(circle, rgba(255,45,142,0.07) 0%, transparent 70%)',
          animation: 'float 10s ease-in-out infinite reverse',
        }} />
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translateX(-50%)',
          width: '50%', height: '50%',
          background: 'radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)',
          animation: 'float 12s ease-in-out infinite',
        }} />
      </div>

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 1, padding: '32px 16px 0', textAlign: 'center' }}>
        {/* Live badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(20,20,20,0.8)', backdropFilter: 'blur(12px)',
          border: `1px solid ${TOKENS.border}`, borderRadius: 999, padding: '6px 16px', marginBottom: 16 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.textMuted, letterSpacing: '0.05em' }}>
            AI AUTOMATION NICHE · v3.0 · CV R²=0.703
          </span>
        </div>

        {/* Hero title */}
        <h1 style={{
          fontSize: 'clamp(36px, 8vw, 64px)', fontWeight: 800, lineHeight: 1.05,
          letterSpacing: '-0.03em', margin: '0 0 8px 0', color: TOKENS.text,
        }}>
          Tweet <GradientText style={{ fontStyle: 'italic' }}>Virality</GradientText> Score
        </h1>
        <p style={{ fontSize: 15, color: TOKENS.textMuted, margin: 0 }}>
          Predict impressions before you post · Trained on 925 real tweets
        </p>
      </header>

      {/* Main content */}
      <main style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '24px 16px 40px' }}>

        {/* Input card */}
        <GlassCard style={{ marginBottom: 16 }}>

          {/* Tweet textarea */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textMuted, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Tweet
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's happening in the AI automation world? Share a thread, hot take, or discovery..."
              maxLength={8200}
              rows={5}
              style={{
                width: '100%', background: TOKENS.bgAlt, border: `1px solid ${TOKENS.border}`,
                borderRadius: 12, padding: '14px 16px', color: TOKENS.text, fontSize: 14,
                fontFamily: 'Inter, system-ui, sans-serif', resize: 'vertical', outline: 'none',
                lineHeight: 1.6, transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = TOKENS.magenta}
              onBlur={e => e.target.style.borderColor = TOKENS.border}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: TOKENS.textDim }}>
              <span>{text.length} chars</span>
              <span style={{ color: text.length > 280 ? (text.length > 300 ? '#ef4444' : '#f59e0b') : '#6b7280' }}>
                {text.length > 280 ? `${text.length - 280} over limit` : `${280 - text.length} remaining`}
              </span>
            </div>
          </div>

          {/* Follower slider */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textMuted, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Followers — <span style={{ color: TOKENS.magenta, fontFamily: 'monospace' }}>{followers.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={10}
              max={5_000_000}
              step={followers < 1000 ? 10 : followers < 10000 ? 100 : followers < 100000 ? 500 : followers < 1000000 ? 1000 : 5000}
              value={followers}
              onChange={e => setFollowers(Number(e.target.value))}
              style={{ width: '100%', accentColor: TOKENS.magenta }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: TOKENS.textDim, marginTop: 4 }}>
              <span>10</span>
              <span>5M</span>
            </div>
          </div>

          {/* Verified + datetime row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textMuted, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                X Premium
              </label>
              <button
                onClick={() => setVerified(v => !v)}
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 12,
                  border: `1px solid ${verified ? TOKENS.magenta : TOKENS.border}`,
                  background: verified ? 'rgba(255,45,142,0.12)' : TOKENS.bgAlt,
                  color: verified ? TOKENS.magenta : TOKENS.textMuted,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: verified ? '0 0 16px rgba(255,45,142,0.2)' : 'none',
                }}
              >
                {verified ? '✓ Premium' : 'Not verified'}
              </button>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textMuted, marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Post time (UTC)
              </label>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  width: '100%', padding: '12px 14px', background: TOKENS.bgAlt,
                  border: `1px solid ${TOKENS.border}`, borderRadius: 12,
                  color: TOKENS.text, fontSize: 13, fontFamily: 'monospace', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Post type */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TOKENS.textMuted, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Post as
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {postTypeOptions.map(opt => (
                <button
                  key={opt.label}
                  onClick={opt.fn}
                  style={{
                    padding: '10px 8px', borderRadius: 10,
                    border: `1px solid ${opt.active ? TOKENS.cyan : TOKENS.border}`,
                    background: opt.active ? 'rgba(0,229,255,0.08)' : TOKENS.bgAlt,
                    color: opt.active ? TOKENS.cyan : TOKENS.textMuted,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <span>{opt.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{opt.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <PrimaryBtn onClick={runPrediction} disabled={!text.trim()} loading={loading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Predict Virality
          </PrimaryBtn>
        </GlassCard>

        {/* Result card */}
        {result && (
          <div style={{
            background: 'rgba(20,20,20,0.85)', backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: `1px solid ${TOKENS.border}`,
            borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 0 80px rgba(255,45,142,0.08), 0 0 40px rgba(0,229,255,0.05)',
            animation: 'fadeIn 0.4s ease-out',
            marginBottom: 16,
          }}>

            {/* Result header */}
            <div style={{ padding: 28, borderBottom: `1px solid ${TOKENS.border}`, position: 'relative', overflow: 'hidden' }}>
              {/* Ambient glow behind score */}
              <div style={{
                position: 'absolute', top: -20, right: 60, width: 200, height: 200,
                background: `radial-gradient(circle, ${TIER_CONFIG[result.tier as keyof typeof TIER_CONFIG]?.color}15 0%, transparent 70%)`,
                pointerEvents: 'none',
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <TierBadge tier={result.tier as keyof typeof TIER_CONFIG} />
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                      background: result.confidence === 'low' ? 'rgba(34,197,94,0.15)' : result.confidence === 'medium-high' ? 'rgba(234,179,8,0.15)' : 'rgba(34,197,94,0.15)',
                      color: result.confidence === 'low' ? '#22c55e' : result.confidence === 'medium-high' ? '#eab308' : '#22c55e',
                      border: `1px solid ${result.confidence === 'low' ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'}`,
                    }}>
                      {result.confidence.replace('-', ' ')} confidence
                    </span>
                  </div>
                  <p style={{ fontSize: 'clamp(40px, 10vw, 56px)', fontWeight: 900, lineHeight: 1, margin: '0 0 4px 0', letterSpacing: '-0.03em' }}>
                    {result.predicted_views_fmt}
                  </p>
                  <p style={{ fontSize: 13, color: TOKENS.textMuted, margin: '0 0 10px 0' }}>predicted impressions</p>
                  <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: TOKENS.text }}>
                    ≈ {result.predicted_likes_fmt} <span style={{ fontSize: 13, fontWeight: 400, color: TOKENS.textMuted }}>likes</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Gauge score={result.score} tier={result.tier as keyof typeof TIER_CONFIG} />
                  <p style={{ fontSize: 10, color: TOKENS.textDim, marginTop: 6, fontFamily: 'monospace' }}>
                    R²=0.703 · 925 tweets
                  </p>
                </div>
              </div>
            </div>

            {/* Factor breakdown */}
            {sortedFactors.length > 0 && (
              <div style={{ padding: 24, borderBottom: `1px solid ${TOKENS.border}` }}>
                <SectionLabel>Factor Breakdown</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortedFactors.map(([key, value]) => (
                    <FactorBar key={key} label={FACTOR_LABELS[key] || key} value={value} />
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {result.recommendations.length > 0 && (
              <div style={{ padding: 24 }}>
                <SectionLabel>Recommendations</SectionLabel>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.recommendations.map((r, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: TOKENS.textMuted, lineHeight: 1.5 }}>
                      <span style={{ color: TOKENS.cyan, flexShrink: 0, marginTop: 1 }}>→</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: 11, color: TOKENS.textDim, paddingBottom: 16, lineHeight: 1.6 }}>
          Ridge Regression · 925 real tweets · CV R²=0.703 · AI automation niche · Not financial advice
        </p>
      </main>
    </div>
  );
}
