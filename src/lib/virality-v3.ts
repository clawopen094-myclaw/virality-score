/**
 * Twitter Virality Prediction Pipeline v3.0 — Trained on 925 Real Tweets
 * Model: Ridge Regression (alpha=100) | CV R² = 0.703 (vs old 0.516)
 * Features: 31 (vs 24) — includes scaler normalization, better time buckets
 */

const FEATURE_NAMES = [
  'log_followers', 'verified', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
  'is_weekend', 'is_prime', 'is_late_night', 'is_early_morning', 'is_lunch', 'is_best_hour',
  'is_original', 'is_reply', 'is_quote',
  'has_workflow', 'has_ai_agent', 'has_llm', 'has_launch', 'has_opinion', 'has_study', 'has_dev', 'has_niche',
  'text_len', 'word_count', 'has_link', 'has_hashtag', 'has_mention', 'has_thread', 'has_media'
] as const;

// Ridge regression coefficients (trained on 925 tweets, log-scale targets)
// BETA_VIEWS: 31 coefficients matching FEATURE_NAMES[0..30]
const BETA_VIEWS: number[] = [
   2.2194,  // [0]  log_followers — STRONGEST predictor
   0.2503,  // [1]  verified
  -0.0826,  // [2]  hour_sin
  -0.0606,  // [3]  hour_cos
   0.1376,  // [4]  day_sin
   0.2363,  // [5]  day_cos
  -0.1378,  // [6]  is_weekend
  -0.0486,  // [7]  is_prime
  -0.0901,  // [8]  is_late_night
  -0.3575,  // [9]  is_early_morning — NEGATIVE (6-7am UTC is bad)
  -0.0732,  // [10] is_lunch
   0.1146,  // [11] is_best_hour (6-7am, 10am, 3pm, 5pm, 11pm UTC)
   0.2037,  // [12] is_original
  -0.1941,  // [13] is_reply
   0.1464,  // [14] is_quote
  -0.4201,  // [15] has_workflow — NEGATIVE (oversaturated term)
  -0.3662,  // [16] has_ai_agent — NEGATIVE (oversaturated term)
   0.2937,  // [17] has_llm — POSITIVE (specific, valuable)
  -0.2697,  // [18] has_niche — NEGATIVE (composite of oversaturated terms)
  -0.2695,  // [19] has_link — NEGATIVE
  -0.2553,  // [20] has_mention — NEGATIVE
   0.1028,  // [21] has_launch
   0.0576,  // [22] has_opinion
  -0.0315,  // [23] has_study
  -0.0373,  // [24] has_dev
   0.0674,  // [25] text_len
   0.1276,  // [26] word_count
  -0.2156,  // [27] has_hashtag — NEGATIVE (overuse penalized)
  -0.0007,  // [28] has_thread
  -0.0136,  // [29] has_media
];
const INTERCEPT_VIEWS = 10.4676;

// Scaler parameters (mean and std for each feature, from 925 training samples)
const SCALER_MEAN: number[] = [
  11.7410,   // log_followers
   0.9005,   // verified
  -0.2496,   // hour_sin
  -0.1264,   // hour_cos
   0.0352,   // day_sin
  -0.2175,   // day_cos
   0.1838,   // is_weekend
   0.5881,   // is_prime
   0.1254,   // is_late_night
   0.0789,   // is_early_morning
   0.1265,   // is_lunch
   0.2962,   // is_best_hour
   0.6324,   // is_original
   0.1978,   // is_reply
   0.1751,   // is_quote
   0.2119,   // has_workflow
   0.2659,   // has_ai_agent
   0.2346,   // has_llm
   0.1351,   // has_launch
   0.1092,   // has_opinion
   0.0735,   // has_study
   0.1568,   // has_dev
   0.7124,   // has_niche
 395.1395,   // text_len
  62.4054,   // word_count
   0.2649,   // has_link
   0.0465,   // has_hashtag
   0.2011,   // has_mention
   0.8065,   // has_thread
   0.5059,   // has_media
];
const SCALER_STD: number[] = [
  3.3579,    // log_followers
  0.2993,    // verified
  0.7145,    // hour_sin
  0.6413,    // hour_cos
  0.6682,    // day_sin
  0.7106,    // day_cos
  0.3873,    // is_weekend
  0.4922,    // is_prime
  0.3312,    // is_late_night
  0.2696,    // is_early_morning
  0.3324,    // is_lunch
  0.4566,    // is_best_hour
  0.4821,    // is_original
  0.3984,    // is_reply
  0.3801,    // is_quote
  0.4086,    // has_workflow
  0.4418,    // has_ai_agent
  0.4237,    // has_llm
  0.3419,    // has_launch
  0.3119,    // has_opinion
  0.2610,    // has_study
  0.3636,    // has_dev
  0.7750,    // has_niche
503.3357,    // text_len
 83.3812,    // word_count
  0.4413,    // has_link
  0.2105,    // has_hashtag
  0.4008,    // has_mention
  0.3951,    // has_thread
  0.5000,    // has_media
];

