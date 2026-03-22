/**
 * Relevance Scorer
 *
 * Utility module for calculating how relevant an article is to the
 * 2026 Korean local election. Not a Trigger.dev task -- exported
 * functions are consumed by other analyzer tasks.
 */

import { ELECTION_KEYWORDS, PROVINCE_CODES } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArticleInput {
  title: string;
  body?: string;
  entities?: { word: string; label: string }[];
  keywords?: string[];
  big_category?: string;
}

export interface ScoringContext {
  candidateNames: string[];
  provinceNames: string[];
  electionKeywords: string[];
}

// ---------------------------------------------------------------------------
// Default context (used when caller doesn't supply full context)
// ---------------------------------------------------------------------------

const DEFAULT_ELECTION_KEYWORDS = ELECTION_KEYWORDS;
const DEFAULT_PROVINCE_NAMES = Object.keys(PROVINCE_CODES);

// ---------------------------------------------------------------------------
// Core scoring function
// ---------------------------------------------------------------------------

/**
 * Calculate a relevance score between 0.0 and 1.0 for an article.
 *
 * Scoring rules:
 * - Election keyword in title:            +0.3
 * - Election keyword in body:             +0.1
 * - Registered candidate name found:      +0.3
 * - Registered province name found:       +0.2
 * - Category is "정치":                   +0.2
 * - Category is "경제" or "사회":          +0.1
 * - Capped at 1.0
 */
export function calculateRelevanceScore(
  article: ArticleInput,
  context?: Partial<ScoringContext>,
): number {
  const candidateNames = context?.candidateNames ?? [];
  const provinceNames =
    context?.provinceNames && context.provinceNames.length > 0
      ? context.provinceNames
      : DEFAULT_PROVINCE_NAMES;
  const electionKeywords =
    context?.electionKeywords && context.electionKeywords.length > 0
      ? context.electionKeywords
      : DEFAULT_ELECTION_KEYWORDS;

  let score = 0;

  const titleLower = article.title.toLowerCase();
  const bodyLower = (article.body ?? "").toLowerCase();

  // Combine all searchable text from entities and keywords
  const entityWords = (article.entities ?? []).map((e) => e.word);
  const allKeywords = [...(article.keywords ?? []), ...entityWords];
  const combinedText = `${titleLower} ${bodyLower} ${allKeywords.join(" ")}`.toLowerCase();

  // --- Election keyword in title: +0.3 ---
  const keywordInTitle = electionKeywords.some((kw) => titleLower.includes(kw.toLowerCase()));
  if (keywordInTitle) {
    score += 0.3;
  }

  // --- Election keyword in body: +0.1 ---
  if (!keywordInTitle) {
    const keywordInBody = electionKeywords.some((kw) => bodyLower.includes(kw.toLowerCase()));
    if (keywordInBody) {
      score += 0.1;
    }
  }

  // --- Registered candidate name found: +0.3 ---
  if (candidateNames.length > 0) {
    const candidateFound = candidateNames.some((name) => combinedText.includes(name.toLowerCase()));
    if (candidateFound) {
      score += 0.3;
    }
  }

  // --- Registered province name found: +0.2 ---
  const provinceFound = provinceNames.some((name) => combinedText.includes(name.toLowerCase()));
  if (provinceFound) {
    score += 0.2;
  }

  // --- Category scoring ---
  const category = article.big_category ?? "";
  if (category === "정치") {
    score += 0.2;
  } else if (category === "경제" || category === "사회") {
    score += 0.1;
  }

  // Cap at 1.0
  return Math.min(score, 1.0);
}

// ---------------------------------------------------------------------------
// Election-related check
// ---------------------------------------------------------------------------

/**
 * Quick boolean check: does the given text contain any election-related keyword?
 */
export function isElectionRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return DEFAULT_ELECTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}
