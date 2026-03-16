"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  FileText,
  TrendingUp,
  MessageSquare,
  Users,
};

interface StatsCardProps {
  label: string;
  value: string | number;
  change: number;
  changeLabel: string;
  icon: string;
}

export function StatsCard({
  label,
  value,
  change,
  changeLabel,
  icon,
}: StatsCardProps) {
  const IconComponent = iconMap[icon] ?? FileText;
  const isPositive = change > 0;
  const isNegative = change < 0;
  const isNeutral = change === 0;

  return (
    <Card className="border-l-[3px] border-l-primary border-t-0 border-r-0 border-b-0 ring-1 ring-border/60 shadow-none hover:ring-primary/30 transition-all duration-200">
      <CardContent className="pt-1 pb-1">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground tracking-wide">
              {label}
            </span>
            <span className="font-data text-2xl font-bold tracking-tight text-foreground">
              {value}
            </span>
            <div className="flex items-center gap-1">
              {isPositive && (
                <ArrowUpRight className="h-3 w-3 text-success" />
              )}
              {isNegative && (
                <ArrowDownRight className="h-3 w-3 text-destructive" />
              )}
              {isNeutral && (
                <Minus className="h-3 w-3 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "font-data text-xs font-medium",
                  isPositive && "text-success",
                  isNegative && "text-destructive",
                  isNeutral && "text-muted-foreground"
                )}
              >
                {isPositive && "+"}
                {change !== 0 ? change : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {changeLabel}
              </span>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8">
            <IconComponent className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
