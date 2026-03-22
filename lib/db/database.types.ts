/**
 * Supabase Database Types - 국무노션 (GukmuNotion)
 *
 * Comprehensive type definitions matching the SQL schema.
 * In production, regenerate with: npx supabase gen types typescript
 */

// ────────────────────────────────────────────────────────────
// Row types (individual table records)
// ────────────────────────────────────────────────────────────

export interface RawArticle {
  id: string;
  source: string;
  source_id: string | null;
  url: string;
  title: string;
  body: string | null;
  summary: string | null;
  author: string | null;
  publisher: string | null;
  published_at: string | null;
  collected_at: string;
  is_analyzed: boolean;
}

export interface RawPoll {
  id: string;
  nesdc_id: number | null;
  election_type: string | null;
  region: string | null;
  pollster: string;
  commissioner: string | null;
  survey_start: string | null;
  survey_end: string | null;
  method: string | null;
  sample_size: number | null;
  margin_of_error: number | null;
  response_rate: number | null;
  raw_html: string | null;
  raw_results: Record<string, unknown> | null;
  pdf_urls: string[] | null;
  collected_at: string;
  is_analyzed: boolean;
}

export interface RawCommunityPost {
  id: string;
  source: string;
  source_id: string | null;
  url: string | null;
  title: string | null;
  body: string | null;
  author: string | null;
  published_at: string | null;
  upvotes: number;
  comments_count: number;
  collected_at: string;
  is_analyzed: boolean;
}

export interface AnalyzedArticle {
  id: string;
  raw_article_id: string | null;
  big_category: string | null;
  small_category: string | null;
  region_category: string | null;
  keywords: string[] | null;
  entities: Record<string, unknown> | null;
  relevance_score: number | null;
  is_significant: boolean;
  significance_reason: string | null;
  sentiment: "positive" | "negative" | "neutral" | "mixed" | null;
  sentiment_score: number | null;
  ai_summary: string | null;
  related_province_codes: string[] | null;
  related_candidate_ids: string[] | null;
  related_agenda_ids: string[] | null;
  related_issue_ids: string[] | null;
  trend_signal: "rising" | "falling" | "stable" | "breaking" | null;
  trend_detail: string | null;
  analyzed_at: string;
  analyzer_model: string;
}

export interface CandidateSentiment {
  id: string;
  article_id: string | null;
  candidate_id: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  sentiment_score: number | null;
  context: string | null;
  analyzed_at: string;
}

export interface Province {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  population: number | null;
  voter_count: number | null;
  council_seats: number | null;
  updated_at: string;
}

export interface District {
  id: string;
  code: string;
  province_id: string | null;
  name: string;
  population: number | null;
  updated_at: string;
}

export interface Candidate {
  id: string;
  province_id: string | null;
  district_id: string | null;
  nec_id: string | null;
  name: string;
  party: string;
  age: number | null;
  is_incumbent: boolean;
  career: string[] | null;
  pledges: string[] | null;
  photo_url: string | null;
  updated_at: string;
}

export interface Poll {
  id: string;
  raw_poll_id: string | null;
  province_id: string | null;
  district_id: string | null;
  pollster: string;
  commissioner: string | null;
  survey_date: string;
  method: string | null;
  sample_size: number | null;
  margin_of_error: number | null;
  response_rate: number | null;
  published_at: string | null;
  created_at: string;
}

export interface PollResult {
  id: string;
  poll_id: string | null;
  candidate_id: string | null;
  percentage: number;
  rank: number | null;
}

export interface PollTrend {
  id: string;
  province_id: string | null;
  candidate_id: string | null;
  date: string;
  avg_percentage: number | null;
  poll_count: number | null;
  trend_direction: "up" | "down" | "stable" | null;
  change_amount: number | null;
  created_at: string;
}

