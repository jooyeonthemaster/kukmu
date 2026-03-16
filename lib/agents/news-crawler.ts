/**
 * 뉴스 크롤러 에이전트
 *
 * 주요 뉴스 소스에서 국무회의/정책 관련 기사를 수집하고
 * AI로 분석하여 Supabase에 저장한다.
 *
 * 실행: npx tsx lib/agents/news-crawler.ts
 * 필요: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { createClient } from "@supabase/supabase-js";

// ── 뉴스 소스 설정 ──

interface NewsSource {
  id: string;
  name: string;
  baseUrl: string;
  searchUrl: (keyword: string) => string;
  /** 기사 목록에서 개별 기사 URL을 추출하는 셀렉터 */
  linkSelector: string;
}

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: "yonhap",
    name: "연합뉴스",
    baseUrl: "https://www.yna.co.kr",
    searchUrl: (kw) =>
      `https://www.yna.co.kr/search/index?query=${encodeURIComponent(kw)}&period=1d`,
    linkSelector: ".cts_atclst a.tit",
  },
  {
    id: "khan",
    name: "경향신문",
    baseUrl: "https://www.khan.co.kr",
    searchUrl: (kw) =>
      `https://search.khan.co.kr/search.html?q=${encodeURIComponent(kw)}&period=1d`,
    linkSelector: ".article_list .title a",
  },
  {
    id: "hani",
    name: "한겨레",
    baseUrl: "https://www.hani.co.kr",
    searchUrl: (kw) =>
      `https://search.hani.co.kr/Search?command=query&keyword=${encodeURIComponent(kw)}&period=1d`,
    linkSelector: ".search-result-list .title a",
  },
  {
    id: "chosun",
    name: "조선일보",
    baseUrl: "https://www.chosun.com",
    searchUrl: (kw) =>
      `https://www.chosun.com/nsearch/?query=${encodeURIComponent(kw)}&period=1d`,
    linkSelector: ".story-card__headline a",
  },
];

// ── 검색 키워드 ──

export const SEARCH_KEYWORDS = [
  "국무회의",
  "국무위원",
  "정책 발표",
  "장관 발언",
  "관계장관회의",
  "정부 시행령",
  "대통령 국무회의",
];

// ── 분석 프롬프트 ──

export const NEWS_ANALYSIS_PROMPT = `당신은 한국 정책 뉴스 분석 전문가입니다. 다음 뉴스 기사를 분석해주세요.

분석 항목:
1. **요약** (summary): 2-3문장으로 핵심 내용 요약
2. **감성** (sentiment): positive / negative / neutral
3. **관련 안건** (related_agendas): 이 기사와 관련된 국무회의 안건 카테고리 목록
4. **관련 장관** (related_ministers): 기사에 언급된 장관명 목록
5. **종목 영향** (stock_impact): 영향받을 수 있는 산업/종목 분야 (있는 경우)
6. **관련도** (relevance_score): 국무회의 추적과의 관련도 0.0~1.0

JSON 형식으로 응답하세요:
{
  "summary": "...",
  "sentiment": "positive|negative|neutral",
  "related_agendas": ["카테고리1", "카테고리2"],
  "related_ministers": ["장관명1"],
  "stock_impact": "분야 설명 또는 null",
  "relevance_score": 0.85
}`;

// ── 크롤링 함수 (개요) ──

export interface CrawledArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  content: string | null;
}

export interface AnalyzedArticle extends CrawledArticle {
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  relatedAgendas: string[];
  relatedMinisters: string[];
  stockImpact: string | null;
  relevanceScore: number;
}

/**
 * 뉴스 크롤링 실행
 * 실제 구현은 Playwright/Puppeteer 또는 RSS 피드를 사용
 */
export async function crawlNews(): Promise<CrawledArticle[]> {
  // TODO: 실제 크롤링 구현
  // 1. 각 NEWS_SOURCE에 대해 SEARCH_KEYWORDS로 검색
  // 2. 기사 URL 수집
  // 3. 개별 기사 본문 추출
  // 4. 중복 URL 제거
  console.log("[news-crawler] Crawling news sources...");
  return [];
}

/**
 * AI 분석 실행
 * Claude API로 기사를 분석하여 메타데이터 추출
 */
export async function analyzeArticle(
  article: CrawledArticle
): Promise<AnalyzedArticle> {
  // TODO: Anthropic API 호출
  // const response = await anthropic.messages.create({
  //   model: "claude-sonnet-4-5-20250929",
  //   max_tokens: 1024,
  //   messages: [{
  //     role: "user",
  //     content: `${NEWS_ANALYSIS_PROMPT}\n\n기사 제목: ${article.title}\n기사 본문:\n${article.content}`
  //   }]
  // });
  return {
    ...article,
    summary: "",
    sentiment: "neutral",
    relatedAgendas: [],
    relatedMinisters: [],
    stockImpact: null,
    relevanceScore: 0,
  };
}

/**
 * 분석된 기사를 Supabase에 저장
 */
export async function storeAnalyzedNews(
  articles: AnalyzedArticle[]
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  for (const article of articles) {
    // 1. 기사 저장
    const { data: inserted, error } = await supabase
      .from("news_articles")
      .upsert(
        {
          title: article.title,
          url: article.url,
          source: article.source,
          published_at: article.publishedAt,
          content: article.content,
          summary: article.summary,
          sentiment: article.sentiment,
          relevance_score: article.relevanceScore,
          is_analyzed: true,
        },
        { onConflict: "url" }
      )
      .select("id")
      .single();

    if (error || !inserted) {
      console.error(`Failed to store: ${article.title}`, error?.message);
      continue;
    }

    // 2. 장관 연결 (minister_name → minister_id 매핑)
    if (article.relatedMinisters.length > 0) {
      const { data: ministers } = await supabase
        .from("ministers")
        .select("id, name")
        .in("name", article.relatedMinisters);

      if (ministers?.length) {
        await supabase.from("news_ministers").upsert(
          ministers.map((m) => ({
            news_id: inserted.id,
            minister_id: m.id,
          }))
        );
      }
    }

    // 3. 안건 연결 (category 기반 매핑)
    if (article.relatedAgendas.length > 0) {
      const { data: agendas } = await supabase
        .from("agendas")
        .select("id, category")
        .in("category", article.relatedAgendas);

      if (agendas?.length) {
        // 카테고리당 최신 안건 1개만 연결
        const seen = new Set<string>();
        const unique = agendas.filter((a) => {
          if (seen.has(a.category)) return false;
          seen.add(a.category);
          return true;
        });

        await supabase.from("news_agendas").upsert(
          unique.map((a) => ({
            news_id: inserted.id,
            agenda_id: a.id,
          }))
        );
      }
    }
  }

  console.log(`[news-crawler] Stored ${articles.length} articles`);
}

// ── 메인 실행 ──

async function main() {
  console.log("=== 뉴스 크롤러 시작 ===");

  // Step 1: 크롤링
  const rawArticles = await crawlNews();
  console.log(`수집된 기사: ${rawArticles.length}건`);

  // Step 2: 분석
  const analyzed: AnalyzedArticle[] = [];
  for (const article of rawArticles) {
    const result = await analyzeArticle(article);
    if (result.relevanceScore >= 0.5) {
      analyzed.push(result);
    }
  }
  console.log(`관련 기사: ${analyzed.length}건 (relevance >= 0.5)`);

  // Step 3: 저장
  await storeAnalyzedNews(analyzed);

  console.log("=== 뉴스 크롤러 완료 ===");
}

// 직접 실행 시
if (require.main === module) {
  main().catch(console.error);
}
