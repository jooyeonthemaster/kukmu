"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useElection } from "@/lib/election-context";
import { cn } from "@/lib/utils";

const editions = [
  { href: "/", label: "국무위원", icon: "🏛" },
  { href: "/local-election", label: "지방선거", icon: "🗳" },
  { href: "#", label: "국회의원", icon: "⚖", disabled: true },
];

export default function ElectionHeader() {
  const pathname = usePathname();
  const { stats } = useElection();
  const [now, setNow] = useState<Date | null>(null);
  const [dDay, setDDay] = useState<number | null>(null);

  useEffect(() => {
    const calcDDay = () => {
      const election = new Date(2026, 5, 3);
      return Math.ceil((election.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    };
    setDDay(calcDDay());
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d: Date) =>
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

  return (
    <div className="flex h-12 md:h-14 shrink-0 items-center justify-between border-b border-white/5 bg-[#080c18] px-2 md:px-4">
      {/* Left: logo + edition tabs */}
      <div className="flex items-center gap-2 md:gap-4">
        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="flex h-6 w-6 md:h-7 md:w-7 items-center justify-center rounded bg-cyan-500/20">
            <span className="text-[10px] md:text-xs font-bold text-cyan-400">G</span>
          </div>
          <span className="hidden sm:inline text-sm font-bold text-white/90 tracking-tight">국무노션</span>
        </div>

        <div className="h-5 w-px bg-white/10" />

        <div className="flex items-center gap-0.5">
          {editions.map(ed => {
            const active = ed.href === pathname || (ed.href === "/local-election" && pathname.startsWith("/local-election"));
            return (
              <Link
                key={ed.label}
                href={ed.disabled ? "#" : ed.href}
                className={cn(
                  "flex items-center gap-1 md:gap-1.5 rounded-md px-1.5 md:px-2.5 py-1 text-[10px] md:text-xs font-medium transition",
                  active ? "bg-cyan-500/15 text-cyan-400" : "text-white/40 hover:text-white/60 hover:bg-white/5",
                  ed.disabled && "hidden sm:flex opacity-30 pointer-events-none"
                )}
              >
                <span>{ed.icon}</span>
                <span className="hidden md:inline">{ed.label}</span>
                {ed.disabled && <span className="ml-1 text-[9px] text-white/30">SOON</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Center: D-day */}
      <div className="flex items-center gap-2 md:gap-6 ml-auto md:ml-0 mr-2 md:mr-0">
        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="hidden lg:flex items-center gap-1.5 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[11px] font-semibold text-red-400">제9회 전국동시지방선거</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-data text-lg md:text-2xl font-black text-red-500 md:text-white tabular-nums">{dDay !== null ? `D-${dDay}` : "\u00A0"}</span>
            <span className="hidden md:inline text-[10px] text-white/30">2026.06.03</span>
          </div>
        </div>
      </div>

      {/* Right: stats + clock */}
      <div className="flex items-center gap-2 md:gap-4 hidden sm:flex">
        <div className="flex items-center gap-2 md:gap-3 text-[10px] md:text-[11px]">
          <div className="flex flex-col items-center">
            <span className="font-data text-xs md:text-sm font-bold text-white/90">{stats.totalProvinces}</span>
            <span className="text-[8px] md:text-[10px] text-white/30">시/도</span>
          </div>
          <div className="h-3 md:h-4 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="font-data text-xs md:text-sm font-bold text-white/90">{stats.totalCandidates}</span>
            <span className="text-[8px] md:text-[10px] text-white/30">후보</span>
          </div>
          <div className="hidden lg:block h-3 md:h-4 w-px bg-white/10" />
          <div className="hidden lg:flex flex-col items-center">
            <span className="font-data text-xs md:text-sm font-bold text-white/90">{stats.totalPolls}</span>
            <span className="text-[8px] md:text-[10px] text-white/30">여론조사</span>
          </div>
        </div>

        <div className="hidden md:block h-4 md:h-5 w-px bg-white/10" />
        <span className="hidden md:block font-data text-[10px] md:text-[11px] text-white/40 tabular-nums">{now ? formatTime(now) : "\u00A0"}</span>
      </div>
    </div>
  );
}
