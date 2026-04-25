/**
 * Twitter Virality Prediction Pipeline v2.0 — TypeScript Port
 * Model: Ridge Regression on log(views) | CV R²: 0.516
 */

const FEATURES = [
  'log_fl', 'verified', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
  'is_weekend', 'is_prime', 'is_late_night', 'is_original', 'is_quote',
  'has_workflow', 'has_ai_agent', 'has_llm', 'has_launch', 'has_opinion',
  'has_study', 'has_dev', 'text_len', 'word_count',
  'has_link', 'has_hashtag', 'has_mention', 'has_thread'
] as const;

const BETA: Record<string, number> = {
  log_fl:        0.4256,
  verified:      0.3388,
  hour_sin:      0.0,
  hour_cos:      0.0,
  day_sin:       0.5261,
  day_cos:       0.011,
  is_weekend:    0.7331,
  is_prime:      0.3733,
  is_late_night: 0.1977,
  is_original:   1.5307,
  is_quote:      2.5867,
  has_workflow: -1.0100,
  has_ai_agent:  0.2069,
  has_llm:       0.8475,
  has_launch:    0.2772,
  has_opinion:  -0.0842,
  has_study:     0.1618,
  has_dev:       0.1587,
  text_len:     -0.0010,
  word_count:    0.0062,
  has_link:      0.0998,
  has_hashtag:  -0.5420,
  has_mention:   0.8404,
  has_thread:    0.8535,
};

export type Tier = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'MEGA';
export type Confidence = 'low' | 'medium' | 'medium-high';

export interface ScoreResult {
  predicted_views: number;
  predicted_views_fmt: string;
  tier: Tier;
  score: number; // 0-100
  log_views: number;
  confidence: Confidence;
  helpful_factors: Record<string, number>;
  harmful_factors: Record<string, number>;
  recommendations: string[];
  features: Record<string, number>; // active feature values
}

export interface PredictionInput {
  text: string;
  author_followers: number;
  author_blue_verified?: boolean;
  created_at?: string; // optional, defaults to "Thu 14:00 UTC"
  is_reply?: boolean;
  is_quote?: boolean;
}

function parseDT(ts: string): Date | null {
  const formats = [
    "EEE MMM dd HH:mm:ss Z yyyy",
    "yyyy-MM-dd'T'HH:mm:ssZ",
    "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
  ];
  for (const fmt of formats) {
    try {
      // Simple parser for common formats
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
    } catch {}
  }
  return null;
}

function extractFeatures(
  text: string,
  followers: number,
  verified: boolean,
  hour: number,
  dayIdx: number
): Record<string, number> {
  const tLower = text.toLowerCase();
  const isOriginal = true; // default (is_reply/is_quote handled at score level)

  const features: Record<string, number> = {
    log_fl:       Math.log1p(followers),
    verified:     verified ? 1 : 0,
    hour_sin:     Math.sin((2 * Math.PI * hour) / 24),
    hour_cos:     Math.cos((2 * Math.PI * hour) / 24),
    day_sin:      Math.sin((2 * Math.PI * dayIdx) / 7),
    day_cos:      Math.cos((2 * Math.PI * dayIdx) / 7),
    is_weekend:   dayIdx >= 5 ? 1 : 0,
    is_prime:     [20, 21, 22].includes(hour) ? 1 : 0,
    is_late_night:[1, 2, 3].includes(hour) ? 1 : 0,
    is_original:  1,
    is_quote:     0,
    has_workflow: /\b(workflow|automation|n8n|zapier|make\.com|pipeline)\b/.test(tLower) ? 1 : 0,
    has_ai_agent: /\b(agent|agentic|multi-agent|autonomous|crewai|langchain|autogen)\b/.test(tLower) ? 1 : 0,
    has_llm:      /\b(llm|gpt|claude|gemini|grok|mistral|o1|o3|gpt-)\b/.test(tLower) ? 1 : 0,
    has_launch:   /\b(launch|release|new|introducing|announce)\b/.test(tLower) ? 1 : 0,
    has_opinion:  /\b(think|opinion|wrong|right|hot take|unpopular|disagree)\b/.test(tLower) ? 1 : 0,
    has_study:    /\b(study|research|paper|findings)\b/.test(tLower) ? 1 : 0,
    has_dev:      /\b(api|code|cursor|replit|vscode|github)\b/.test(tLower) ? 1 : 0,
    text_len:     text.length,
    word_count:   text.split(/\s+/).length,
    has_link:     /http/.test(tLower) ? 1 : 0,
    has_hashtag:  text.includes('#') ? 1 : 0,
    has_mention:  text.includes('@') ? 1 : 0,
    has_thread:   text.includes('\n') ? 1 : 0,
  };

  return features;
}

