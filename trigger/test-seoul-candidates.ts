/**
 * 서울 25개 구 후보자 + 이슈 자동 수집 테스트
 * 네이버 검색 → Claude 구조화 → Supabase 저장
 * 실행: npx tsx trigger/test-seoul-candidates.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropic = new Anthropic();

// 서울 25개 구
const SEOUL_DISTRICTS = [
  "강남구", "강동구", "강북구", "강서구", "관악구",
  "광진구", "구로구", "금천구", "노원구", "도봉구",
  "동대문구", "동작구", "마포구", "서대문구", "서초구",
  "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
];

// ── 1. 시도/구 시드 데이터 ──

async function seedSeoulDistricts() {
  console.log("\n📍 [1/4] 서울 시도 + 25개 구 시드 데이터...");

  // 서울 province
  const { data: seoul, error: seoulErr } = await supabase
    .from("provinces")
    .upsert(
      { code: "seoul", name: "서울특별시", name_en: "Seoul" },
      { onConflict: "code" },
    )
    .select("id")
    .single();

  if (seoulErr) {
    console.error(`  ❌ 서울 시도 생성 실패: ${seoulErr.message}`);
    return null;
  }

  console.log(`  ✅ 서울특별시 [${seoul.id.slice(0, 8)}...]`);

  // 25개 구
  const districtRows = SEOUL_DISTRICTS.map((name) => ({
    code: `seoul-${name.replace("구", "").toLowerCase()}`,
    province_id: seoul.id,
    name,
  }));

  // 한글 코드 대신 영문 코드 매핑
  const codeMap: Record<string, string> = {
    "강남구": "gangnam", "강동구": "gangdong", "강북구": "gangbuk",
    "강서구": "gangseo", "관악구": "gwanak", "광진구": "gwangjin",
    "구로구": "guro", "금천구": "geumcheon", "노원구": "nowon",
    "도봉구": "dobong", "동대문구": "dongdaemun", "동작구": "dongjak",
    "마포구": "mapo", "서대문구": "seodaemun", "서초구": "seocho",
    "성동구": "seongdong", "성북구": "seongbuk", "송파구": "songpa",
    "양천구": "yangcheon", "영등포구": "yeongdeungpo", "용산구": "yongsan",
    "은평구": "eunpyeong", "종로구": "jongno", "중구": "jung",
    "중랑구": "jungnang",
  };

  const rows = SEOUL_DISTRICTS.map((name) => ({
    code: `seoul-${codeMap[name]}`,
    province_id: seoul.id,
    name,
  }));

  const { data: districts, error: distErr } = await supabase
    .from("districts")
    .upsert(rows, { onConflict: "code" })
    .select("id, code, name");

  if (distErr) {
    console.error(`  ❌ 구 생성 실패: ${distErr.message}`);
    return null;
  }

  console.log(`  ✅ ${districts.length}개 구 생성/업데이트`);
  return { provinceId: seoul.id, districts };
}

// ── 2. 네이버 검색 ──

async function searchNaverNews(query: string, display = 10): Promise<any[]> {
  const params = new URLSearchParams({
    query,
    display: String(display),
    start: "1",
    sort: "date",
  });

  const res = await fetch(
    `https://openapi.naver.com/v1/search/news.json?${params}`,
    {
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
      },
    },
  );

  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((item: any) => ({
    title: item.title.replace(/<[^>]*>/g, ""),
    description: item.description.replace(/<[^>]*>/g, ""),
    url: item.originallink || item.link,
    pubDate: item.pubDate,
  }));
}

// ── 3. Claude로 후보자 + 이슈 추출 ──

async function extractCandidatesAndIssues(
  district: string,
  articles: any[],
): Promise<{
  candidates: Array<{
    name: string;
    party: string;
    is_incumbent: boolean;
    career: string[];
    key_pledges: string[];
  }>;
  issues: Array<{
    title: string;
    description: string;
    severity: string;
    category: string;
  }>;
}> {
  const articleText = articles
    .slice(0, 10)
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.description}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `당신은 2026년 6월 3일 전국동시지방선거 분석 전문가입니다.

다음은 서울 ${district}청장 선거 관련 최신 뉴스입니다:

${articleText}

이 뉴스들을 분석하여 다음 JSON을 반환하세요:
{
  "candidates": [
    {
      "name": "후보 실명",
      "party": "정당명 (더불어민주당/국민의힘/기타)",
      "is_incumbent": true/false,
      "career": ["주요 경력1", "경력2"],
      "key_pledges": ["핵심 공약1", "공약2"]
    }
  ],
  "issues": [
    {
      "title": "이슈 제목",
      "description": "이슈 설명 (1-2문장)",
      "severity": "critical|high|medium|low",
      "category": "개발|교통|환경|복지|교육|안전|행정|기타"
    }
  ]
}

규칙:
1. 뉴스에서 직접 확인 가능한 후보자만 포함 (추측 금지)
2. 현직 구청장이 출마하면 is_incumbent: true
3. 이슈는 해당 구에서 선거 쟁점이 되는 것 위주
4. 정보가 없으면 빈 배열
5. JSON만 반환

JSON:`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch![0]);
  } catch {
    return { candidates: [], issues: [] };
  }
}

// ── 4. Supabase 저장 ──

async function storeCandidatesAndIssues(
  provinceId: string,
  districtId: string,
  districtName: string,
  data: Awaited<ReturnType<typeof extractCandidatesAndIssues>>,
) {
  let candidateCount = 0;
  let issueCount = 0;

  // Store candidates
  for (const c of data.candidates) {
    const { error } = await supabase.from("candidates").upsert(
      {
        province_id: provinceId,
        district_id: districtId,
        name: c.name,
        party: c.party,
        is_incumbent: c.is_incumbent,
        career: c.career,
        pledges: c.key_pledges,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "province_id,name,party" },
    );
    if (!error) candidateCount++;
  }

  // Store issues
  for (const issue of data.issues) {
    const { error } = await supabase.from("issues").insert({
      province_id: provinceId,
      district_id: districtId,
      title: issue.title,
      description: issue.description,
      severity: issue.severity,
      category: issue.category,
      is_active: true,
    });
    if (!error) issueCount++;
  }

  return { candidateCount, issueCount };
}

// ── 메인 실행 ──

async function main() {
  console.log("=== 서울 25개 구 후보자/이슈 자동 수집 ===");
  console.log(`시간: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}\n`);

  // 1. 시드 데이터
  const seed = await seedSeoulDistricts();
  if (!seed) return;

  // 2~4. 구별 검색 → 분석 → 저장 (5개만 테스트)
  const testDistricts = seed.districts;

  console.log(`\n🔍 [2/4] ${testDistricts.length}개 구 전체 수집 (네이버 검색 + Claude 분석)...\n`);

  let totalCandidates = 0;
  let totalIssues = 0;

  for (const district of testDistricts) {
    const query = `${district.name}청장 선거 2026 후보`;
    console.log(`  📌 ${district.name}: "${query}" 검색 중...`);

    // 네이버 검색
    const articles = await searchNaverNews(query, 10);
    console.log(`     뉴스 ${articles.length}개 수집`);

    if (articles.length === 0) {
      console.log(`     ⚠️ 검색 결과 없음, 스킵`);
      continue;
    }

    // Claude 분석
    const result = await extractCandidatesAndIssues(district.name, articles);
    console.log(`     후보 ${result.candidates.length}명, 이슈 ${result.issues.length}개 추출`);

    for (const c of result.candidates) {
      console.log(`       👤 ${c.name} (${c.party})${c.is_incumbent ? " [현직]" : ""}`);
      if (c.key_pledges.length > 0) {
        console.log(`          공약: ${c.key_pledges[0]}`);
      }
    }

    for (const issue of result.issues) {
      console.log(`       🔥 [${issue.severity}] ${issue.title}`);
    }

    // Supabase 저장
    const stored = await storeCandidatesAndIssues(
      seed.provinceId,
      district.id,
      district.name,
      result,
    );

    totalCandidates += stored.candidateCount;
    totalIssues += stored.issueCount;

    // Rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n=== 테스트 완료 ===`);
  console.log(`✅ 후보자 ${totalCandidates}명, 이슈 ${totalIssues}개 Supabase 저장 완료`);
  console.log(`\n💡 전체 25개 구 수집하려면 testDistricts 제한을 제거하세요.`);
}

main().catch((err) => {
  console.error("\n❌ 실패:", err.message);
  process.exit(1);
});
