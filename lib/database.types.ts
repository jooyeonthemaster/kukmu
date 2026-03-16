/** Supabase Database Types - 국무노션
 *  Note: 프로덕션에서는 `npx supabase gen types typescript` 로 자동 생성할 것
 *  이 파일은 수동 타입 정의로, 스키마 변경 시 업데이트 필요
 */

export interface Database {
  public: {
    Tables: {
      ministers: {
        Row: {
          id: string;
          name: string;
          ministry: string;
          position: string;
          image_url: string | null;
          total_statements: number;
          fulfillment_rate: number;
          recent_activity: string | null;
          trend: "up" | "down" | "stable";
          tracked_agendas: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          ministry: string;
          position: string;
          image_url?: string | null;
          total_statements?: number;
          fulfillment_rate?: number;
          recent_activity?: string | null;
          trend?: "up" | "down" | "stable";
          tracked_agendas?: number;
        };
        Update: Partial<Database["public"]["Tables"]["ministers"]["Insert"]>;
      };

      agendas: {
        Row: {
          id: string;
          title: string;
          ministry: string;
          minister_name: string;
          status: "proposed" | "discussing" | "decided" | "implementing" | "completed";
          date: string;
          category: string;
          priority: "high" | "medium" | "low";
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          title: string;
          ministry: string;
          minister_name: string;
          status?: "proposed" | "discussing" | "decided" | "implementing" | "completed";
          date: string;
          category: string;
          priority?: "high" | "medium" | "low";
          description?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["agendas"]["Insert"]>;
      };

      stock_impacts: {
        Row: {
          id: number;
          stock_code: string;
          stock_name: string;
          impact_score: number;
          direction: "positive" | "negative" | "neutral";
          sector: string;
          related_policy: string | null;
          price_change: number | null;
          volume: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          stock_code: string;
          stock_name: string;
          impact_score: number;
          direction: "positive" | "negative" | "neutral";
          sector: string;
          related_policy?: string | null;
          price_change?: number | null;
          volume?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["stock_impacts"]["Insert"]>;
      };

      meetings: {
        Row: {
          id: string;
          meeting_number: number;
          date: string;
          total_agendas: number;
          key_highlights: string[];
          attendees: string[];
          created_at: string;
        };
        Insert: {
          id: string;
          meeting_number: number;
          date: string;
          total_agendas?: number;
          key_highlights?: string[];
          attendees?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["meetings"]["Insert"]>;
      };

      meeting_agendas: {
        Row: {
          meeting_id: string;
          agenda_id: string;
        };
        Insert: {
          meeting_id: string;
          agenda_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["meeting_agendas"]["Insert"]>;
      };

      hot_topics: {
        Row: {
          id: string;
          keyword: string;
          count: number;
          trend: "rising" | "falling" | "steady";
          related_ministry: string | null;
          category: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          keyword: string;
          count?: number;
          trend?: "rising" | "falling" | "steady";
          related_ministry?: string | null;
          category?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["hot_topics"]["Insert"]>;
      };

      news_articles: {
        Row: {
          id: string;
          title: string;
          url: string;
          source: string;
          published_at: string | null;
          crawled_at: string;
          content: string | null;
          summary: string | null;
          sentiment: "positive" | "negative" | "neutral" | null;
          relevance_score: number;
          is_analyzed: boolean;
        };
        Insert: {
          title: string;
          url: string;
          source: string;
          published_at?: string | null;
          content?: string | null;
          summary?: string | null;
          sentiment?: "positive" | "negative" | "neutral" | null;
          relevance_score?: number;
          is_analyzed?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["news_articles"]["Insert"]>;
      };

      statements: {
        Row: {
          id: string;
          minister_id: string;
          meeting_id: string | null;
          content: string;
          date: string;
          category: string | null;
          is_commitment: boolean;
          is_fulfilled: boolean | null;
          source_url: string | null;
          created_at: string;
        };
        Insert: {
          minister_id: string;
          meeting_id?: string | null;
          content: string;
          date: string;
          category?: string | null;
          is_commitment?: boolean;
          is_fulfilled?: boolean | null;
          source_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["statements"]["Insert"]>;
      };

      crawl_jobs: {
        Row: {
          id: string;
          job_type: string;
          status: "pending" | "running" | "completed" | "failed";
          started_at: string | null;
          completed_at: string | null;
          items_found: number;
          error_message: string | null;
          metadata: Record<string, unknown>;
        };
        Insert: {
          job_type: string;
          status?: "pending" | "running" | "completed" | "failed";
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["crawl_jobs"]["Insert"]>;
      };
    };
  };
}
