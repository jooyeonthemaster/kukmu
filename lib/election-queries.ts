/**
 * Election data queries - fetches from Supabase and maps to UI types.
 *
 * Used by API routes to serve shaped data to client components.
 */

import { createClient } from "@supabase/supabase-js";
import type {
  Province,
  District,
  Candidate,
  PartyId,
  Poll,
  ProvinceIssue,
  DistrictCandidate,
  CandidateDetail,
  ArticleSummary,
  TrendSignal,
  ArticleCandidateMention,
} from "./election-types";

// ────────────────────────────────────────────────────────────
// Supabase client (server-side, service role for API routes)
// ────────────────────────────────────────────────────────────

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ────────────────────────────────────────────────────────────
// Party mapping
// ────────────────────────────────────────────────────────────

export function mapParty(partyName: string): PartyId {
  if (partyName.includes("국민의힘")) return "ppp";
  if (partyName.includes("민주당")) return "dp";
  if (partyName.includes("조국혁신")) return "rkp";
  if (partyName.includes("개혁신당")) return "rp";
  if (partyName.includes("진보당")) return "pp";
  return "ind";
}

// ────────────────────────────────────────────────────────────
// Determine leading party from a list of candidates
// ────────────────────────────────────────────────────────────

function determineLeadingParty(
  candidates: { party: string; is_incumbent: boolean }[],
): PartyId {
  // Count by party
  const counts: Partial<Record<PartyId, number>> = {};
  let incumbentParty: PartyId | null = null;

  for (const c of candidates) {
    const pid = mapParty(c.party);
    counts[pid] = (counts[pid] || 0) + 1;
    if (c.is_incumbent) incumbentParty = pid;
  }

  // If there's an incumbent, their party leads
  if (incumbentParty) return incumbentParty;

  // Otherwise pick the party with the most candidates
  let best: PartyId = "ind";
  let bestCount = 0;
  for (const [pid, cnt] of Object.entries(counts)) {
    if ((cnt as number) > bestCount) {
      bestCount = cnt as number;
      best = pid as PartyId;
    }
  }
  return best;
}

// ────────────────────────────────────────────────────────────
// Fetch all provinces (lightweight, for the overview bar + map)
// ────────────────────────────────────────────────────────────

