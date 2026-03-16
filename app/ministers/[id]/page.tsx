import { notFound } from "next/navigation";
import { ministers, agendas, stockImpacts } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  CheckCircle2,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { MinisterTabs } from "./minister-tabs";

/* ---- Static params generation ---- */

export function generateStaticParams() {
  return ministers.map((m) => ({ id: m.id }));
}

/* ---- Helpers ---- */

const AVATAR_COLORS = [
  "bg-primary text-primary-foreground",
  "bg-info text-info-foreground",
  "bg-warning text-warning-foreground",
  "bg-success text-success-foreground",
  "bg-chart-2 text-white",
  "bg-chart-4 text-white",
  "bg-destructive text-white",
  "bg-teal-600 text-white",
];

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.slice(0, 2);
}

/* ---- Page ---- */

export default async function MinisterProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const minister = ministers.find((m) => m.id === id);

  if (!minister) {
    notFound();
  }

  const relatedAgendas = agendas.filter(
    (a) => a.ministerName === minister.name
  );

  // Gather related stocks from agendas and from stockImpacts
  const relatedStockCodes = new Set<string>();
  const relatedStocks = [];

  // From agendas' embedded stocks
  for (const agenda of relatedAgendas) {
    if (agenda.relatedStocks) {
      for (const rs of agenda.relatedStocks) {
        if (!relatedStockCodes.has(rs.stockCode)) {
          relatedStockCodes.add(rs.stockCode);
          // Find the full stock impact data
          const fullStock = stockImpacts.find(
            (s) => s.stockCode === rs.stockCode
          );
          relatedStocks.push(fullStock || rs);
        }
      }
    }
  }

  // Also check global stockImpacts for policies matching this minister's agendas
  for (const stock of stockImpacts) {
    if (
      !relatedStockCodes.has(stock.stockCode) &&
      relatedAgendas.some(
        (a) =>
          stock.relatedPolicy.includes(a.category) ||
          a.title.includes(stock.sector)
      )
    ) {
      relatedStockCodes.add(stock.stockCode);
      relatedStocks.push(stock);
    }
  }

  const trendIcon =
    minister.trend === "up" ? (
      <TrendingUp className="h-4 w-4 text-emerald-600" />
    ) : minister.trend === "down" ? (
      <TrendingDown className="h-4 w-4 text-red-500" />
    ) : (
      <Minus className="h-4 w-4 text-muted-foreground" />
    );

  const trendLabel =
    minister.trend === "up"
      ? "상승 추세"
      : minister.trend === "down"
      ? "하락 추세"
      : "유지";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[900px] px-6 py-8">
        {/* Back link */}
        <Link
          href="/ministers"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          장관 목록
        </Link>

        {/* Hero section */}
        <div className="mb-8 rounded-xl border border-border/60 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div
              className={cn(
                "flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold",
                getAvatarColor(minister.id)
              )}
            >
              {getInitials(minister.name)}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {minister.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {minister.position} &middot; {minister.ministry}
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {minister.recentActivity}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col items-center rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">총 발언</span>
              </div>
              <span className="text-xl font-bold font-data text-foreground">
                {minister.totalStatements}
              </span>
            </div>

            <div className="flex flex-col items-center rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">이행률</span>
              </div>
              <span
                className={cn(
                  "text-xl font-bold font-data",
                  minister.fulfillmentRate >= 70
                    ? "text-primary"
                    : minister.fulfillmentRate >= 50
                    ? "text-warning"
                    : "text-destructive"
                )}
              >
                {minister.fulfillmentRate}%
              </span>
            </div>

            <div className="flex flex-col items-center rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="text-[11px] font-medium">추적 안건</span>
              </div>
              <span className="text-xl font-bold font-data text-foreground">
                {minister.trackedAgendas}
              </span>
            </div>

            <div className="flex flex-col items-center rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
                {trendIcon}
                <span className="text-[11px] font-medium">추세</span>
              </div>
              <span
                className={cn(
                  "text-sm font-semibold",
                  minister.trend === "up"
                    ? "text-emerald-600"
                    : minister.trend === "down"
                    ? "text-red-500"
                    : "text-muted-foreground"
                )}
              >
                {trendLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs section */}
        <MinisterTabs
          relatedAgendas={relatedAgendas}
          fulfillmentRate={minister.fulfillmentRate}
          relatedStocks={relatedStocks}
        />
      </div>
    </div>
  );
}
