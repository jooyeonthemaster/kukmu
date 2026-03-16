import { meetings } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Clock, CalendarDays, Users, FileText } from "lucide-react";
import { TimelineAccordion } from "./timeline-accordion";

const sortedMeetings = [...meetings].sort(
  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
);

/** 연도별로 그룹핑 */
function groupByYear(
  items: typeof sortedMeetings
): { year: number; meetings: typeof sortedMeetings }[] {
  const map = new Map<number, typeof sortedMeetings>();
  for (const m of items) {
    const year = new Date(m.date).getFullYear();
    const arr = map.get(year) ?? [];
    arr.push(m);
    map.set(year, arr);
  }
  // 연도 내림차순
  return Array.from(map.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, mts]) => ({ year, meetings: mts }));
}

const yearGroups = groupByYear(sortedMeetings);

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}월 ${day}일`;
}

function getInitials(name: string): string {
  return name.slice(0, 1);
}

const ATTENDEE_COLORS = [
  "bg-primary/15 text-primary",
  "bg-info/15 text-info",
  "bg-warning/15 text-warning",
  "bg-success/15 text-success",
  "bg-chart-2/15 text-chart-2",
  "bg-destructive/10 text-destructive",
];

export default function TimelinePage() {
  let globalIndex = 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[900px] px-6 py-8">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-1.5">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              국무회의 타임라인
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            최근 국무회의 진행 경과를 시간순으로 확인합니다
          </p>
        </div>

        {/* Timeline by year */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-primary/20" />

          {yearGroups.map((group) => (
            <div key={group.year}>
              {/* Year divider */}
              <div className="relative flex items-center gap-4 mb-8 mt-2">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    {group.year}년
                  </h2>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground font-data">
                    {group.meetings.length}회
                  </span>
                </div>
                <div className="h-px flex-1 bg-border/60" />
              </div>

              {/* Meetings in this year */}
              <div className="space-y-8 mb-10">
                {group.meetings.map((meeting) => {
                  const idx = globalIndex++;
                  return (
                    <div key={meeting.id} className="relative flex gap-6">
                      {/* Timeline node */}
                      <div className="relative z-10 flex shrink-0 flex-col items-center">
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full border-2 font-data text-sm font-bold",
                            idx === 0
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-primary/30 bg-card text-primary"
                          )}
                        >
                          {meeting.meetingNumber}
                        </div>
                      </div>

                      {/* Content card */}
                      <div className="flex-1 pb-2">
                        <div
                          className={cn(
                            "rounded-xl border bg-card p-5",
                            idx === 0
                              ? "border-primary/20 shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
                              : "border-border/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                          )}
                        >
                          {/* Meeting header */}
                          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-foreground">
                                제{meeting.meetingNumber}회 국무회의
                              </h3>
                              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  <span className="font-data">
                                    {formatDate(meeting.date)}
                                  </span>
                                </span>
                              </div>
                            </div>
                            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                              <FileText className="h-3 w-3" />
                              <span className="font-data">
                                {meeting.totalAgendas}
                              </span>
                              건
                            </span>
                          </div>

                          {/* Highlights */}
                          <div className="mb-4">
                            <h4 className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              주요 내용
                            </h4>
                            <ul className="space-y-1.5">
                              {meeting.keyHighlights.map((highlight, hi) => (
                                <li
                                  key={hi}
                                  className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground"
                                >
                                  <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                                  {highlight}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Attendees */}
                          <div className="mb-4">
                            <h4 className="mb-2 flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                              <Users className="h-3 w-3" />
                              참석자
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {meeting.attendees.map((name, ai) => (
                                <span
                                  key={ai}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold",
                                    ATTENDEE_COLORS[ai % ATTENDEE_COLORS.length]
                                  )}
                                >
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[9px]">
                                    {getInitials(name)}
                                  </span>
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Expandable agenda list */}
                          <TimelineAccordion agendas={meeting.agendas} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