export async function getProvinces(): Promise<Province[]> {
  const supabase = getClient();

  // Fetch provinces
  const { data: dbProvinces, error: provErr } = await supabase
    .from("provinces")
    .select("*")
    .order("code");

  if (provErr || !dbProvinces) {
    console.error("[getProvinces] provinces query failed:", provErr?.message);
    return [];
  }

  // Fetch all candidates (province-level: district_id is null)
  const { data: dbCandidates } = await supabase
    .from("candidates")
    .select("*")
    .is("district_id", null);

  // Fetch all province-level issues
  const { data: dbIssues } = await supabase
    .from("issues")
    .select("*")
    .is("district_id", null)
    .eq("is_active", true)
    .order("mention_count", { ascending: false });

  // Fetch polls with results for province-level
  const { data: dbPolls } = await supabase
    .from("polls")
    .select("*")
    .is("district_id", null)
    .order("survey_date", { ascending: false });

  const { data: dbPollResults } = await supabase
    .from("poll_results")
    .select("*, candidates!inner(name, party)")
    .order("percentage", { ascending: false });

  // Build poll results map: poll_id -> results[]
  const pollResultsMap = new Map<string, { candidateName: string; party: PartyId; percentage: number }[]>();
  if (dbPollResults) {
    for (const pr of dbPollResults as unknown as Array<{
      poll_id: string;
      percentage: number;
      candidates: { name: string; party: string };
    }>) {
      if (!pr.poll_id) continue;
      const list = pollResultsMap.get(pr.poll_id) || [];
      list.push({
        candidateName: pr.candidates.name,
        party: mapParty(pr.candidates.party),
        percentage: pr.percentage,
      });
      pollResultsMap.set(pr.poll_id, list);
    }
  }

  // Build province map
  const candidatesByProvince = new Map<string, typeof dbCandidates>();
  if (dbCandidates) {
    for (const c of dbCandidates) {
      if (!c.province_id) continue;
      const list = candidatesByProvince.get(c.province_id) || [];
      list.push(c);
      candidatesByProvince.set(c.province_id, list);
    }
  }

  const issuesByProvince = new Map<string, typeof dbIssues>();
  if (dbIssues) {
    for (const iss of dbIssues) {
      if (!iss.province_id) continue;
      const list = issuesByProvince.get(iss.province_id) || [];
      list.push(iss);
      issuesByProvince.set(iss.province_id, list);
    }
  }

  const pollsByProvince = new Map<string, Poll[]>();
  if (dbPolls) {
    for (const p of dbPolls) {
      if (!p.province_id) continue;
      const results = pollResultsMap.get(p.id) || [];
      const list = pollsByProvince.get(p.province_id) || [];
      list.push({
        date: p.survey_date,
        source: p.pollster,
        sampleSize: p.sample_size || 0,
        marginOfError: p.margin_of_error || 0,
        results: results.sort((a, b) => b.percentage - a.percentage),
      });
      pollsByProvince.set(p.province_id, list);
    }
  }

  return dbProvinces.map((prov) => {
    const provCandidates = candidatesByProvince.get(prov.id) || [];
    const provIssues = issuesByProvince.get(prov.id) || [];
    const provPolls = pollsByProvince.get(prov.id) || [];

    const candidates: Candidate[] = provCandidates.map((c) => ({
      id: c.id,
      name: c.name,
      party: mapParty(c.party),
      age: c.age || 0,
      incumbent: c.is_incumbent,
      career: c.career || [],
      pledges: c.pledges || [],
    }));

    const issues: ProvinceIssue[] = provIssues.map((iss) => ({
      title: iss.title,
      category: iss.category || "general",
      severity: (iss.severity as ProvinceIssue["severity"]) || "medium",
    }));

    const leadingParty = provPolls.length > 0 && provPolls[0].results.length > 0
      ? provPolls[0].results[0].party
      : determineLeadingParty(provCandidates);

    return {
      code: prov.code,
      name: prov.name,
      nameEn: prov.name_en || "",
      population: prov.population || 0,
      voterCount: prov.voter_count || 0,
      councilSeats: prov.council_seats || 0,
      leadingParty,
      candidates,
      polls: provPolls,
      history: [], // Historical data not yet in DB
      issues,
      keyMunicipalities: [], // Not yet in DB
    } satisfies Province;
  });
}

// ────────────────────────────────────────────────────────────
// Fetch districts for a specific province
// ────────────────────────────────────────────────────────────