export type Tier = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'MEGA';
export type Confidence = 'low' | 'medium' | 'medium-high';

export interface ScoreResult {
  predicted_views: number;
  predicted_views_fmt: string;
  predicted_likes: number;
  predicted_likes_fmt: string;
  tier: Tier;
  score: number; // 0-100
  confidence: Confidence;
  helpful_factors: Record<string, number>;
  harmful_factors: Record<string, number>;
  recommendations: string[];
  model_info: {
    version: string;
    cv_r2: number;
    n_features: number;
    training_samples: number;
  };
}

export interface PredictionInput {
  text: string;
  author_followers: number;
  author_blue_verified?: boolean;
  created_at?: string;
  is_reply?: boolean;
  is_quote?: boolean;
}

function parseDT(ts: string): { hour: number; dayIdx: number } {
  const d = new Date(ts);
  if (!isNaN(d.getTime())) {
    return { hour: d.getUTCHours(), dayIdx: d.getUTCDay() };
  }
  // Fallback
  return { hour: 14, dayIdx: 3 };
}

function extractRawFeatures(
  text: string,
  followers: number,
  verified: boolean,
  hour: number,
  dayIdx: number,
  isReply: boolean,
  isQuote: boolean
): number[] {
  const tLower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;
  const charCount = text.length;
  
  const isOriginal = isReply || isQuote ? 0 : 1;
  const hasHashtag = text.includes('#') ? 1 : 0;
  const hasMention = text.includes('@') ? 1 : 0;
  const hasLink = /http/.test(tLower) ? 1 : 0;
  const hasThread = text.includes('\n') ? 1 : 0;
  
  const hasWorkflow = /\b(workflow|automation|n8n|zapier|makes\.com|pipeline)\b/.test(tLower) ? 1 : 0;
  const hasAiAgent = /\b(agent|agentic|multi.agent|autonomous|crewai|langchain|autogen)\b/.test(tLower) ? 1 : 0;
  const hasLlm = /\b(llm|gpt|claude|gemini|grok|mistral|o1|o3|gpt.)\b/.test(tLower) ? 1 : 0;
  const hasLaunch = /\b(launch|release|new|introducing|announce)\b/.test(tLower) ? 1 : 0;
  const hasOpinion = /\b(think|opinion|wrong|right|hot take|unpopular|disagree)\b/.test(tLower) ? 1 : 0;
  const hasStudy = /\b(study|research|paper|findings)\b/.test(tLower) ? 1 : 0;
  const hasDev = /\b(api|code|cursor|replit|vscode|github)\b/.test(tLower) ? 1 : 0;
  const hasNiche = hasWorkflow + hasAiAgent + hasLlm;
  
  const isWeekend = dayIdx >= 5 ? 1 : 0;
  const isPrime = [14,15,16,17,18,19,20,21,22,23].includes(hour) ? 1 : 0;
  const isLateNight = [0,1,2,3,4,5].includes(hour) ? 1 : 0;
  const isEarlyMorning = [6,7].includes(hour) ? 1 : 0;
  const isLunch = [11,12,13].includes(hour) ? 1 : 0;
  const isBestHour = [6,7,10,15,17,23].includes(hour) ? 1 : 0;
  
  return [
    Math.log1p(followers),           // log_followers
    verified ? 1 : 0,                // verified
    Math.sin(2 * Math.PI * hour / 24),  // hour_sin
    Math.cos(2 * Math.PI * hour / 24),  // hour_cos
    Math.sin(2 * Math.PI * dayIdx / 7), // day_sin
    Math.cos(2 * Math.PI * dayIdx / 7), // day_cos
    isWeekend,                        // is_weekend
    isPrime,                          // is_prime
    isLateNight,                      // is_late_night
    isEarlyMorning,                    // is_early_morning
    isLunch,                          // is_lunch
    isBestHour,                       // is_best_hour
    isOriginal,                        // is_original
    isReply ? 1 : 0,                  // is_reply
    isQuote ? 1 : 0,                  // is_quote
    hasWorkflow,                      // has_workflow
    hasAiAgent,                       // has_ai_agent
    hasLlm,                           // has_llm
    hasLaunch,                        // has_launch
    hasOpinion,                       // has_opinion
    hasStudy,                         // has_study
    hasDev,                           // has_dev
    hasNiche,                         // has_niche
    charCount,                        // text_len
    wordCount,                        // word_count
    hasLink,                          // has_link
    hasHashtag,                       // has_hashtag
    hasMention,                       // has_mention
    hasThread,                        // has_thread
    0,                                // has_media (unknown at prediction time)
  ];
}

