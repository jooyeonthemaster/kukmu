-- ============================================================
-- 국무노션 (GukmuNotion) - Supabase 초기 스키마
-- 국무회의 추적·분석 시빅 데이터 인텔리전스 플랫폼
-- ============================================================

-- Enable extensions
create extension if not exists "pg_trgm";   -- fuzzy text search
create extension if not exists "uuid-ossp"; -- UUID generation

-- ── 1. 국무위원 (Ministers) ──

create table ministers (
  id          text primary key,             -- e.g. 'gu-yuncheol'
  name        text not null,
  ministry    text not null,
  position    text not null,
  image_url   text,
  total_statements   int default 0,
  fulfillment_rate   int default 0,         -- 0~100
  recent_activity    text,
  trend       text check (trend in ('up', 'down', 'stable')) default 'stable',
  tracked_agendas    int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── 2. 안건 (Agendas) ──

create table agendas (
  id          text primary key,             -- e.g. 'ag-001'
  title       text not null,
  ministry    text not null,
  minister_name text not null,
  status      text check (status in ('proposed','discussing','decided','implementing','completed'))
              default 'proposed',
  date        date not null,
  category    text not null,
  priority    text check (priority in ('high','medium','low')) default 'medium',
  description text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index idx_agendas_status on agendas(status);
create index idx_agendas_category on agendas(category);
create index idx_agendas_ministry on agendas(ministry);
create index idx_agendas_date on agendas(date desc);

-- ── 3. 종목 영향도 (Stock Impacts) ──

create table stock_impacts (
  id              serial primary key,
  stock_code      text not null unique,     -- e.g. '005930'
  stock_name      text not null,
  impact_score    int not null,             -- -100 ~ +100
  direction       text check (direction in ('positive','negative','neutral')),
  sector          text not null,
  related_policy  text,
  price_change    numeric(6,2),             -- e.g. +3.45%
  volume          bigint,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_stock_impacts_sector on stock_impacts(sector);
create index idx_stock_impacts_direction on stock_impacts(direction);

-- ── 4. 안건-종목 연결 (Agenda ↔ Stock) ──

create table agenda_stocks (
  agenda_id   text references agendas(id) on delete cascade,
  stock_code  text references stock_impacts(stock_code) on delete cascade,
  primary key (agenda_id, stock_code)
);

-- ── 5. 국무회의 (Meetings) ──

create table meetings (
  id              text primary key,         -- e.g. 'm-2025-29'
  meeting_number  int not null unique,
  date            date not null,
  total_agendas   int default 0,
  key_highlights  text[] default '{}',
  attendees       text[] default '{}',
  created_at      timestamptz default now()
);

create index idx_meetings_date on meetings(date desc);

-- ── 6. 회의-안건 연결 (Meeting ↔ Agenda) ──

create table meeting_agendas (
  meeting_id  text references meetings(id) on delete cascade,
  agenda_id   text references agendas(id) on delete cascade,
  primary key (meeting_id, agenda_id)
);

-- ── 7. 핫 키워드 (Hot Topics) ──

create table hot_topics (
  id               text primary key,
  keyword          text not null,
  count            int default 0,
  trend            text check (trend in ('rising','falling','steady')) default 'steady',
  related_ministry text,
  category         text,
  updated_at       timestamptz default now()
);

-- ── 8. 뉴스 기사 (News Articles) - 크롤링 데이터 ──

create table news_articles (
  id            uuid default uuid_generate_v4() primary key,
  title         text not null,
  url           text not null unique,
  source        text not null,              -- e.g. '연합뉴스', '한겨레'
  published_at  timestamptz,
  crawled_at    timestamptz default now(),
  content       text,
  summary       text,                       -- AI 요약
  sentiment     text check (sentiment in ('positive','negative','neutral')),
  relevance_score numeric(4,2) default 0,   -- 0~1, 국무회의 관련도
  is_analyzed   boolean default false
);

create index idx_news_published on news_articles(published_at desc);
create index idx_news_source on news_articles(source);
create index idx_news_analyzed on news_articles(is_analyzed) where not is_analyzed;
create index idx_news_title_trgm on news_articles using gin (title gin_trgm_ops);

-- ── 9. 뉴스-안건 연결 (News ↔ Agenda) ──

create table news_agendas (
  news_id   uuid references news_articles(id) on delete cascade,
  agenda_id text references agendas(id) on delete cascade,
  primary key (news_id, agenda_id)
);

-- ── 10. 뉴스-장관 연결 (News ↔ Minister) ──

create table news_ministers (
  news_id     uuid references news_articles(id) on delete cascade,
  minister_id text references ministers(id) on delete cascade,
  primary key (news_id, minister_id)
);

-- ── 11. 장관 발언 (Statements) - 개별 발언 추적 ──

create table statements (
  id            uuid default uuid_generate_v4() primary key,
  minister_id   text references ministers(id) on delete cascade,
  meeting_id    text references meetings(id) on delete set null,
  content       text not null,
  date          date not null,
  category      text,
  is_commitment boolean default false,      -- 약속/공약 여부
  is_fulfilled  boolean,                    -- 이행 여부 (null=미확인)
  source_url    text,
  created_at    timestamptz default now()
);

create index idx_statements_minister on statements(minister_id, date desc);
create index idx_statements_commitment on statements(is_commitment) where is_commitment;

-- ── 12. 크롤링 작업 이력 (Crawl Jobs) ──

create table crawl_jobs (
  id          uuid default uuid_generate_v4() primary key,
  job_type    text not null,                -- 'mois_meeting', 'news', 'stock_price'
  status      text check (status in ('pending','running','completed','failed'))
              default 'pending',
  started_at  timestamptz,
  completed_at timestamptz,
  items_found int default 0,
  error_message text,
  metadata    jsonb default '{}'
);

create index idx_crawl_jobs_status on crawl_jobs(status);

-- ── 13. KPI 스냅샷 (대시보드 통계) ──

create table kpi_snapshots (
  id          serial primary key,
  label       text not null,
  value       text not null,
  change      numeric(6,2) default 0,
  change_label text,
  icon        text,
  snapshot_at timestamptz default now()
);

-- ── RLS (Row Level Security) 정책 ──
-- 공개 데이터이므로 읽기는 모두 허용, 쓰기는 서비스 키로만

alter table ministers enable row level security;
alter table agendas enable row level security;
alter table stock_impacts enable row level security;
alter table meetings enable row level security;
alter table news_articles enable row level security;
alter table statements enable row level security;
alter table hot_topics enable row level security;

-- 공개 읽기 정책
create policy "Public read ministers" on ministers for select using (true);
create policy "Public read agendas" on agendas for select using (true);
create policy "Public read stock_impacts" on stock_impacts for select using (true);
create policy "Public read meetings" on meetings for select using (true);
create policy "Public read news_articles" on news_articles for select using (true);
create policy "Public read statements" on statements for select using (true);
create policy "Public read hot_topics" on hot_topics for select using (true);

-- updated_at 자동 갱신 트리거
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tr_ministers_updated before update on ministers
  for each row execute function update_updated_at();
create trigger tr_agendas_updated before update on agendas
  for each row execute function update_updated_at();
create trigger tr_stock_impacts_updated before update on stock_impacts
  for each row execute function update_updated_at();

-- ── Views (자주 쓰는 조인 뷰) ──

create view v_meeting_details as
select
  m.id,
  m.meeting_number,
  m.date,
  m.total_agendas,
  m.key_highlights,
  m.attendees,
  coalesce(
    json_agg(
      json_build_object(
        'id', a.id,
        'title', a.title,
        'ministry', a.ministry,
        'status', a.status,
        'category', a.category,
        'priority', a.priority
      )
    ) filter (where a.id is not null),
    '[]'
  ) as agendas
from meetings m
left join meeting_agendas ma on m.id = ma.meeting_id
left join agendas a on ma.agenda_id = a.id
group by m.id;

create view v_minister_stats as
select
  min.id,
  min.name,
  min.ministry,
  min.position,
  min.fulfillment_rate,
  min.trend,
  count(distinct s.id) as statement_count,
  count(distinct s.id) filter (where s.is_commitment) as commitment_count,
  count(distinct s.id) filter (where s.is_fulfilled) as fulfilled_count,
  count(distinct a.id) as agenda_count
from ministers min
left join statements s on min.id = s.minister_id
left join agendas a on min.name = a.minister_name
group by min.id;
