/**
 * 에이전트 워크플로우 정의
 *
 * OpenClaw + Lobster 연동 시 사용할 워크플로우 스펙.
 * 각 워크플로우는 Lobster pipeline 으로 실행되며,
 * ACPX 헤드리스 CLI로 스케줄링/모니터링한다.
 *
 * 현재: 구조 정의만 (실제 실행은 OpenClaw 연동 후)
 */

export interface WorkflowStep {
  id: string;
  name: string;
  type: "crawl" | "parse" | "analyze" | "store" | "notify";
  description: string;
  inputs: string[];
  outputs: string[];
}

export interface AgentWorkflow {
  id: string;
  name: string;
  schedule: string; // cron expression
  description: string;
  steps: WorkflowStep[];
}

// ── 워크플로우 1: 국무회의 자동 수집 ──

export const MEETING_CRAWLER_WORKFLOW: AgentWorkflow = {
  id: "wf-meeting-crawler",
  name: "국무회의 자동 수집",
  schedule: "0 9 * * WED", // 매주 수요일 09:00 (국무회의 다음날)
  description:
    "행안부 국무회의 사이트에서 새 회의록을 감지하고, PDF/HWPX를 다운로드한 뒤 파싱·분석하여 DB에 저장한다.",
  steps: [
    {
      id: "step-1",
      name: "MOIS 사이트 크롤링",
      type: "crawl",
      description:
        "https://www.mois.go.kr 국무회의 목록 페이지에서 최신 회의 확인",
      inputs: ["last_crawled_meeting_number"],
      outputs: ["new_meeting_urls"],
    },
    {
      id: "step-2",
      name: "회의록 다운로드",
      type: "crawl",
      description: "새 회의의 PDF/HWPX 첨부파일 다운로드",
      inputs: ["new_meeting_urls"],
      outputs: ["downloaded_files"],
    },
    {
      id: "step-3",
      name: "문서 파싱",
      type: "parse",
      description:
        "PDF → pdfplumber, HWPX → xml 파싱으로 텍스트 추출",
      inputs: ["downloaded_files"],
      outputs: ["parsed_text"],
    },
    {
      id: "step-4",
      name: "LLM 분석",
      type: "analyze",
      description:
        "Claude API로 회의 분석: 안건 추출, 발언 정리, 정책 약속 식별, 종목 영향도 평가",
      inputs: ["parsed_text"],
      outputs: ["analysis_result"],
    },
    {
      id: "step-5",
      name: "DB 저장",
      type: "store",
      description:
        "분석 결과를 Supabase에 저장 (meetings, agendas, statements, stock_impacts)",
      inputs: ["analysis_result"],
      outputs: ["stored_ids"],
    },
    {
      id: "step-6",
      name: "알림 발송",
      type: "notify",
      description:
        "새 회의 분석 완료 알림 (주요 안건, 정책 변화 요약)",
      inputs: ["stored_ids", "analysis_result"],
      outputs: ["notification_sent"],
    },
  ],
};

// ── 워크플로우 2: 뉴스 크롤링·분석 ──

export const NEWS_CRAWLER_WORKFLOW: AgentWorkflow = {
  id: "wf-news-crawler",
  name: "정책 뉴스 자동 수집·분석",
  schedule: "0 */4 * * *", // 4시간마다
  description:
    "주요 뉴스 소스에서 국무회의/정책 관련 기사를 수집하고, AI로 요약·분류한 뒤 관련 안건과 매핑한다.",
  steps: [
    {
      id: "step-1",
      name: "뉴스 소스 크롤링",
      type: "crawl",
      description:
        "연합뉴스, 한겨레, 조선일보, KBS 등에서 '국무회의', '정책', 장관명 키워드로 기사 수집",
      inputs: ["keyword_list", "last_crawled_timestamp"],
      outputs: ["raw_articles"],
    },
    {
      id: "step-2",
      name: "중복 제거 & 필터링",
      type: "parse",
      description:
        "URL 기반 중복 제거, 관련도 점수로 필터링 (threshold: 0.5)",
      inputs: ["raw_articles"],
      outputs: ["filtered_articles"],
    },
    {
      id: "step-3",
      name: "AI 분석",
      type: "analyze",
      description:
        "각 기사를 Claude로 분석: 요약, 감성분석, 관련 안건/장관 매핑, 종목 영향 평가",
      inputs: ["filtered_articles"],
      outputs: ["analyzed_articles"],
    },
    {
      id: "step-4",
      name: "DB 저장 & 연결",
      type: "store",
      description:
        "news_articles 테이블에 저장, news_agendas/news_ministers junction 생성",
      inputs: ["analyzed_articles"],
      outputs: ["stored_news_ids"],
    },
    {
      id: "step-5",
      name: "핫 토픽 갱신",
      type: "analyze",
      description:
        "최근 24시간 뉴스 키워드 빈도 분석, hot_topics 테이블 업데이트",
      inputs: ["stored_news_ids"],
      outputs: ["updated_topics"],
    },
  ],
};