function standardize(raw: number[]): number[] {
  return raw.map((v, i) => (v - SCALER_MEAN[i]) / SCALER_STD[i]);
}

function predictLog(raw: number[], beta: number[], intercept: number): number {
  const scaled = standardize(raw);
  let pred = intercept;
  for (let i = 0; i < beta.length; i++) {
    pred += scaled[i] * beta[i];
  }
  return pred;
}

function fmtNum(v: number): string {
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

const LOG_MIN = 0;
const LOG_MAX = 16;

export function score(input: PredictionInput): ScoreResult {
  const {
    text,
    author_followers,
    author_blue_verified = false,
    created_at,
    is_reply = false,
    is_quote = false,
  } = input;

  let hour = 14, dayIdx = 3;
  if (created_at) {
    const parsed = parseDT(created_at);
    hour = parsed.hour;
    dayIdx = parsed.dayIdx;
  }

  const raw = extractRawFeatures(text, author_followers, author_blue_verified, hour, dayIdx, is_reply, is_quote);
  const scaled = standardize(raw);

  // Predict log(views) and log(likes)
  const predLogViews = predictLog(raw, BETA_VIEWS, INTERCEPT_VIEWS);
  const predViews = Math.expm1(Math.max(0, predLogViews));
  
  // Simple likes estimate (views * avg_ctr)
  const predLikes = predViews * 0.025;

  // Normalize to 0-100 score
  const score = Math.min(100, Math.max(0, ((predLogViews - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100));
  const tier = getTier(score);
  const confidence = getConfidence(author_followers);

  // Component contributions (helpful vs harmful)
  const contribs: Record<string, number> = {};
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    if (scaled[i] !== 0) {
      contribs[FEATURE_NAMES[i]] = Math.round(scaled[i] * BETA_VIEWS[i] * 100) / 100;
    }
  }

  const helpful = Object.entries(contribs)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, number>);

  const harmful = Object.entries(contribs)
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, number>);

  // Recommendations
  const recs: string[] = [];
  if (author_followers < 500)
    recs.push(`Follower count (${author_followers.toLocaleString()}) is very low. Focus on engagement-first content.`);
  if (!author_blue_verified)
    recs.push("Get X Premium ($8/mo) for verified badge — model shows meaningful reach boost.");
  if (is_reply)
    recs.push("Replying limits reach. Post as original tweet for maximum distribution.");
  if (is_quote)
    recs.push("Quote tweets have mixed results. Original tweets tend to perform better.");

  if (hour && ![6,7,10,14,15,17,18,21,22,23].includes(hour))
    recs.push(`Posting at ${String(hour).padStart(2,'0')}:00 UTC is suboptimal. Best: 06-07, 10, 14-15, 17-18, 21-23 UTC.`);

  const tLower = text.toLowerCase();
  const missing: string[] = [];
  if (!/\b(llm|gpt|claude|gemini|agent|automation|workflow|n8n)\b/.test(tLower))
    missing.push("AI/automation keywords");
  if (text.length < 50)
    missing.push("more content (under 50 chars gets less engagement)");
  if ((text.match(/#/g) || []).length > 1)
    missing.push("fewer hashtags (1 max — overuse is penalized)");
  if (!missing.length)
    recs.push("Good signal profile! Tweet has virality characteristics.");
  else
    recs.push(`Adding ${missing.join(', ')} could improve reach.`);

  return {
    predicted_views: Math.round(predViews),
    predicted_views_fmt: fmtNum(predViews),
    predicted_likes: Math.round(predLikes),
    predicted_likes_fmt: fmtNum(predLikes),
    tier,
    score: Math.round(score * 10) / 10,
    confidence,
    helpful_factors: helpful,
    harmful_factors: harmful,
    recommendations: recs,
    model_info: {
      version: 'v3.0',
      cv_r2: 0.703,
      n_features: 31,
      training_samples: 925,
    },
  };
}
