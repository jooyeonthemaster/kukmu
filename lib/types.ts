export interface Minister {
  id: string;
  name: string;
  ministry: string;
  position: string;
  imageUrl?: string;
  totalStatements: number;
  fulfillmentRate: number;
  recentActivity: string;
  trend: "up" | "down" | "stable";
  trackedAgendas: number;
}

export interface Agenda {
  id: string;
  title: string;
  ministry: string;
  ministerName: string;
  status: "proposed" | "discussing" | "decided" | "implementing" | "completed";
  date: string;
  category: string;
  priority: "high" | "medium" | "low";
  description: string;
  relatedStocks?: StockImpact[];
}

export interface StockImpact {
  stockCode: string;
  stockName: string;
  impactScore: number; // -100 ~ +100
  direction: "positive" | "negative" | "neutral";
  sector: string;
  relatedPolicy: string;
  priceChange?: number;
  volume?: number;
}

export interface Meeting {
  id: string;
  meetingNumber: number;
  date: string;
  totalAgendas: number;
  keyHighlights: string[];
  attendees: string[];
  agendas: Agenda[];
}

export interface KPIStat {
  label: string;
  value: string | number;
  change: number;
  changeLabel: string;
  icon: string;
}

export interface HotTopic {
  id: string;
  keyword: string;
  count: number;
  trend: "rising" | "falling" | "steady";
  relatedMinistry: string;
  category: string;
}

export type AgendaStatus = Agenda["status"];

export const STATUS_LABELS: Record<AgendaStatus, string> = {
  proposed: "발의됨",
  discussing: "논의중",
  decided: "의결",
  implementing: "이행중",
  completed: "완료",
};

export const STATUS_COLORS: Record<AgendaStatus, string> = {
  proposed: "bg-info/10 text-info border-info/20",
  discussing: "bg-warning/10 text-warning border-warning/20",
  decided: "bg-primary/10 text-primary border-primary/20",
  implementing: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  completed: "bg-success/10 text-success border-success/20",
};

export const PRIORITY_LABELS: Record<Agenda["priority"], string> = {
  high: "긴급",
  medium: "보통",
  low: "일반",
};