// ── 워크플로우 3: 이행률 추적 ──

export const FULFILLMENT_TRACKER_WORKFLOW: AgentWorkflow = {
  id: "wf-fulfillment-tracker",
  name: "정책 이행률 추적",
  schedule: "0 6 * * MON", // 매주 월요일 06:00
  description:
    "장관 발언/공약 대비 실제 이행 상황을 뉴스·관보 기반으로 자동 추적한다.",
  steps: [
    {
      id: "step-1",
      name: "미이행 약속 조회",
      type: "crawl",
      description:
        "statements 테이블에서 is_commitment=true, is_fulfilled=null인 건 조회",
      inputs: [],
      outputs: ["pending_commitments"],
    },
    {
      id: "step-2",
      name: "이행 증거 탐색",
      type: "crawl",
      description:
        "각 약속에 대해 뉴스/관보/정부보도자료에서 이행 증거 검색",
      inputs: ["pending_commitments"],
      outputs: ["evidence_candidates"],
    },
    {
      id: "step-3",
      name: "AI 판정",
      type: "analyze",
      description:
        "Claude로 약속과 증거를 대조하여 이행 여부 판정 (fulfilled/not_yet/partial)",
      inputs: ["pending_commitments", "evidence_candidates"],
      outputs: ["fulfillment_results"],
    },
    {
      id: "step-4",
      name: "DB 업데이트",
      type: "store",
      description:
        "statements.is_fulfilled 업데이트, ministers.fulfillment_rate 재계산",
      inputs: ["fulfillment_results"],
      outputs: ["updated_ministers"],
    },
  ],
};

// ── 워크플로우 4: 종목 영향도 실시간 갱신 ──

export const STOCK_IMPACT_WORKFLOW: AgentWorkflow = {
  id: "wf-stock-impact",
  name: "종목 영향도 실시간 갱신",
  schedule: "30 15 * * 1-5", // 평일 15:30 (장 마감 후)
  description:
    "정책 변화와 주가 데이터를 결합하여 종목 영향도 스코어를 갱신한다.",
  steps: [
    {
      id: "step-1",
      name: "당일 정책 변화 수집",
      type: "crawl",
      description: "오늘 업데이트된 안건/뉴스에서 정책 시그널 추출",
      inputs: [],
      outputs: ["policy_signals"],
    },
    {
      id: "step-2",
      name: "주가 데이터 수집",
      type: "crawl",
      description:
        "KIS API/네이버금융에서 추적 종목의 당일 주가·거래량 수집",
      inputs: ["tracked_stock_codes"],
      outputs: ["price_data"],
    },
    {
      id: "step-3",
      name: "영향도 재산출",
      type: "analyze",
      description:
        "정책 시그널 + 주가 변동을 결합하여 impact_score 재산출",
      inputs: ["policy_signals", "price_data"],
      outputs: ["updated_scores"],
    },
    {
      id: "step-4",
      name: "DB 갱신",
      type: "store",
      description: "stock_impacts 테이블 업데이트",
      inputs: ["updated_scores"],
      outputs: ["updated_stock_ids"],
    },
  ],
};

/** 모든 워크플로우 목록 */
export const ALL_WORKFLOWS: AgentWorkflow[] = [
  MEETING_CRAWLER_WORKFLOW,
  NEWS_CRAWLER_WORKFLOW,
  FULFILLMENT_TRACKER_WORKFLOW,
  STOCK_IMPACT_WORKFLOW,
];
