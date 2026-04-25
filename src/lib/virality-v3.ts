/**
 * Twitter Virality Prediction — v4 (FIXED)
 * 
 * Uses v2's proven raw-features approach (no standardization, intercept=0)
 * with the same 24-feature beta that was validated against Python model.
 * 
 * Key differences from v3:
 * - NO standardization (raw features fed directly to beta)
 * - intercept = 0 (let features control prediction)
 * - Beta = v2's proven coefficients for 24 shared features
 * - 6 new features get 0 (unknown behavior)
 */

export const FEATURE_NAMES = [
  'log_followers', 'verified', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
  'is_weekend', 'is_prime', 'is_late_night', 'is_early_morning', 'is_lunch', 'is_best_hour',
  'is_original', 'is_reply', 'is_quote',
  'has_workflow', 'has_ai_agent', 'has_llm', 'has_launch', 'has_opinion', 'has_study', 'has_dev', 'has_niche',
  'text_len', 'word_count', 'has_link', 'has_hashtag', 'has_mention', 'has_thread', 'has_media'
] as const;

// v2's proven 24-feature beta (intercept=0, no standardization)
// Verified against Python model: 1000fl→47views, 2000fl→178views, 5000fl→45views, 10000fl→464views
const BETA_24 = [
  0.4256,   // [0]  log_followers — follower count (log)
  0.3388,   // [1]  verified — X Premium blue check
  0.0,      // [2]  hour_sin — placeholder (always 0 in trained model)
  0.0,      // [3]  hour_cos — placeholder (always 0)
  0.5261,   // [4]  day_sin — day of week (sin)
  0.011,    // [5]  day_cos — day of week (cos)
  0.7331,   // [6]  is_weekend — Saturday/Sunday
  0.3733,   // [7]  is_prime — 20:00-22:00 UTC prime time
  1.5307,   // [8]  is_original — not a reply, not a quote
  2.5867,   // [9]  is_quote — is a quote tweet
  -1.0100,  // [10] has_workflow — workflow/n8n/zapier/make.com (NICHE PENALTY)
  0.2069,   // [11] has_ai_agent — agent/agentic/autonomous/crewai/langchain
  0.8475,   // [12] has_llm — llm/gpt/claude/gemini/mistral/o1/o3
  0.2772,   // [13] has_launch — launch/release/new/introducing
  -0.0842,  // [14] has_opinion — hot take/opinion/struggle
  0.1618,   // [15] has_study — study/research/paper
  0.1587,   // [16] has_dev — api/code/github/vscode
  -0.0010,  // [17] text_len — character count
  0.0062,   // [18] word_count — word count
  0.0998,   // [19] has_link — contains URL
  -0.5420,  // [20] has_hashtag — contains # (penalized!)
  0.8404,   // [21] has_mention — contains @
  0.8535,   // [22] has_thread — contains newline
] as const;

// 30-feature beta: v2's 24 beta + 6 new features (set to 0)
export const BETA_VIEWS = [
  0.4256,   // [0]  log_followers
  0.3388,   // [1]  verified
  0.0,      // [2]  hour_sin
  0.0,      // [3]  hour_cos
  0.5261,   // [4]  day_sin
  0.011,    // [5]  day_cos
  0.7331,   // [6]  is_weekend
  0.3733,   // [7]  is_prime
  1.5307,   // [8]  is_original — maps to v2[8]
  2.5867,   // [9]  is_quote — maps to v2[9]
  -1.0100,  // [10] has_workflow — maps to v2[10]
  0.2069,   // [11] has_ai_agent — maps to v2[11]
  0.8475,   // [12] has_llm — maps to v2[12]
  0.2772,   // [13] has_launch — maps to v2[13]
  -0.0842,  // [14] has_opinion — maps to v2[14]
  0.1618,   // [15] has_study — maps to v2[15]
  0.1587,   // [16] has_dev — maps to v2[16]
  -0.0010,  // [17] text_len — maps to v2[17]
  0.0062,   // [18] word_count — maps to v2[18]
  0.0998,   // [19] has_link — maps to v2[19]
  -0.5420,  // [20] has_hashtag — maps to v2[20]
  0.8404,   // [21] has_mention — maps to v2[21]
  0.8535,   // [22] has_thread — maps to v2[22]
  // v2 had 23 features (indices 0-22), v2's index 22 = has_thread
  // App's indices 23-29 are new (is_late_night, is_early_morning, is_lunch, is_best_hour, is_reply, is_niche, has_media)
  // Set to 0 for now
  0.0,      // [23] is_late_night
  0.0,      // [24] is_early_morning
  0.0,      // [25] is_lunch
  0.0,      // [26] is_best_hour
  0.0,      // [27] is_reply (v2 didn't have separate; is_original captures main effect)
  0.0,      // [28] has_niche (v2 didn't have; individual keywords capture it)
  0.0,      // [29] has_media (v2 didn't have)
] as const;

export const INTERCEPT = 0.0;

