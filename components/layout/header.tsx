"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Bell, Search } from "lucide-react";

const pageNames: Record<string, string> = {
  "/": "대시보드",
  "/workspace": "안건 워크스페이스",
  "/investor": "INVESTOR 브리핑",
  "/timeline": "국무회의 타임라인",
};

export function Header() {
  const pathname = usePathname();
  const currentPage = pageNames[pathname] ?? "페이지";

  const isMinisterPage = pathname.startsWith("/ministers/");
  const breadcrumbSegments = isMinisterPage
    ? [
        { label: "대시보드", href: "/" },
        { label: "국무위원", href: "/" },
        { label: "상세", href: undefined },
      ]
    : [
        { label: "국무노션", href: "/" },
        { label: currentPage, href: undefined },
      ];

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      {/* Left: Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbSegments.map((segment, index) => {
            const isLast = index === breadcrumbSegments.length - 1;
            return (
              <Fragment key={segment.label}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={segment.href ?? "/"}>
                      {segment.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right: Search + Notification + Avatar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="검색... (⌘K)"
            className="h-8 w-56 pl-8 text-xs bg-muted/40 border-transparent focus-visible:border-ring focus-visible:bg-background"
            readOnly
          />
        </div>

        {/* Notification bell */}
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="알림"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            3
          </span>
        </button>

        {/* User avatar */}
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            시
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
