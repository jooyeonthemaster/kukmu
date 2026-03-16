"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PARTIES, type Province } from "@/lib/election-types";

interface Props {
  province: Province;
}

export default function PollChart({ province }: Props) {
  const { polls, candidates } = province;
  if (polls.length === 0) return null;

  const sortedPolls = [...polls].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const chartData = sortedPolls.map(poll => {
    const row: Record<string, string | number> = { date: poll.date.slice(5) };
    poll.results.forEach(r => { row[r.candidateName] = r.percentage; });
    return row;
  });

  const candidateNames = candidates.map(c => c.name);

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(13,18,32,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#fff",
            }}
            formatter={(value: number) => [`${value}%`, undefined]}
            labelFormatter={(label: string) => `2026-${label}`}
          />
          {candidateNames.map(name => {
            const candidate = candidates.find(c => c.name === name);
            const party = candidate ? PARTIES[candidate.party] : null;
            return (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={party?.color || "#888"}
                strokeWidth={2}
                dot={{ r: 3, fill: party?.color || "#888" }}
                activeDot={{ r: 5 }}
              />
            );
          })}
          <Legend
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
