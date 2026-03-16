"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { Agenda } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

const STATUS_DOT: Record<Agenda["status"], string> = {
  proposed: "bg-info",
  discussing: "bg-warning",
  decided: "bg-primary",
  implementing: "bg-chart-2",
  completed: "bg-success",
};

export function TimelineAccordion({ agendas }: { agendas: Agenda[] }) {
  return (
    <Accordion>
      <AccordionItem value="agendas">
        <AccordionTrigger className="text-xs font-semibold text-muted-foreground hover:no-underline">
          상정 안건 ({agendas.length}건)
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-2">
            {agendas.map((agenda) => (
              <li
                key={agenda.id}
                className="flex items-start gap-2 rounded-lg border border-border/40 bg-card px-3 py-2.5"
              >
                <span
                  className={cn(
                    "mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full",
                    STATUS_DOT[agenda.status]
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground leading-snug">
                    {agenda.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{agenda.ministry}</span>
                    <span className="text-border">|</span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                        agenda.status === "completed"
                          ? "bg-success/10 text-success"
                          : agenda.status === "implementing"
                          ? "bg-chart-2/10 text-chart-2"
                          : agenda.status === "decided"
                          ? "bg-primary/10 text-primary"
                          : agenda.status === "discussing"
                          ? "bg-warning/10 text-warning"
                          : "bg-info/10 text-info"
                      )}
                    >
                      {STATUS_LABELS[agenda.status]}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
