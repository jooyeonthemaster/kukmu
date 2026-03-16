import { agendas } from "@/lib/mock-data";
import type { Agenda, AgendaStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  CalendarDays,
  CircleDot,
  Columns3,
  User,
} from "lucide-react";

const COLUMN_ORDER: AgendaStatus[] = [
  "proposed",
  "discussing",
  "decided",
  "implementing",
  "completed",
];

const COLUMN_BG: Record<AgendaStatus, string> = {
  proposed: "bg-info/[0.03]",
  discussing: "bg-warning/[0.03]",
  decided: "bg-primary/[0.03]",
  implementing: "bg-chart-2/[0.03]",
  completed: "bg-success/[0.03]",
};

const COLUMN_ACCENT: Record<AgendaStatus, string> = {
  proposed: "bg-info",
  discussing: "bg-warning",
  decided: "bg-primary",
  implementing: "bg-chart-2",
  completed: "bg-success",
};

const COLUMN_BADGE: Record<AgendaStatus, string> = {
  proposed: "bg-info/10 text-info",
  discussing: "bg-warning/10 text-warning",
  decided: "bg-primary/10 text-primary",
  implementing: "bg-chart-2/10 text-chart-2",
  completed: "bg-success/10 text-success",
};

const PRIORITY_DOT: Record<Agenda["priority"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const PRIORITY_LABEL: Record<Agenda["priority"], string> = {
  high: "긴급",
  medium: "보통",
  low: "일반",
};

function groupByStatus(items: Agenda[]): Record<AgendaStatus, Agenda[]> {
  const grouped: Record<AgendaStatus, Agenda[]> = {
    proposed: [],
    discussing: [],
    decided: [],
    implementing: [],
    completed: [],
  };
  for (const item of items) {
    grouped[item.status].push(item);
  }
  return grouped;
}

function KanbanCard({ agenda }: { agenda: Agenda }) {
  return (
    <div className="group rounded-lg border border-border/60 bg-card p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-border">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="text-[13px] font-semibold leading-snug text-foreground line-clamp-2">
          {agenda.title}
        </h4>
        <div className="flex shrink-0 items-center gap-1.5" title={PRIORITY_LABEL[agenda.priority]}>
          <span className={cn("block h-2 w-2 rounded-full", PRIORITY_DOT[agenda.priority])} />
        </div>
      </div>

      <span className="mb-2.5 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        {agenda.ministry}
      </span>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {agenda.ministerName}
        </span>
        <span className="flex items-center gap-1 font-data">
          <CalendarDays className="h-3 w-3" />
          {agenda.date.slice(5)}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  items,
}: {
  status: AgendaStatus;
  items: Agenda[];
}) {
  return (
    <div
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-xl border border-border/40",
        COLUMN_BG[status]
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className={cn("h-2 w-2 rounded-full", COLUMN_ACCENT[status])} />
        <h3 className="text-sm font-semibold text-foreground">
          {STATUS_LABELS[status]}
        </h3>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold font-data",
            COLUMN_BADGE[status]
          )}
        >
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-3">
        {items.map((agenda) => (
          <KanbanCard key={agenda.id} agenda={agenda} />
        ))}
        {items.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/40">
            <span className="text-xs text-muted-foreground/60">
              안건 없음
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const grouped = groupByStatus(agendas);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-1.5">
            <Columns3 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              안건 워크스페이스
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            국무회의 안건을 단계별로 추적하고 진행 상황을 한눈에 확인합니다
          </p>
        </div>

        {/* Status pipeline indicator */}
        <div className="mb-6 flex items-center gap-1 text-xs text-muted-foreground">
          {COLUMN_ORDER.map((status, i) => (
            <div key={status} className="flex items-center gap-1">
              <span
                className={cn(
                  "rounded-md px-2 py-1 font-medium",
                  COLUMN_BADGE[status]
                )}
              >
                {STATUS_LABELS[status]}
              </span>
              {i < COLUMN_ORDER.length - 1 && (
                <span className="text-border">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Kanban board */}
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4" style={{ minWidth: "1440px" }}>
            {COLUMN_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                items={grouped[status]}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