function fmtViews(v: number): string {
  v = Math.max(0, v);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

function getTier(score: number): Tier {
  if (score >= 85) return 'MEGA';
  if (score >= 70) return 'HIGH';
  if (score >= 55) return 'MEDIUM';
  if (score >= 40) return 'LOW';
  return 'MINIMAL';
}

function getConfidence(followers: number): Confidence {
  if (followers < 1_000) return 'medium';
  if (followers < 50_000) return 'medium-high';
  return 'low';
}

const LOG_MIN = 0.69;
const LOG_MAX = 13.82;

export function score(input: PredictionInput): ScoreResult {
  const {
    text,
    author_followers,
    author_blue_verified = false,
    created_at,
    is_reply = false,
    is_quote = false,
  } = input;

  // Parse time or default to Thu 14:00 UTC
  let hour = 14;
  let dayIdx = 3; // Thursday
  if (created_at) {
    const dt = parseDT(created_at);
    if (dt) {
      hour = dt.getUTCHours();
      dayIdx = dt.getUTCDay();
    }
  }

  const features = extractFeatures(text, author_followers, author_blue_verified, hour, dayIdx);

  // Override for replies/quotes
  if (is_reply) {
    features.is_original = 0;
  }
  if (is_quote) {
    features.is_original = 0;
    features.is_quote = 1;
  }

  // Compute prediction
  let predLog = 0;
  for (const key of FEATURES) {
    predLog += features[key] * BETA[key];
  }
  const predViews = Math.expm1(Math.max(0, predLog));

  // Normalize to 0-100
  const score = Math.min(100, Math.max(0, ((predLog - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100));
  const tier = getTier(score);
  const confidence = getConfidence(author_followers);

  // Component breakdown
  const comps: Record<string, number> = {};
  for (const key of FEATURES) {
    if (features[key] !== 0) {
      comps[key] = Math.round(features[key] * BETA[key] * 1000) / 1000;
    }
  }

  const helpful = Object.entries(comps)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, number>);

  const harmful = Object.entries(comps)
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, number>);

  // Recommendations
  const recs: string[] = [];
  if (author_followers < 500)
    recs.push(`Follower count (${author_followers.toLocaleString()}) is very low. Focus on engagement-first content.`);
  if (!author_blue_verified)
    recs.push("Get X Premium ($8/mo) for verified badge — model shows ~1.4× reach boost.");
  if (is_reply)
    recs.push("Replying limits reach. Post as original tweet for maximum distribution.");
  if (is_quote)
    recs.push("Quote tweets have mixed results. Original tweets tend to perform better.");

  if (hour && ![20,21,22,1,2,3,14,15,18].includes(hour))
    recs.push(`Posting at ${hour.toString().padStart(2,'0')}:00 UTC is suboptimal. Best: 14-15 UTC or 18-22 UTC.`);

  const tLower = text.toLowerCase();
  const missing: string[] = [];
  if (!/\b(llm|gpt|claude|gemini|agent|automation|workflow|n8n|zapier)\b/.test(tLower))
    missing.push("AI/automation keywords");
  if (text.length < 50)
    missing.push("more content (tweets under 50 chars get less engagement)");
  if ((text.match(/#/g) || []).length > 1)
    missing.push("fewer hashtags (1 max — overuse is penalized)");
  if ((text.match(/@/g) || []).length > 2)
    missing.push("fewer @mentions (max 2)");
  if (!missing.length)
    recs.push("Good signal profile! Tweet has virality characteristics.");
  else
    recs.push(`Adding ${missing.join(', ')} could improve reach.`);

  return {
    predicted_views: Math.round(predViews),
    predicted_views_fmt: fmtViews(predViews),
    tier,
    score: Math.round(score * 10) / 10,
    log_views: Math.round(predLog * 100) / 100,
    confidence,
    helpful_factors: helpful,
    harmful_factors: harmful,
    recommendations: recs,
    features,
  };
}
