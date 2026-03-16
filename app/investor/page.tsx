import { stockImpacts } from "@/lib/mock-data";
import type { StockImpact } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  PieChart,
  Hash,
} from "lucide-react";

/* ---- Derived data ---- */

const sortedStocks = [...stockImpacts].sort(
  (a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore)
);

const totalStocks = stockImpacts.length;
const avgImpact = (
  stockImpacts.reduce((s, i) => s + Math.abs(i.impactScore), 0) /
  totalStocks
).toFixed(1);
const positiveRatio = (
  (stockImpacts.filter((s) => s.direction === "positive").length /
    totalStocks) *
  100
).toFixed(0);

/* ---- Sector grouping ---- */

interface SectorGroup {
  sector: string;
  avgImpact: number;
  count: number;
  topStock: StockImpact;
}

function groupBySector(items: StockImpact[]): SectorGroup[] {
  const map = new Map<string, StockImpact[]>();
  for (const item of items) {
    const arr = map.get(item.sector) || [];
    arr.push(item);
    map.set(item.sector, arr);
  }
  const groups: SectorGroup[] = [];
  for (const [sector, stocks] of map) {
    const avg =
      stocks.reduce((s, i) => s + Math.abs(i.impactScore), 0) / stocks.length;
    const top = stocks.reduce((best, cur) =>
      Math.abs(cur.impactScore) > Math.abs(best.impactScore) ? cur : best
    );
    groups.push({ sector, avgImpact: avg, count: stocks.length, topStock: top });
  }
  return groups.sort((a, b) => b.avgImpact - a.avgImpact);
}

const sectorGroups = groupBySector(stockImpacts);

/* ---- Helpers ---- */

const DIRECTION_LABEL: Record<StockImpact["direction"], string> = {
  positive: "상승",
  negative: "하락",
  neutral: "중립",
};

const DIRECTION_STYLE: Record<StockImpact["direction"], string> = {
  positive: "bg-primary/10 text-primary",
  negative: "bg-destructive/10 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

function DirectionIcon({
  direction,
}: {
  direction: StockImpact["direction"];
}) {
  if (direction === "positive") return <TrendingUp className="h-3 w-3" />;
  if (direction === "negative") return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

/* ---- Page ---- */

export default function InvestorPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-1.5">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              INVESTOR 브리핑
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            정책 발언 → 종목 영향도 분석
          </p>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Hash className="h-4 w-4" />
                분석 종목 수
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold font-data text-foreground">
                {totalStocks}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                정책 영향 추적 종목
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Activity className="h-4 w-4" />
                평균 영향도 스코어
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold font-data text-foreground">
                {avgImpact}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                절대값 기준 평균
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                상승 종목 비율
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold font-data text-primary">
                {positiveRatio}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                긍정 방향성 종목 비율
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Impact table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">종목별 정책 영향도</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="pl-4">종목코드</TableHead>
                  <TableHead>종목명</TableHead>
                  <TableHead>섹터</TableHead>
                  <TableHead>관련 정책</TableHead>
                  <TableHead className="text-center">영향도</TableHead>
                  <TableHead className="text-center">방향성</TableHead>
                  <TableHead className="text-right pr-4">등락률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStocks.map((stock) => (
                  <TableRow key={stock.stockCode}>
                    <TableCell className="pl-4 font-data text-muted-foreground">
                      {stock.stockCode}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {stock.stockName}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {stock.sector}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {stock.relatedPolicy}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              stock.impactScore > 0
                                ? "bg-primary"
                                : "bg-destructive"
                            )}
                            style={{
                              width: `${Math.abs(stock.impactScore)}%`,
                            }}
                          />
                        </div>
                        <span
                          className={cn(
                            "w-8 text-right text-xs font-semibold font-data",
                            stock.impactScore > 0
                              ? "text-primary"
                              : "text-destructive"
                          )}
                        >
                          {stock.impactScore > 0 ? "+" : ""}
                          {stock.impactScore}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          DIRECTION_STYLE[stock.direction]
                        )}
                      >
                        <DirectionIcon direction={stock.direction} />
                        {DIRECTION_LABEL[stock.direction]}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-4 text-right font-semibold font-data",
                        stock.priceChange && stock.priceChange > 0
                          ? "text-emerald-600"
                          : stock.priceChange && stock.priceChange < 0
                          ? "text-red-500"
                          : "text-muted-foreground"
                      )}
                    >
                      {stock.priceChange
                        ? `${stock.priceChange > 0 ? "+" : ""}${stock.priceChange}%`
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sector grid */}
        <div className="mb-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground mb-4">
            <PieChart className="h-4 w-4 text-primary" />
            섹터별 분석
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sectorGroups.map((group) => (
            <Card key={group.sector}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  {group.sector}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">
                      평균 영향도
                    </p>
                    <p className="text-lg font-bold font-data text-primary">
                      {group.avgImpact.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">
                      분석 종목
                    </p>
                    <p className="text-lg font-bold font-data text-foreground">
                      {group.count}개
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5">
                    TOP 종목
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      {group.topStock.stockName}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold font-data",
                        group.topStock.impactScore > 0
                          ? "text-primary"
                          : "text-destructive"
                      )}
                    >
                      {group.topStock.impactScore > 0 ? "+" : ""}
                      {group.topStock.impactScore}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