export async function getDistrictsByProvinceCode(
  provinceCode: string,
): Promise<District[]> {
  const supabase = getClient();

  // First get the province id from code
  const { data: provData } = await supabase
    .from("provinces")
    .select("id")
    .eq("code", provinceCode)
    .single();

  if (!provData) return [];

  const provinceId = provData.id;

  // Fetch districts for this province
  const { data: dbDistricts } = await supabase
    .from("districts")
    .select("*")
    .eq("province_id", provinceId)
    .order("code");

  if (!dbDistricts || dbDistricts.length === 0) return [];

  // Fetch all candidates for these districts
  const districtIds = dbDistricts.map((d) => d.id);
  const { data: dbCandidates } = await supabase
    .from("candidates")
    .select("*")
    .in("district_id", districtIds);

  // Fetch issues for these districts
  const { data: dbIssues } = await supabase
    .from("issues")
    .select("*")
    .in("district_id", districtIds)
    .eq("is_active", true)
    .order("mention_count", { ascending: false });

  // Build maps
  const candidatesByDistrict = new Map<string, any[]>();
  if (dbCandidates) {
    for (const c of dbCandidates) {
      if (!c.district_id) continue;
      const list = candidatesByDistrict.get(c.district_id) || [];
      list.push(c);
      candidatesByDistrict.set(c.district_id, list);
    }
  }

  const issuesByDistrict = new Map<string, string[]>();
  if (dbIssues) {
    for (const iss of dbIssues) {
      if (!iss.district_id) continue;
      const list = issuesByDistrict.get(iss.district_id) || [];
      list.push(iss.title);
      issuesByDistrict.set(iss.district_id, list);
    }
  }

  return dbDistricts.map((dist) => {
    const distCandidates = candidatesByDistrict.get(dist.id) || [];
    const distIssues = issuesByDistrict.get(dist.id) || [];

    const candidates: DistrictCandidate[] = distCandidates.map((c) => ({
      name: c.name,
      party: mapParty(c.party),
      percentage: 0, // No poll data at district level yet
      incumbent: c.is_incumbent,
    }));

    // Sort: incumbents first, then by name
    candidates.sort((a, b) => {
      if (a.incumbent !== b.incumbent) return a.incumbent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const leadingParty = determineLeadingParty(distCandidates);

    // Estimate poll percentages based on candidate count
    // (placeholder until real district-level polls are available)
    const pollPct: [number, number] = candidates.length >= 2
      ? [0, 0]
      : [0, 0];

    return {
      code: dist.code,
      provinceCode,
      name: dist.name,
      population: dist.population || 0,
      leadingParty,
      candidates,
      pollPct,
      issues: distIssues,
    } satisfies District;
  });
}

// ────────────────────────────────────────────────────────────
// Fetch a single candidate with full detail (news + sentiment)
// ────────────────────────────────────────────────────────────

export async function getCandidateDetail(
  id: string,
): Promise<CandidateDetail | null> {
  const supabase = getClient();

  // Fetch candidate with province and district joins
  const { data: cand, error } = await supabase
    .from("candidates")
    .select("*, provinces!candidates_province_id_fkey(name, code), districts!candidates_district_id_fkey(name)")
    .eq("id", id)
    .single();

  if (error || !cand) {
    // Try without the foreign key names (simpler join)
    const { data: candSimple, error: err2 } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", id)
      .single();
    if (err2 || !candSimple) return null;

    // Fetch province/district names separately
    let provinceName = "";
    let districtName = "";
    if (candSimple.province_id) {
      const { data: prov } = await supabase
        .from("provinces")
        .select("name, code")
        .eq("id", candSimple.province_id)
        .single();
      if (prov) provinceName = prov.name;
    }
    if (candSimple.district_id) {
      const { data: dist } = await supabase
        .from("districts")
        .select("name")
        .eq("id", candSimple.district_id)
        .single();
      if (dist) districtName = dist.name;
    }

    const news = await getNewsByCandidate(id);
    const sentimentTrend = await getCandidateSentimentTrend(id);

    return {
      id: candSimple.id,
      name: candSimple.name,
      party: mapParty(candSimple.party),
      age: candSimple.age || 0,
      incumbent: candSimple.is_incumbent,
      career: candSimple.career || [],
      pledges: candSimple.pledges || [],
      provinceName,
      districtName,
      relatedNews: news,
      sentimentTrend,
    };
  }

  const provinces = cand.provinces as { name: string; code: string } | null;
  const districts = cand.districts as { name: string } | null;

  const news = await getNewsByCandidate(id);
  const sentimentTrend = await getCandidateSentimentTrend(id);

  return {
    id: cand.id,
    name: cand.name,
    party: mapParty(cand.party),
    age: cand.age || 0,
    incumbent: cand.is_incumbent,
    career: cand.career || [],
    pledges: cand.pledges || [],
    provinceName: provinces?.name || "",
    districtName: districts?.name || "",
    relatedNews: news,
    sentimentTrend,
  };
}

// ────────────────────────────────────────────────────────────
// Fetch sentiment trend for a candidate
// ────────────────────────────────────────────────────────────

async function getCandidateSentimentTrend(
  candidateId: string,
): Promise<{ date: string; score: number; count: number }[]> {
  const supabase = getClient();

  const { data } = await supabase
    .from("candidate_sentiments")
    .select("sentiment_score, analyzed_at")
    .eq("candidate_id", candidateId)
    .order("analyzed_at", { ascending: true });

  if (!data || data.length === 0) return [];

  // Aggregate by day
  const byDay = new Map<string, { total: number; count: number }>();
  for (const row of data) {
    const day = new Date(row.analyzed_at).toISOString().split("T")[0];
    const existing = byDay.get(day) || { total: 0, count: 0 };
    existing.total += Number(row.sentiment_score) || 0;
    existing.count += 1;
    byDay.set(day, existing);
  }

  return Array.from(byDay.entries()).map(([date, { total, count }]) => ({
    date,
    score: Math.round((total / count) * 100) / 100,
    count,
  }));
}

// ────────────────────────────────────────────────────────────
// Fetch news articles for a province
// ────────────────────────────────────────────────────────────

export async function getNewsByProvince(
  provinceCode: string,
  limit = 20,
): Promise<ArticleSummary[]> {
  const supabase = getClient();

  // Use analyzed_articles that reference this province code
  const { data } = await supabase
    .from("analyzed_articles")
    .select("id, ai_summary, sentiment, sentiment_score, relevance_score, trend_signal, trend_detail, keywords, raw_articles!inner(id, title, url, publisher, published_at)")
    .contains("related_province_codes", [provinceCode])
    .order("relevance_score", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return [];

  // Get article IDs for candidate mention lookup
  const articleIds = data.map((row) => row.id);
  const mentions = await getArticleCandidateMentions(articleIds);

  return data.map((row) => {
    const ra = row.raw_articles as unknown as {
      id: string;
      title: string;
      url: string;
      publisher: string;
      published_at: string;
    };
    const { summary, panseImpact } = parsePanseImpact(row.ai_summary);
    return {
      id: ra.id,
      title: ra.title,
      url: ra.url,
      source: ra.publisher || "Unknown",
      publishedAt: ra.published_at || "",
      sentiment: row.sentiment || undefined,
      sentimentScore: row.sentiment_score ? Number(row.sentiment_score) : undefined,
      summary,
      panseImpact,
      relevanceScore: row.relevance_score ? Number(row.relevance_score) : undefined,
      trendSignal: (row.trend_signal as TrendSignal) || undefined,
      trendDetail: row.trend_detail || undefined,
      keywords: row.keywords || undefined,
      candidateMentions: mentions.get(row.id) || undefined,
    };
  });
}

// ────────────────────────────────────────────────────────────
// Parse 【판세 영향】 section from ai_summary
// ────────────────────────────────────────────────────────────

function parsePanseImpact(aiSummary: string | null): { summary?: string; panseImpact?: string } {
  if (!aiSummary) return {};
  const marker = "【판세 영향】";
  const idx = aiSummary.indexOf(marker);
  if (idx === -1) return { summary: aiSummary };
  const summary = aiSummary.slice(0, idx).trim() || undefined;
  const panseImpact = aiSummary.slice(idx + marker.length).trim() || undefined;
  return { summary, panseImpact };
}

// ────────────────────────────────────────────────────────────
// Fetch article_candidates mentions for a batch of articles
// ────────────────────────────────────────────────────────────

async function getArticleCandidateMentions(
  analyzedArticleIds: string[],
): Promise<Map<string, ArticleCandidateMention[]>> {
  if (analyzedArticleIds.length === 0) return new Map();
  const supabase = getClient();

  const { data } = await supabase
    .from("article_candidates")
    .select("analyzed_article_id, candidate_id, context, mention_type, candidates!inner(name, party)")
    .in("analyzed_article_id", analyzedArticleIds);

  const result = new Map<string, ArticleCandidateMention[]>();
  if (!data) return result;

  // Also get sentiment scores
  const { data: sentiments } = await supabase
    .from("candidate_sentiments")
    .select("candidate_id, analyzed_article_id, sentiment_score")
    .in("analyzed_article_id", analyzedArticleIds);

  const sentimentMap = new Map<string, number>();
  if (sentiments) {
    for (const s of sentiments) {
      sentimentMap.set(`${s.analyzed_article_id}:${s.candidate_id}`, Number(s.sentiment_score) || 0);
    }
  }

  for (const row of data as unknown as Array<{
    analyzed_article_id: string;
    candidate_id: string;
    context: string;
    mention_type: string;
    candidates: { name: string; party: string };
  }>) {
    const list = result.get(row.analyzed_article_id) || [];
    list.push({
      candidateId: row.candidate_id,
      candidateName: row.candidates.name,
      party: mapParty(row.candidates.party),
      mentionType: (row.mention_type as "direct_quote" | "mention" | "analysis") || "mention",
      context: row.context || "",
      sentimentScore: sentimentMap.get(`${row.analyzed_article_id}:${row.candidate_id}`) || 0,
    });
    result.set(row.analyzed_article_id, list);
  }

  return result;
}

// ────────────────────────────────────────────────────────────
// Fetch news articles related to a candidate
// ────────────────────────────────────────────────────────────

export async function getNewsByCandidate(
  candidateId: string,
  limit = 20,
): Promise<ArticleSummary[]> {
  const supabase = getClient();

  // Strategy 1: Use analyzed_articles.related_candidate_ids array
  const { data: analyzed } = await supabase
    .from("analyzed_articles")
    .select("id, ai_summary, sentiment, sentiment_score, relevance_score, trend_signal, trend_detail, keywords, raw_articles!inner(id, title, url, publisher, published_at)")
    .contains("related_candidate_ids", [candidateId])
    .order("relevance_score", { ascending: false })
    .limit(limit);

  if (analyzed && analyzed.length > 0) {
    const articleIds = analyzed.map((row) => row.id);
    const mentions = await getArticleCandidateMentions(articleIds);

    return analyzed.map((row) => {
      const ra = row.raw_articles as unknown as {
        id: string;
        title: string;
        url: string;
        publisher: string;
        published_at: string;
      };
      const { summary, panseImpact } = parsePanseImpact(row.ai_summary);
      return {
        id: ra.id,
        title: ra.title,
        url: ra.url,
        source: ra.publisher || "Unknown",
        publishedAt: ra.published_at || "",
        sentiment: row.sentiment || undefined,
        sentimentScore: row.sentiment_score ? Number(row.sentiment_score) : undefined,
        summary,
        panseImpact,
        relevanceScore: row.relevance_score ? Number(row.relevance_score) : undefined,
        trendSignal: (row.trend_signal as TrendSignal) || undefined,
        trendDetail: row.trend_detail || undefined,
        keywords: row.keywords || undefined,
        candidateMentions: mentions.get(row.id) || undefined,
      };
    });
  }

  // Strategy 2: Fallback - search raw_articles by candidate name in title
  const { data: candData } = await supabase
    .from("candidates")
    .select("name")
    .eq("id", candidateId)
    .single();

  if (!candData) return [];

  const { data: rawArticles } = await supabase
    .from("raw_articles")
    .select("id, title, url, publisher, published_at")
    .ilike("title", `%${candData.name}%`)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!rawArticles) return [];

  return rawArticles.map((ra) => ({
    id: ra.id,
    title: ra.title,
    url: ra.url,
    source: ra.publisher || "Unknown",
    publishedAt: ra.published_at || "",
  }));
}

// ────────────────────────────────────────────────────────────
// District detail: issues + candidates with linked articles
// ────────────────────────────────────────────────────────────

export interface DistrictIssueArticle {
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  sentiment?: string;
}

export interface DistrictIssueDetail {
  id: string;
  title: string;
  category: string;
  severity: string;
  description?: string;
  articles: DistrictIssueArticle[];
}

export interface DistrictCandidateArticle {
  title: string;
  url: string;
  mentionType: "direct_quote" | "mention" | "analysis";
  context: string;
  sentiment?: string;
  sentimentScore?: number;
  publishedAt?: string;
}

export interface DistrictCandidateDetail {
  id: string;
  name: string;
  party: PartyId;
  isIncumbent: boolean;
  articles: DistrictCandidateArticle[];
  avgSentimentScore: number | null;
}

export interface DistrictDetailData {
  issues: DistrictIssueDetail[];
  candidates: DistrictCandidateDetail[];
}

export async function getDistrictDetail(
  districtCode: string,
): Promise<DistrictDetailData> {
  const supabase = getClient();

  // Resolve district id from code
  const { data: distRow } = await supabase
    .from("districts")
    .select("id")
    .eq("code", districtCode)
    .single();

  if (!distRow) return { issues: [], candidates: [] };

  const districtId = distRow.id;

  // ── Issues with linked articles ──
  const { data: dbIssues } = await supabase
    .from("issues")
    .select("id, title, category, severity, description")
    .eq("district_id", districtId)
    .eq("is_active", true)
    .order("mention_count", { ascending: false });

  const issues: DistrictIssueDetail[] = [];

  if (dbIssues && dbIssues.length > 0) {
    const issueIds = dbIssues.map((i) => i.id);

    // Get article_issues links
    const { data: articleIssueLinks } = await supabase
      .from("article_issues")
      .select("issue_id, raw_article_id")
      .in("issue_id", issueIds);

    // Collect unique raw_article_ids
    const rawArticleIds = [
      ...new Set((articleIssueLinks ?? []).map((l) => l.raw_article_id)),
    ];

    // Fetch raw_articles + analyzed_articles for those
    let rawMap = new Map<string, { title: string; url: string; publishedAt: string }>();
    let analysisMap = new Map<string, { summary?: string; sentiment?: string }>();

    if (rawArticleIds.length > 0) {
      const { data: rawArts } = await supabase
        .from("raw_articles")
        .select("id, title, url, published_at")
        .in("id", rawArticleIds);

      if (rawArts) {
        for (const ra of rawArts) {
          rawMap.set(ra.id, {
            title: ra.title,
            url: ra.url,
            publishedAt: ra.published_at || "",
          });
        }
      }

      const { data: analyses } = await supabase
        .from("analyzed_articles")
        .select("raw_article_id, ai_summary, sentiment")
        .in("raw_article_id", rawArticleIds);

      if (analyses) {
        for (const aa of analyses) {
          const { summary } = parsePanseImpact(aa.ai_summary);
          analysisMap.set(aa.raw_article_id, {
            summary,
            sentiment: aa.sentiment || undefined,
          });
        }
      }
    }

    // Build link map: issue_id -> raw_article_id[]
    const issueLinkMap = new Map<string, string[]>();
    for (const link of articleIssueLinks ?? []) {
      const list = issueLinkMap.get(link.issue_id) || [];
      list.push(link.raw_article_id);
      issueLinkMap.set(link.issue_id, list);
    }

    for (const iss of dbIssues) {
      const linkedIds = issueLinkMap.get(iss.id) || [];
      const articles: DistrictIssueArticle[] = [];
      for (const rid of linkedIds) {
        const raw = rawMap.get(rid);
        if (!raw) continue;
        const analysis = analysisMap.get(rid);
        articles.push({
          title: raw.title,
          url: raw.url,
          publishedAt: raw.publishedAt,
          summary: analysis?.summary,
          sentiment: analysis?.sentiment,
        });
      }

      issues.push({
        id: iss.id,
        title: iss.title,
        category: iss.category || "general",
        severity: iss.severity || "medium",
        description: iss.description || undefined,
        articles,
      });
    }
  }

  // ── Candidates with linked articles ──
  const { data: dbCandidates } = await supabase
    .from("candidates")
    .select("id, name, party, is_incumbent")
    .eq("district_id", districtId);

  const candidates: DistrictCandidateDetail[] = [];

  if (dbCandidates && dbCandidates.length > 0) {
    const candidateIds = dbCandidates.map((c) => c.id);

    // Get article_candidates links
    const { data: acLinks } = await supabase
      .from("article_candidates")
      .select("candidate_id, raw_article_id, mention_type, context")
      .in("candidate_id", candidateIds);

    // Collect unique raw_article_ids
    const rawArticleIds = [
      ...new Set((acLinks ?? []).map((l) => l.raw_article_id)),
    ];

    // Fetch raw_articles for publish dates
    let rawMap = new Map<string, { title: string; url: string; publishedAt: string }>();
    // analyzed_article_id map: raw_article_id -> analyzed_article_id
    let analyzedIdMap = new Map<string, string>();

    if (rawArticleIds.length > 0) {
      const { data: rawArts } = await supabase
        .from("raw_articles")
        .select("id, title, url, published_at")
        .in("id", rawArticleIds);

      if (rawArts) {
        for (const ra of rawArts) {
          rawMap.set(ra.id, {
            title: ra.title,
            url: ra.url,
            publishedAt: ra.published_at || "",
          });
        }
      }

      const { data: analyses } = await supabase
        .from("analyzed_articles")
        .select("id, raw_article_id")
        .in("raw_article_id", rawArticleIds);

      if (analyses) {
        for (const aa of analyses) {
          analyzedIdMap.set(aa.raw_article_id, aa.id);
        }
      }
    }

    // Get candidate_sentiments
    const analyzedIds = [...new Set(analyzedIdMap.values())];
    let sentimentMap = new Map<string, { sentiment?: string; sentimentScore?: number }>();

    if (analyzedIds.length > 0 && candidateIds.length > 0) {
      const { data: sentiments } = await supabase
        .from("candidate_sentiments")
        .select("candidate_id, article_id, sentiment, sentiment_score")
        .in("candidate_id", candidateIds)
        .in("article_id", analyzedIds);

      if (sentiments) {
        for (const s of sentiments) {
          sentimentMap.set(`${s.candidate_id}:${s.article_id}`, {
            sentiment: s.sentiment || undefined,
            sentimentScore: s.sentiment_score ? Number(s.sentiment_score) : undefined,
          });
        }
      }
    }

    // Build per-candidate article list
    const candArticlesMap = new Map<string, DistrictCandidateArticle[]>();
    const candSentimentScores = new Map<string, number[]>();

    for (const ac of acLinks ?? []) {
      const raw = rawMap.get(ac.raw_article_id);
      if (!raw) continue;

      const analyzedId = analyzedIdMap.get(ac.raw_article_id);
      const sentKey = analyzedId ? `${ac.candidate_id}:${analyzedId}` : "";
      const sent = sentKey ? sentimentMap.get(sentKey) : undefined;

      const article: DistrictCandidateArticle = {
        title: raw.title,
        url: raw.url,
        mentionType: (ac.mention_type as "direct_quote" | "mention" | "analysis") || "mention",
        context: ac.context || "",
        sentiment: sent?.sentiment,
        sentimentScore: sent?.sentimentScore,
        publishedAt: raw.publishedAt,
      };

      const list = candArticlesMap.get(ac.candidate_id) || [];
      list.push(article);
      candArticlesMap.set(ac.candidate_id, list);

      if (sent?.sentimentScore != null) {
        const scores = candSentimentScores.get(ac.candidate_id) || [];
        scores.push(sent.sentimentScore);
        candSentimentScores.set(ac.candidate_id, scores);
      }
    }

    for (const c of dbCandidates) {
      const articles = candArticlesMap.get(c.id) || [];
      const scores = candSentimentScores.get(c.id) || [];
      const avgScore = scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null;

      candidates.push({
        id: c.id,
        name: c.name,
        party: mapParty(c.party),
        isIncumbent: c.is_incumbent,
        articles,
        avgSentimentScore: avgScore,
      });
    }

    // Sort: incumbents first, then by article count desc
    candidates.sort((a, b) => {
      if (a.isIncumbent !== b.isIncumbent) return a.isIncumbent ? -1 : 1;
      return b.articles.length - a.articles.length;
    });
  }

  return { issues, candidates };
}
