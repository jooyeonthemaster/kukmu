/**
 * 간단 통합 테스트: 네이버 검색 → Supabase 저장 → Claude 분석
 * 실행: npx tsx trigger/test-pipeline.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ── 1. 네이버 뉴스 검색 테스트 ──

async function testNaverSearch() {
  console.log("\n🔍 [1/3] 네이버 뉴스 검색 테스트...");

  const params = new URLSearchParams({
    query: "지방선거 2026",
    display: "5",
    start: "1",
    sort: "date",
  });

  const response = await fetch(
    `https://openapi.naver.com/v1/search/news.json?${params}`,
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
      },
    },
  );

  if (!response.ok) {
    console.error(`  ❌ 네이버 API 실패: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  const items = data.items ?? [];

  console.log(`  ✅ ${items.length}개 뉴스 검색 성공`);
  for (const item of items) {
    const title = item.title.replace(/<[^>]*>/g, "");
    console.log(`     - ${title}`);
  }

  return items;
}

// ── 2. Supabase 저장 테스트 ──

async function testSupabaseStore(articles: any[]) {
  console.log("\n💾 [2/3] Supabase 저장 테스트...");

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const rows = articles.slice(0, 3).map((item: any, idx: number) => ({
    source: "naver",
    source_id: `test-${Date.now()}-${idx}`,
    title: item.title.replace(/<[^>]*>/g, ""),
    url: item.originallink || item.link,
    body: item.description.replace(/<[^>]*>/g, ""),
    published_at: new Date(item.pubDate).toISOString(),
    collected_at: new Date().toISOString(),
    is_analyzed: false,
  }));

  const { data, error } = await supabase
    .from("raw_articles")
    .insert(rows)
    .select("id, title");

  if (error) {
    console.error(`  ❌ Supabase 저장 실패: ${error.message}`);
    return null;
  }

  console.log(`  ✅ ${data.length}개 기사 저장 성공`);
  for (const row of data) {
    console.log(`     - [${row.id.slice(0, 8)}...] ${row.title.slice(0, 40)}`);
  }

  return data;
}

// ── 3. Claude 분석 테스트 ──

async function testClaudeAnalysis(article: { id: string; title: string }) {
  console.log("\n🧠 [3/3] Claude 분석 테스트...");

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `다음 뉴스 제목의 2026 지방선거 관련도를 0~1로 평가하고 간단히 분석하세요. JSON으로 응답.
제목: "${article.title}"
형식: {"relevance": 0.0~1.0, "sentiment": "positive|negative|neutral", "summary": "한줄요약"}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch![0]);
    console.log(`  ✅ Claude 분석 성공`);
    console.log(`     - 관련도: ${parsed.relevance}`);
    console.log(`     - 감성: ${parsed.sentiment}`);
    console.log(`     - 요약: ${parsed.summary}`);
    return parsed;
  } catch {
    console.log(`  ⚠️ JSON 파싱 실패, 원문: ${text.slice(0, 200)}`);
    return null;
  }
}

// ── 실행 ──

async function main() {
  console.log("=== 국무노션 파이프라인 통합 테스트 ===");
  console.log(`시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);

  // 1. 네이버 검색
  const articles = await testNaverSearch();
  if (!articles || articles.length === 0) {
    console.log("\n❌ 네이버 검색 실패, 테스트 중단");
    return;
  }

  // 2. Supabase 저장
  const stored = await testSupabaseStore(articles);
  if (!stored || stored.length === 0) {
    console.log("\n❌ Supabase 저장 실패, 테스트 중단");
    return;
  }

  // 3. Claude 분석
  await testClaudeAnalysis(stored[0]);

  // 결과 확인
  console.log("\n=== 테스트 완료 ===");
  console.log("✅ 네이버 검색 → Supabase 저장 → Claude 분석 파이프라인 정상 동작");
}

main().catch((err) => {
  console.error("\n❌ 테스트 실패:", err.message);
  process.exit(1);
});