export interface Issue {
  id: string;
  province_id: string | null;
  district_id: string | null;
  title: string;
  description: string | null;
  severity: "critical" | "high" | "medium" | "low" | null;
  category: string | null;
  first_detected: string;
  last_updated: string;
  mention_count: number;
  related_articles: string[] | null;
  is_active: boolean;
}

export interface Minister {
  id: string;
  name: string;
  ministry: string;
  position: string | null;
  photo_url: string | null;
  fulfillment_rate: number;
  tracked_agendas: number;
  trend: "up" | "down" | "stable" | null;
  updated_at: string;
}

export interface Agenda {
  id: string;
  title: string;
  ministry: string;
  minister_name: string | null;
  status: "proposed" | "discussing" | "decided" | "implementing" | "completed" | null;
  date: string | null;
  category: string | null;
  priority: "urgent" | "normal" | "low" | null;
  description: string | null;
  meeting_number: number | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgendaTracking {
  id: string;
  agenda_id: string | null;
  status_before: string | null;
  status_after: string | null;
  tracked_at: string;
  source: string | null;
  note: string | null;
}

export interface StockImpact {
  id: string;
  stock_code: string;
  stock_name: string;
  sector: string | null;
  related_agenda_id: string | null;
  related_policy: string | null;
  impact_score: number | null;
  direction: "up" | "down" | "neutral" | null;
  price_change: number | null;
  analyzed_at: string;
}

export interface HotTopic {
  id: string;
  keyword: string;
  count: number;
  trend: "up" | "down" | "stable" | "new" | null;
  related_ministry: string | null;
  category: string | null;
  first_seen: string;
  last_seen: string;
}

export interface DailyBriefing {
  id: string;
  date: string;
  summary: string | null;
  key_findings: Record<string, unknown> | null;
  risk_alerts: Record<string, unknown> | null;
  province_highlights: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
  created_at: string;
}

// ────────────────────────────────────────────────────────────
// View row types
// ────────────────────────────────────────────────────────────

export interface LatestPoll {
  province_id: string;
  province_name: string;
  province_code: string;
  candidate_id: string;
  candidate_name: string;
  party: string;
  percentage: number;
  pollster: string;
  survey_date: string;
  sample_size: number | null;
  margin_of_error: number | null;
}

export interface CandidateSentimentTrend {
  candidate_id: string;
  candidate_name: string;
  party: string;
  date: string;
  avg_sentiment: number;
  article_count: number;
}

export interface ProvincePollSummary {
  province_code: string;
  province_name: string;
  candidate_name: string;
  party: string;
  avg_percentage: number | null;
  trend_direction: "up" | "down" | "stable" | null;
  change_amount: number | null;
  trend_date: string;
}

export interface RecentSignificantNews {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  published_at: string | null;
  ai_summary: string | null;
  sentiment: "positive" | "negative" | "neutral" | "mixed" | null;
  sentiment_score: number | null;
  keywords: string[] | null;
  trend_signal: "rising" | "falling" | "stable" | "breaking" | null;
  trend_detail: string | null;
  related_province_codes: string[] | null;
}

// ────────────────────────────────────────────────────────────
// Supabase Database interface
// ────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      raw_articles: {
        Row: RawArticle;
        Insert: Omit<RawArticle, "id" | "collected_at" | "is_analyzed"> & {
          id?: string;
          collected_at?: string;
          is_analyzed?: boolean;
        };
        Update: Partial<RawArticle>;
      };
      raw_polls: {
        Row: RawPoll;
        Insert: Omit<RawPoll, "id" | "collected_at" | "is_analyzed"> & {
          id?: string;
          collected_at?: string;
          is_analyzed?: boolean;
        };
        Update: Partial<RawPoll>;
      };
      raw_community_posts: {
        Row: RawCommunityPost;
        Insert: Omit<RawCommunityPost, "id" | "collected_at" | "is_analyzed" | "upvotes" | "comments_count"> & {
          id?: string;
          collected_at?: string;
          is_analyzed?: boolean;
          upvotes?: number;
          comments_count?: number;
        };
        Update: Partial<RawCommunityPost>;
      };
      analyzed_articles: {
        Row: AnalyzedArticle;
        Insert: Omit<AnalyzedArticle, "id" | "analyzed_at" | "analyzer_model" | "is_significant"> & {
          id?: string;
          analyzed_at?: string;
          analyzer_model?: string;
          is_significant?: boolean;
        };
        Update: Partial<AnalyzedArticle>;
      };
      candidate_sentiments: {
        Row: CandidateSentiment;
        Insert: Omit<CandidateSentiment, "id" | "analyzed_at"> & {
          id?: string;
          analyzed_at?: string;
        };
        Update: Partial<CandidateSentiment>;
      };
      provinces: {
        Row: Province;
        Insert: Omit<Province, "id" | "updated_at"> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Province>;
      };
      districts: {
        Row: District;
        Insert: Omit<District, "id" | "updated_at"> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<District>;
      };
      candidates: {
        Row: Candidate;
        Insert: Omit<Candidate, "id" | "updated_at" | "is_incumbent"> & {
          id?: string;
          updated_at?: string;
          is_incumbent?: boolean;
        };
        Update: Partial<Candidate>;
      };
      polls: {
        Row: Poll;
        Insert: Omit<Poll, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Poll>;
      };
      poll_results: {
        Row: PollResult;
        Insert: Omit<PollResult, "id"> & {
          id?: string;
        };
        Update: Partial<PollResult>;
      };
      poll_trends: {
        Row: PollTrend;
        Insert: Omit<PollTrend, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<PollTrend>;
      };
      issues: {
        Row: Issue;
        Insert: Omit<Issue, "id" | "first_detected" | "last_updated" | "mention_count" | "is_active"> & {
          id?: string;
          first_detected?: string;
          last_updated?: string;
          mention_count?: number;
          is_active?: boolean;
        };
        Update: Partial<Issue>;
      };
      ministers: {
        Row: Minister;
        Insert: Omit<Minister, "id" | "updated_at" | "fulfillment_rate" | "tracked_agendas"> & {
          id?: string;
          updated_at?: string;
          fulfillment_rate?: number;
          tracked_agendas?: number;
        };
        Update: Partial<Minister>;
      };
      agendas: {
        Row: Agenda;
        Insert: Omit<Agenda, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Agenda>;
      };
      agenda_tracking: {
        Row: AgendaTracking;
        Insert: Omit<AgendaTracking, "id" | "tracked_at"> & {
          id?: string;
          tracked_at?: string;
        };
        Update: Partial<AgendaTracking>;
      };
      stock_impacts: {
        Row: StockImpact;
        Insert: Omit<StockImpact, "id" | "analyzed_at"> & {
          id?: string;
          analyzed_at?: string;
        };
        Update: Partial<StockImpact>;
      };
      hot_topics: {
        Row: HotTopic;
        Insert: Omit<HotTopic, "id" | "count" | "first_seen" | "last_seen"> & {
          id?: string;
          count?: number;
          first_seen?: string;
          last_seen?: string;
        };
        Update: Partial<HotTopic>;
      };
      daily_briefings: {
        Row: DailyBriefing;
        Insert: Omit<DailyBriefing, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<DailyBriefing>;
      };
    };
    Views: {
      v_latest_polls: {
        Row: LatestPoll;
      };
      v_candidate_sentiment_trend: {
        Row: CandidateSentimentTrend;
      };
      v_province_poll_summary: {
        Row: ProvincePollSummary;
      };
      v_recent_significant_news: {
        Row: RecentSignificantNews;
      };
    };
    Functions: {
      update_poll_trends_for_province: {
        Args: { p_province_id: string };
        Returns: void;
      };
      refresh_hot_topics: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
    Enums: Record<string, never>;
  };
}
