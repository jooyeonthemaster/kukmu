import { NextRequest, NextResponse } from "next/server";
import { getNewsByProvince, getNewsByCandidate } from "@/lib/election-queries";
import { createClient } from "@supabase/supabase-js";
import type { TrendSignal } from "@/lib/election-types";
import { mapParty } from "@/lib/election-queries";

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const province = searchParams.get("province");
  const district = searchParams.get("district");
  const candidate = searchParams.get("candidate");
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  try {
    if (candidate) {
      const news = await getNewsByCandidate(candidate, limit);
      return NextResponse.json(news);
    }

    // District-level news: search raw_articles where title/body contains district name
    if (district) {
      const news = await getNewsByDistrict(district, province, limit);
      return NextResponse.json(news);
    }

    if (province) {
      const news = await getNewsByProvince(province, limit);
      return NextResponse.json(news);
    }

    return NextResponse.json(
      { error: "Missing ?province=, ?district=, or ?candidate= query parameter" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[/api/election/news] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 },
    );
  }
}

function parsePanseImpact(aiSummary: string | null): { summary?: string; panseImpact?: string } {
  if (!aiSummary) return {};
  const marker = "【판세 영향】";
  const idx = aiSummary.indexOf(marker);
  if (idx === -1) return { summary: aiSummary };
  const summary = aiSummary.slice(0, idx).trim() || undefined;
  const panseImpact = aiSummary.slice(idx + marker.length).trim() || undefined;
  return { summary, panseImpact };
}

async function getNewsByDistrict(districtName: string, provinceCode: string | null, limit: number) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Strategy 1: Search raw_articles where title contains district name
  const { data: rawArticles } = await supabase
    .from("raw_articles")
    .select("id, title, url, publisher, published_at, summary")
    .ilike("title", `%${districtName}%`)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (rawArticles && rawArticles.length > 0) {
    // Get analysis data for these articles
    const articleIds = rawArticles.map(a => a.id);
    const { data: analyses } = await supabase
      .from("analyzed_articles")
      .select("id, raw_article_id, sentiment, sentiment_score, ai_summary, relevance_score, trend_signal, trend_detail, keywords")
      .in("raw_article_id", articleIds);

    const analysisMap = new Map(
      (analyses ?? []).map(a => [a.raw_article_id, a])
    );

    // Get candidate mentions for analyzed articles
    const analyzedIds = (analyses ?? []).map(a => a.id);
    let mentionsMap = new Map<string, Array<{
      candidateId: string;
      candidateName: string;
      party: string;
      mentionType: string;
      context: string;
      sentimentScore: number;
    }>>();

    if (analyzedIds.length > 0) {
      const { data: articleCandidates } = await supabase
        .from("article_candidates")
        .select("analyzed_article_id, candidate_id, context, mention_type, candidates!inner(name, party)")
        .in("analyzed_article_id", analyzedIds);

      const { data: sentiments } = await supabase
        .from("candidate_sentiments")
        .select("candidate_id, analyzed_article_id, sentiment_score")
        .in("analyzed_article_id", analyzedIds);

      const sentimentLookup = new Map<string, number>();
      if (sentiments) {
        for (const s of sentiments) {
          sentimentLookup.set(`${s.analyzed_article_id}:${s.candidate_id}`, Number(s.sentiment_score) || 0);
        }
      }

      if (articleCandidates) {
        for (const ac of articleCandidates as unknown as Array<{
          analyzed_article_id: string;
          candidate_id: string;
          context: string;
          mention_type: string;
          candidates: { name: string; party: string };
        }>) {
          const list = mentionsMap.get(ac.analyzed_article_id) || [];
          list.push({
            candidateId: ac.candidate_id,
            candidateName: ac.candidates.name,
            party: ac.candidates.party,
            mentionType: ac.mention_type || "mention",
            context: ac.context || "",
            sentimentScore: sentimentLookup.get(`${ac.analyzed_article_id}:${ac.candidate_id}`) || 0,
          });
          mentionsMap.set(ac.analyzed_article_id, list);
        }
      }
    }

    return rawArticles.map(ra => {
      const analysis = analysisMap.get(ra.id);
      const { summary, panseImpact } = parsePanseImpact(analysis?.ai_summary);
      const rawMentions = analysis ? (mentionsMap.get(analysis.id) || []) : [];

      return {
        id: ra.id,
        title: ra.title,
        url: ra.url,
        source: ra.publisher || "뉴스",
        publishedAt: ra.published_at || "",
        sentiment: analysis?.sentiment || undefined,
        sentimentScore: analysis?.sentiment_score ? Number(analysis.sentiment_score) : undefined,
        summary: summary || ra.summary || undefined,
        panseImpact,
        relevanceScore: analysis?.relevance_score ? Number(analysis.relevance_score) : undefined,
        trendSignal: (analysis?.trend_signal as TrendSignal) || undefined,
        trendDetail: analysis?.trend_detail || undefined,
        keywords: analysis?.keywords || undefined,
        candidateMentions: rawMentions.length > 0 ? rawMentions.map(m => ({
          ...m,
          party: mapParty(m.party),
        })) : undefined,
      };
    });
  }

  // Strategy 2: Also search body for district name
  const { data: bodyArticles } = await supabase
    .from("raw_articles")
    .select("id, title, url, publisher, published_at, summary")
    .or(`title.ilike.%${districtName}%,body.ilike.%${districtName}%`)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!bodyArticles || bodyArticles.length === 0) {
    // Strategy 3: Fall back to province-level news if no district-specific found
    if (provinceCode) {
      return getNewsByProvince(provinceCode, limit);
    }
    return [];
  }

  return bodyArticles.map(ra => ({
    id: ra.id,
    title: ra.title,
    url: ra.url,
    source: ra.publisher || "뉴스",
    publishedAt: ra.published_at || "",
    summary: ra.summary || undefined,
  }));
}
