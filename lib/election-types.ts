export type PartyId = "ppp" | "dp" | "rkp" | "rp" | "pp" | "ind";

export interface Party {
  id: PartyId;
  name: string;
  color: string;
  lightColor: string;
  textColor: string;
}

export const PARTIES: Record<PartyId, Party> = {
  ppp: { id: "ppp", name: "국민의힘", color: "#E61E2B", lightColor: "rgba(230,30,43,0.15)", textColor: "#FF4D5A" },
  dp: { id: "dp", name: "더불어민주당", color: "#004EA2", lightColor: "rgba(0,78,162,0.15)", textColor: "#4D9BFF" },
  rkp: { id: "rkp", name: "조국혁신당", color: "#0D3E84", lightColor: "rgba(13,62,132,0.15)", textColor: "#5B8FD4" },
  rp: { id: "rp", name: "개혁신당", color: "#FF7210", lightColor: "rgba(255,114,16,0.15)", textColor: "#FFA45C" },
  pp: { id: "pp", name: "진보당", color: "#D6001C", lightColor: "rgba(214,0,28,0.15)", textColor: "#FF4D60" },
  ind: { id: "ind", name: "무소속", color: "#6B7280", lightColor: "rgba(107,114,128,0.15)", textColor: "#9CA3AF" },
};

export const PARTY_ORDER: PartyId[] = ["ppp", "dp", "rkp", "rp", "pp", "ind"];

export interface Candidate {
  id: string;
  name: string;
  party: PartyId;
  age: number;
  incumbent: boolean;
  career: string[];
  pledges: string[];
}

export interface PollEntry {
  candidateName: string;
  party: PartyId;
  percentage: number;
}

export interface Poll {
  date: string;
  source: string;
  sampleSize: number;
  marginOfError: number;
  results: PollEntry[];
}

export interface HistoricalResult {
  year: number;
  winner: string;
  party: PartyId;
  percentage: number;
  turnout: number;
}

export interface ProvinceIssue {
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface Province {
  code: string;
  name: string;
  nameEn: string;
  population: number;
  voterCount: number;
  councilSeats: number;
  leadingParty: PartyId;
  candidates: Candidate[];
  polls: Poll[];
  history: HistoricalResult[];
  issues: ProvinceIssue[];
  keyMunicipalities: string[];
}

export interface ElectionStats {
  totalProvinces: number;
  totalCandidates: number;
  totalPolls: number;
  averageTurnout2022: number;
  electionDate: string;
  dDay: number;
}

export interface District {
  code: string;         // 5-digit code (e.g. "11010" for 종로구)
  provinceCode: string; // 2-digit parent province code
  name: string;
  population: number;
  leadingParty: PartyId;
  candidates: DistrictCandidate[];
  pollPct: [number, number];  // [leading %, trailing %] latest poll
  issues: string[];
}

export interface DistrictCandidate {
  name: string;
  party: PartyId;
  percentage: number;
  incumbent: boolean;
}

export interface MapFeatureProperties {
  code: string;
  name: string;
  name_eng: string;
  [key: string]: unknown;
}

// ── Extended types for candidate detail & news ──

export type TrendSignal = "rising" | "falling" | "stable" | "breaking";

export interface ArticleCandidateMention {
  candidateId: string;
  candidateName: string;
  party: PartyId;
  mentionType: "direct_quote" | "mention" | "analysis";
  context: string;
  sentimentScore: number;
}

export interface ArticleSummary {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  sentiment?: string;
  sentimentScore?: number;
  summary?: string;
  panseImpact?: string;
  relevanceScore?: number;
  trendSignal?: TrendSignal;
  trendDetail?: string;
  keywords?: string[];
  candidateMentions?: ArticleCandidateMention[];
}

export interface CandidateDetail extends Candidate {
  education?: string;
  birthDate?: string;
  job?: string;
  address?: string;
  bioSummary?: string;
  slug?: string;
  districtName?: string;
  provinceName?: string;
  relatedNews: ArticleSummary[];
  sentimentTrend: { date: string; score: number; count: number }[];
}
