"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Agenda, StockImpact } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  CheckCircle2,
  BarChart3,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

const STATUS_BADGE: Record<Agenda["status"], string> = {
  proposed: "bg-info/10 text-info",
  discussing: "bg-warning/10 text-warning",
  decided: "bg-primary/10 text-primary",
  implementing: "bg-chart-2/10 text-chart-2",
  completed: "bg-success/10 text-success",
};

const STATUS_COUNT_COLORS: Record<Agenda["status"], string> = {
  proposed: "border-info/30 text-info",
  discussing: "border-warning/30 text-warning",
  decided: "border-primary/30 text-primary",
  implementing: "border-chart-2/30 text-chart-2",
  completed: "border-success/30 text-success",
};

interface MinisterTabsProps {
  relatedAgendas: Agenda[];
  fulfillmentRate: number;
  relatedStocks: StockImpact[];
}

function StatusBreakdown({ agendas }: { agendas: Agenda[] }) {
  const counts: Record<Agenda["status"], number> = {
    proposed: 0,
    discussing: 0,
    decided: 0,
    implementing: 0,
    completed: 0,
  };
  for (const a of agendas) {
    counts[a.status]++;
  }

  return (
    <div className="grid grid-cols-5 gap-3">
      {(Object.entries(counts) as [Agenda["status"], number][]).map(
        ([status, count]) => (
          <div
            key={status}
            className={cn(
              "flex flex-col items-center rounded-lg border p-3",
              STATUS_COUNT_COLORS[status]
            )}
          >
            <span className="text-2xl font-bold font-data">{count}</span>
            <span className="mt-1 text-[11px] font-medium">
              {STATUS_LABELS[status]}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function MinisterTabs({
  relatedAgendas,
  fulfillmentRate,
  relatedStocks,
}: MinisterTabsProps) {
  return (
    <Tabs defaultValue="statements">
      <TabsList className="w-full">
        <TabsTrigger value="statements" className="flex-1 gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          발언 이력
        </TabsTrigger>
        <TabsTrigger value="fulfillment" className="flex-1 gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          이행 현황
        </TabsTrigger>
        <TabsTrigger value="stocks" className="flex-1 gap-1.5">
          <BarChart3 className="h-3.5 w-3.5" />
          종목 영향도
        </TabsTrigger>
      </TabsList>

      {/* Tab 1: Statements */}
      <TabsContent value="statements" className="mt-4">
        {relatedAgendas.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            관련 안건이 없습니다
          </div>
        ) : (
          <div className="space-y-2.5">
            {relatedAgendas.map((agenda) => (
              <div
                key={agenda.id}
                className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-[13px] font-semibold text-foreground leading-snug mb-1.5">
                    {agenda.title}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1 font-data">
                      <CalendarDays className="h-3 w-3" />
                      {agenda.date}
                    </span>
                    <span className="text-border">|</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium">
                      {agenda.category}
                    </span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 font-semibold",
                        STATUS_BADGE[agenda.status]
                      )}
                    >
                      {STATUS_LABELS[agenda.status]}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Tab 2: Fulfillment */}
      <TabsContent value="fulfillment" className="mt-4">
        <div className="grid gap-6">
          {/* Circular-style progress */}
          <Card>
            <CardContent className="flex flex-col items-center py-8">
              <div className="relative mb-4">
                <svg
                  width="160"
                  height="160"
                  viewBox="0 0 160 160"
                  className="-rotate-90"
                >
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    fill="none"
                    strokeWidth="10"
                    className="stroke-muted"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    className="stroke-primary"
                    strokeDasharray={`${(fulfillmentRate / 100) * 2 * Math.PI * 68} ${2 * Math.PI * 68}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold font-data text-foreground">
                    {fulfillmentRate}%
                  </span>
                  <span className="text-xs text-muted-foreground">이행률</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {fulfillmentRate >= 70
                  ? "양호한 이행률을 보이고 있습니다"
                  : fulfillmentRate >= 50
                  ? "보통 수준의 이행률입니다"
                  : "이행률 개선이 필요합니다"}
              </p>
            </CardContent>
          </Card>

          {/* Status breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">안건 상태별 분포</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusBreakdown agendas={relatedAgendas} />
            </CardContent>
          </Card>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="flex flex-col items-center py-4">
                <span className="text-2xl font-bold font-data text-foreground">
                  {relatedAgendas.length}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  총 관련 안건
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center py-4">
                <span className="text-2xl font-bold font-data text-primary">
                  {relatedAgendas.filter((a) => a.status === "completed").length}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  완료 안건
                </span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center py-4">
                <span className="text-2xl font-bold font-data text-warning">
                  {
                    relatedAgendas.filter(
                      (a) =>
                        a.status === "discussing" || a.status === "proposed"
                    ).length
                  }
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  진행 중
                </span>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>

      {/* Tab 3: Stocks */}
      <TabsContent value="stocks" className="mt-4">
        {relatedStocks.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            관련 종목 영향도 데이터가 없습니다
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {relatedStocks.map((stock) => (
              <Card key={stock.stockCode}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        {stock.stockName}
                      </h4>
                      <span className="text-[11px] font-data text-muted-foreground">
                        {stock.stockCode}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        stock.direction === "positive"
                          ? "bg-primary/10 text-primary"
                          : stock.direction === "negative"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {stock.direction === "positive" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : stock.direction === "negative" ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                      {stock.direction === "positive"
                        ? "상승"
                        : stock.direction === "negative"
                        ? "하락"
                        : "중립"}
                    </span>
                  </div>
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>영향도</span>
                      <span
                        className={cn(
                          "font-bold font-data",
                          stock.impactScore > 0
                            ? "text-primary"
                            : "text-destructive"
                        )}
                      >
                        {stock.impactScore > 0 ? "+" : ""}
                        {stock.impactScore}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          stock.impactScore > 0
                            ? "bg-primary"
                            : "bg-destructive"
                        )}
                        style={{
                          width: `${Math.abs(stock.impactScore)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {stock.relatedPolicy}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
