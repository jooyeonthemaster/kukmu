/**
 * Entity Mapper
 *
 * Utility module for mapping NER-extracted entities to database records.
 * Handles candidate name matching (with fuzzy variants), region-to-province
 * mapping, agenda matching, and article deduplication.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROVINCE_CODES } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NerEntity {
  word: string;
  label: string;
}

export interface RawArticleInsert {
  title: string;
  body?: string;
  source_url: string;
  source_name: string;
  published_at?: string;
  [key: string]: unknown;
}

interface CandidateRow {
  id: string;
  name: string;
  party: string;
  province_code: string;
}

interface AgendaRow {
  id: string;
  title: string;
  category: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Candidate name matching
// ---------------------------------------------------------------------------

/**
 * Common Korean title suffixes that may be attached to candidate names.
 * e.g., "이재명 후보", "김기현 시장", "박형준 전 시장"
 */
const TITLE_SUFFIXES = [
  "후보", "의원", "시장", "지사", "도지사", "구청장", "군수",
  "전 시장", "전 지사", "전 의원", "대표", "위원장", "총재",
  "씨", "님", "측",
];

/**
 * Normalize a name by stripping common title suffixes and whitespace.
 */
function normalizeName(text: string): string {
  let normalized = text.trim();
  for (const suffix of TITLE_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length).trim();
    }
  }
  return normalized;
}

/**
 * Check if two names match using fuzzy rules:
 * - Exact match after normalization
 * - One name contains the other (minimum 2 chars)
 * - Handle "성+이름" patterns (Korean names are typically 2-4 chars)
 */
function namesMatch(entityName: string, candidateName: string): boolean {
  const a = normalizeName(entityName);
  const b = normalizeName(candidateName);

  if (!a || !b) return false;

  // Exact match
  if (a === b) return true;

  // Containment check (minimum 2 chars to avoid false positives)
  if (a.length >= 2 && b.includes(a)) return true;
  if (b.length >= 2 && a.includes(b)) return true;

  return false;
}

/**
 * Map NER results to candidate IDs from the database.
 * Filters entities with label "PERSON" or "PS" and matches against
 * registered candidates.
 */
export async function mapEntitiesToCandidates(
  entities: NerEntity[],
  supabase: SupabaseClient,
): Promise<string[]> {
  // Filter person entities
  const personEntities = entities.filter(
    (e) => e.label === "PERSON" || e.label === "PS" || e.label === "PER",
  );

  if (personEntities.length === 0) return [];

  // Fetch all active candidates
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, name, party, province_code")
    .eq("is_active", true);

  if (error || !candidates || candidates.length === 0) return [];

  const matchedIds = new Set<string>();

  for (const entity of personEntities) {
    for (const candidate of candidates as CandidateRow[]) {
      if (namesMatch(entity.word, candidate.name)) {
        matchedIds.add(candidate.id);
      }
    }
  }

  return Array.from(matchedIds);
}

// ---------------------------------------------------------------------------
// Region-to-province mapping
// ---------------------------------------------------------------------------

/**
 * Extended region name mapping that covers common variations.
 */
const REGION_ALIASES: Record<string, string> = {
  // Full province names
  "서울특별시": "seoul",
  "부산광역시": "busan",
  "대구광역시": "daegu",
  "인천광역시": "incheon",
  "광주광역시": "gwangju",
  "대전광역시": "daejeon",
  "울산광역시": "ulsan",
  "세종특별자치시": "sejong",
  "경기도": "gyeonggi",
  "강원특별자치도": "gangwon",
  "강원도": "gangwon",
  "충청북도": "chungbuk",
  "충청남도": "chungnam",
  "전라북도": "jeonbuk",
  "전북특별자치도": "jeonbuk",
  "전라남도": "jeonnam",
  "경상북도": "gyeongbuk",
  "경상남도": "gyeongnam",
  "제주특별자치도": "jeju",
  "제주도": "jeju",
  // Short forms (from PROVINCE_CODES)
  ...Object.fromEntries(
    Object.entries(PROVINCE_CODES).map(([k, v]) => [k, v]),
  ),
};

/**
 * Map a region text to a province code. Returns null if no match found.
 */
export function mapRegionToProvinceCode(regionText: string): string | null {
  const trimmed = regionText.trim();

  // Direct lookup
  if (REGION_ALIASES[trimmed]) {
    return REGION_ALIASES[trimmed];
  }

  // Check if any alias key is contained in the text
  for (const [alias, code] of Object.entries(REGION_ALIASES)) {
    if (trimmed.includes(alias)) {
      return code;
    }
  }

  // Check if the text starts with a short form (2 char Korean)
  for (const [shortName, code] of Object.entries(PROVINCE_CODES)) {
    if (trimmed.startsWith(shortName)) {
      return code;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Agenda mapping
// ---------------------------------------------------------------------------

/**
 * Map extracted keywords and summary text to agenda IDs from the database.
 * Uses keyword overlap and summary text matching.
 */
export async function mapToAgendas(
  keywords: string[],
  summary: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  if (keywords.length === 0 && !summary) return [];

  // Fetch active agendas
  const { data: agendas, error } = await supabase
    .from("agendas")
    .select("id, title, category, description")
    .in("status", ["proposed", "discussing", "decided", "implementing"]);

  if (error || !agendas || agendas.length === 0) return [];

  const matchedIds = new Set<string>();
  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
  const summaryLower = summary.toLowerCase();

  for (const agenda of agendas as AgendaRow[]) {
    const agendaTitle = agenda.title.toLowerCase();
    const agendaDesc = (agenda.description ?? "").toLowerCase();
    const agendaText = `${agendaTitle} ${agendaDesc}`;

    // Check if any keyword appears in the agenda title/description
    let keywordMatch = false;
    for (const kw of Array.from(keywordSet)) {
      if (kw.length >= 2 && agendaText.includes(kw)) {
        keywordMatch = true;
        break;
      }
    }

    // Check if agenda title appears in the article summary
    const titleInSummary =
      agendaTitle.length >= 4 && summaryLower.includes(agendaTitle);

    // Check word-level overlap (at least 2 meaningful words)
    const agendaWords = agendaTitle
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const overlapCount = agendaWords.filter(
      (w) => keywordSet.has(w) || summaryLower.includes(w),
    ).length;
    const wordOverlap = overlapCount >= 2;

    if (keywordMatch || titleInSummary || wordOverlap) {
      matchedIds.add(agenda.id);
    }
  }

  return Array.from(matchedIds);
}

// ---------------------------------------------------------------------------
// Article deduplication
// ---------------------------------------------------------------------------

/**
 * Normalize a URL for comparison by removing protocol, www, trailing slashes,
 * query params, and common tracking fragments.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove tracking params
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    // Normalize
    let normalized = `${parsed.hostname}${parsed.pathname}`;
    normalized = normalized.replace(/^www\./, "");
    normalized = normalized.replace(/\/+$/, "");

    // Include remaining query params if any
    const remaining = parsed.searchParams.toString();
    if (remaining) {
      normalized += `?${remaining}`;
    }

    return normalized.toLowerCase();
  } catch {
    // If URL parsing fails, do basic normalization
    return url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

/**
 * Deduplicate articles by URL similarity.
 * Keeps the first occurrence when duplicate URLs are found.
 */
export function deduplicateArticles(articles: RawArticleInsert[]): RawArticleInsert[] {
  const seen = new Set<string>();
  const unique: RawArticleInsert[] = [];

  for (const article of articles) {
    const normalizedUrl = normalizeUrl(article.source_url);

    if (seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    unique.push(article);
  }

  return unique;
}