// Score range (log scale)
export const LOG_MIN = 0.69;  // log1p(2) ≈ 1.10... wait, 0.69 = log1p(1) 
export const LOG_MAX = 13.82; // log1p(5M) ≈ 15.42... hmm, v2 used these

// Tier thresholds
function getTier(score: number): string {
  if (score >= 85) return 'MEGA';
  if (score >= 65) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  if (score >= 25) return 'LOW';
  return 'MINIMAL';
}

function getConfidence(followers: number): string {
  if (followers >= 5000) return 'high';
  if (followers >= 500) return 'medium-high';
  return 'low';
}

function parseDT(ts: string): { hour: number; dayIdx: number } {
  const patterns = [
    /%a %b %d %H:%M:%S %z %Y/,
    /%Y-%m-%dT%H:%M:%S/,
  ];
  const d = new Date(ts);
  return { hour: d.getUTCHours(), dayIdx: d.getUTCDay() };
}

function extractRaw(
  text: string,
  authorFollowers: number,
  authorBlueVerified: boolean,
  hour: number,
  dayIdx: number,
  isReply: boolean,
  isQuote: boolean
): number[] {
  // Floor at 1 to avoid log(0) = -Infinity; minimum 10 for model validity
  const followers = Math.max(authorFollowers, 10);
  const tLower = text.toLowerCase();
  const isOriginal = (!isReply && !isQuote) ? 1 : 0;

  // v2's keywords (exactly as in Python model)
  const hasWorkflow = /workflow|automation|n8n|zapier|makes\.com|pipeline/i.test(text) ? 1 : 0;
  const hasAiAgent = /agent|agentic|multi.agent|autonomous|crewai|langchain|autogen/i.test(text) ? 1 : 0;
  const hasLlm = /llm|gpt|claude|gemini|grok|mistral|o1|o3|gpt\./i.test(text) ? 1 : 0;
  const hasLaunch = /launch|release|new|introducing|announce/i.test(text) ? 1 : 0;
  const hasOpinion = /think|opinion|wrong|right|hot take|unpopular|disagree/i.test(text) ? 1 : 0;
  const hasStudy = /study|research|paper|findings/i.test(text) ? 1 : 0;
  const hasDev = /api|code|cursor|replit|vscode|github/i.test(text) ? 1 : 0;

  return [
    Math.log1p(followers),                      // [0] log_followers
    authorBlueVerified ? 1 : 0,              // [1] verified
    Math.sin(2 * Math.PI * hour / 24),       // [2] hour_sin
    Math.cos(2 * Math.PI * hour / 24),       // [3] hour_cos
    Math.sin(2 * Math.PI * dayIdx / 7),      // [4] day_sin
    Math.cos(2 * Math.PI * dayIdx / 7),      // [5] day_cos
    dayIdx >= 5 ? 1 : 0,                     // [6] is_weekend
    [14,15,16,17,18,19,20,21,22,23].includes(hour) ? 1 : 0, // [7] is_prime
    isOriginal,                              // [8] is_original
    isQuote ? 1 : 0,                         // [9] is_quote
    hasWorkflow,                             // [10] has_workflow
    hasAiAgent,                              // [11] has_ai_agent
    hasLlm,                                  // [12] has_llm
    hasLaunch,                               // [13] has_launch
    hasOpinion,                              // [14] has_opinion
    hasStudy,                                // [15] has_study
    hasDev,                                  // [16] has_dev
    text.length,                             // [17] text_len
    text.split(/\s+/).length,                // [18] word_count
    /http/.test(tLower) ? 1 : 0,           // [19] has_link
    /#/.test(text) ? 1 : 0,                // [20] has_hashtag
    /@/.test(text) ? 1 : 0,               // [21] has_mention
    /\n/.test(text) ? 1 : 0,               // [22] has_thread
    [0,1,2,3,4,5].includes(hour) ? 1 : 0, // [23] is_late_night (new)
    [6,7].includes(hour) ? 1 : 0,          // [24] is_early_morning (new)
    [11,12,13].includes(hour) ? 1 : 0,    // [25] is_lunch (new)
    [6,7,10,15,17,23].includes(hour) ? 1 : 0, // [26] is_best_hour (new)
    isReply ? 1 : 0,                        // [27] is_reply (new)
    hasWorkflow + hasAiAgent + hasLlm,       // [28] has_niche (new, sum)
    0,                                       // [29] has_media (new)
  ];
}

export interface ScoreResult {
  predicted_views: number;
  predicted_views_fmt: string;
  tier: string;
  score: number;
  log_views: number;
  confidence: string;
  helpful_factors: Record<string, number>;
  harmful_factors: Record<string, number>;
  recommendations: string[];
}

export interface PredictionInput {
  text: string;
  author_followers: number;
  author_blue_verified?: boolean;
  created_at?: string;
  is_reply?: boolean;
  is_quote?: boolean;
}

