"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ministers } from "@/lib/mock-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  Kanban,
  TrendingUp,
  Clock,
  Vote,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

const navLinks = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/workspace", label: "안건 워크스페이스", icon: Kanban },
  { href: "/investor", label: "INVESTOR 브리핑", icon: TrendingUp },
  { href: "/timeline", label: "국무회의 타임라인", icon: Clock },
  { href: "/local-election", label: "지방선거 관제탑", icon: Vote },
];

const trendColors = {
  up: "bg-success",
  down: "bg-destructive",
  stable: "bg-muted-foreground",
};

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-[260px]"
      )}
    >
      {/* Logo area */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary">
          <span className="text-xs font-bold text-primary-foreground">G</span>
        </div>
        {!collapsed && (
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            국무노션
          </span>
        )}
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 pt-3">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
              title={collapsed ? link.label : undefined}
            >
              <link.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Minister section */}
      {!collapsed && (
        <>
          <div className="px-4 pt-6 pb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              국무위원
            </span>
          </div>

          <ScrollArea className="flex-1 px-2">
            <div className="flex flex-col gap-0.5 pb-2">
              {ministers.map((minister) => {
                const isActive = pathname === `/ministers/${minister.id}`;
                return (
                  <Link
                    key={minister.id}
                    href={`/ministers/${minister.id}`}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    )}
                  >
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/8 text-primary text-[10px] font-semibold">
                        {minister.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate leading-tight">
                        {minister.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate leading-tight">
                        {minister.ministry}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "ml-auto h-1.5 w-1.5 shrink-0 rounded-full",
                        trendColors[minister.trend]
                      )}
                      title={
                        minister.trend === "up"
                          ? "상승"
                          : minister.trend === "down"
                          ? "하락"
                          : "유지"
                      }
                    />
                  </Link>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Collapsed minister icons */}
      {collapsed && (
        <ScrollArea className="flex-1 px-2 pt-4">
          <div className="flex flex-col items-center gap-1.5">
            {ministers.slice(0, 6).map((minister) => (
              <Link
                key={minister.id}
                href={`/ministers/${minister.id}`}
                title={`${minister.name} - ${minister.ministry}`}
              >
                <Avatar size="sm">
                  <AvatarFallback className="bg-primary/8 text-primary text-[10px] font-semibold">
                    {minister.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </Link>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Collapse toggle */}
      <Separator />
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground hover:bg-sidebar-accent"
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        {collapsed ? (
          <ChevronsRight className="h-4 w-4" />
        ) : (
          <ChevronsLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
