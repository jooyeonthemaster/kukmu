"use client";

import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface MinistryChartProps {
  data: { ministry: string; rate: number }[];
}

const chartConfig = {
  rate: {
    label: "이행률",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

export function MinistryChart({ data }: MinistryChartProps) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          horizontal={false}
          strokeDasharray="3 3"
          className="stroke-border/40"
        />
        <YAxis
          dataKey="ministry"
          type="category"
          width={100}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
        />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => `${value}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => [`${value}%`, "이행률"]}
            />
          }
        />
        <Bar
          dataKey="rate"
          fill="var(--color-rate)"
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
      </BarChart>
    </ChartContainer>
  );
}