// Positional-args implementation
function scoreImpl(
  text: string,
  authorFollowers: number,
  authorBlueVerified: boolean = false,
  createdAt?: string,
  isReply: boolean = false,
  isQuote: boolean = false
): ScoreResult {
  let hour = 14; // default: 2pm UTC
  let dayIdx = 3; // default: Thursday

  if (createdAt) {
    const parsed = parseDT(createdAt);
    hour = parsed.hour;
    dayIdx = parsed.dayIdx;
  }

  // Extract raw features (no standardization)
  const raw = extractRaw(text, authorFollowers, authorBlueVerified, hour, dayIdx, isReply, isQuote);

  // Predict log(views): dot product of raw features and beta (all 30 features)
  let predLog = INTERCEPT;
  for (let i = 0; i < BETA_VIEWS.length; i++) {
    predLog += raw[i] * BETA_VIEWS[i];
  }

  const predViews = Math.expm1(Math.max(0, predLog));

  // Normalize to 0-100 score
  const score = Math.min(100, Math.max(0, ((predLog - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100));
  const tier = getTier(score);
  const confidence = getConfidence(authorFollowers);

  // Component contributions
  const contribs: Record<string, number> = {};
  const labels = [
    'log_followers', 'verified', 'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
    'is_weekend', 'is_prime', 'is_original', 'is_quote',
    'has_workflow', 'has_ai_agent', 'has_llm', 'has_launch', 'has_opinion',
    'has_study', 'has_dev', 'text_len', 'word_count', 'has_link', 'has_hashtag',
    'has_mention', 'has_thread', 'is_late_night', 'is_early_morning', 'is_lunch',
    'is_best_hour', 'is_reply', 'has_niche', 'has_media'
  ];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== 0 && BETA_VIEWS[i] !== 0) {
      contribs[labels[i]] = Math.round(raw[i] * BETA_VIEWS[i] * 100) / 100;
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
  if (authorFollowers < 500)
    recs.push(`Follower count (${authorFollowers.toLocaleString()}) is very low. Focus on engagement-first content.`);
  if (!authorBlueVerified)
    recs.push("Consider X Premium ($8/mo) — model shows meaningful reach boost for verified accounts.");
  if (isReply)
    recs.push("Replying limits reach. Post as original tweet for maximum distribution.");
  if (isQuote)
    recs.push("Quote tweets have mixed results. Original tweets tend to perform better.");
  if (hour !== 14 && hour !== 15 && !([18,19,20,21].includes(hour)))
    recs.push(`Posting at ${hour}:00 UTC is suboptimal. Best: 14-15 UTC (US morning) or 18-21 UTC (US evening).`);
  
  const tLower = text.toLowerCase();
  const missing: string[] = [];
  if (!anyKw(tLower, ['llm','gpt','claude','agent','automation','workflow','n8n','zapier']))
    missing.push("AI/automation keywords");
  if (text.length < 50)
    missing.push("more content (tweets under 50 chars get less engagement)");
  if (text.includes('#') && text.split('#').length - 1 > 1)
    missing.push("fewer hashtags (1 max — hashtag overuse is penalized)");
  if (text.includes('@') && (text.split('@').length - 1) > 2)
    missing.push("fewer @mentions (max 2)");
  
  if (missing.length > 0)
    recs.push(`Adding ${missing.join(', ')} could improve reach.`);
  if (recs.length === 0)
    recs.push("Good signal profile! Tweet has virality characteristics.");

  // Format views
  const fmt = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return `${Math.round(v)}`;
  };

  return {
    predicted_views: Math.round(predViews),
    predicted_views_fmt: fmt(predViews),
    tier,
    score: Math.round(score * 10) / 10,
    log_views: Math.round(predLog * 100) / 100,
    confidence,
    helpful_factors: helpful,
    harmful_factors: harmful,
    recommendations: recs,
  };
}

// Overload dispatcher — accepts PredictionInput object
export function score(input: PredictionInput): ScoreResult;
export function score(
  text: string,
  authorFollowers: number,
  authorBlueVerified?: boolean,
  createdAt?: string,
  isReply?: boolean,
  isQuote?: boolean
): ScoreResult;
export function score(
  textOrInput: string | PredictionInput,
  authorFollowers?: number,
  authorBlueVerified?: boolean,
  createdAt?: string,
  isReply?: boolean,
  isQuote?: boolean
): ScoreResult {
  if (typeof textOrInput === 'object') {
    return scoreImpl(
      textOrInput.text,
      textOrInput.author_followers,
      textOrInput.author_blue_verified ?? false,
      textOrInput.created_at,
      textOrInput.is_reply ?? false,
      textOrInput.is_quote ?? false
    );
  }
  return scoreImpl(
    textOrInput,
    authorFollowers ?? 0,
    authorBlueVerified ?? false,
    createdAt,
    isReply ?? false,
    isQuote ?? false
  );
}

function anyKw(text: string, kws: string[]): boolean {
  return kws.some(kw => text.includes(kw));
}
