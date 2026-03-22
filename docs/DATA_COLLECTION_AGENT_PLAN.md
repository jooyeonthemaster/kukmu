# 국무노션 — 실시간 데이터 수집 에이전트 시스템 기획서

> **Version**: 1.0
> **Date**: 2026-03-16
> **Project**: kukmu (국무노션)
> **Author**: AI Architect
> **Status**: Draft

---

## 목차

1. [프로젝트 개요 및 현황 분석](#1-프로젝트-개요-및-현황-분석)
2. [데이터 소스 상세 명세](#2-데이터-소스-상세-명세)
3. [시스템 아키텍처 설계](#3-시스템-아키텍처-설계)
4. [데이터베이스 스키마 설계](#4-데이터베이스-스키마-설계)
5. [에이전트 워크플로우 상세 설계](#5-에이전트-워크플로우-상세-설계)
6. [AI 분석 파이프라인 설계](#6-ai-분석-파이프라인-설계)
7. [프론트엔드 연동 설계](#7-프론트엔드-연동-설계)
8. [구현 로드맵](#8-구현-로드맵)
9. [비용 분석](#9-비용-분석)
10. [리스크 및 대응 전략](#10-리스크-및-대응-전략)

---

## 1. 프로젝트 개요 및 현황 분석

### 1.1 프로젝트 목표

국무노션은 **국무회의 안건 추적 + 제9회 전국동시지방선거(2026.06.03) 관제탑**을 핵심으로 하는 시민 참여 플랫폼이다. 현재 프론트엔드 UI는 완성도 높게 구현되어 있으나, **모든 데이터가 하드코딩된 mock 데이터**에 의존하고 있어 실시간 데이터 수집 에이전트 시스템이 시급하다.

### 1.2 현재 구현 현황

#### ✅ 완성된 것 (프론트엔드)

| 페이지 | 핵심 기능 | 데이터 소스 |
|--------|----------|------------|
| `/` 대시보드 | KPI 4개, 안건 피드, 장관 그리드, 부처 이행률, 핫키워드 | `mock-data.ts` |
| `/local-election` 관제탑 | Leaflet 지도, 17시도+226기초단체, 여론조사, 후보자 | `election-data.ts`, `district-data.ts` |
| `/workspace` 워크스페이스 | 5단계 칸반보드 | `mock-data.ts` |
| `/investor` 브리핑 | 정책-주가 영향도, 섹터 분석 | `mock-data.ts` |
| `/timeline` 타임라인 | 국무회의 아코디언 | `data/*.json` |

#### ❌ 구현되지 않은 것 (백엔드/데이터)

| 영역 | 현황 | 필요 작업 |
|------|------|----------|
| **실시간 데이터 수집** | 전무 | 7개 데이터 소스 연동 에이전트 구축 |
| **뉴스 크롤링 에이전트** | `news-crawler.ts` 껍데기만 존재 | Crawlee + 다중 소스 크롤링 구현 |
| **AI 분석 파이프라인** | 미구현 | Claude API + KPF-BERT 2단계 분석 |
| **Supabase DB** | 클라이언트 설정만 | 전체 스키마 설계 + 마이그레이션 |
| **API Routes** | 전무 | 수집/분석/조회 API 구축 |
| **스케줄러** | `workflows.ts` 정의만 | Trigger.dev 크론잡 구현 |
| **여론조사 자동 수집** | 전무 | nesdc.go.kr 스크래핑 시스템 |
| **선관위 API 연동** | 전무 | data.go.kr 후보자/투개표 API |

### 1.3 기존 워크플로우 정의 (`lib/agents/workflows.ts`)

현재 코드에 4개 워크플로우가 **정의만** 되어있다:

| 워크플로우 | 스케줄 | 목적 |
|-----------|--------|------|
| `MEETING_CRAWLER` | 매주 수요일 09:00 | 국무회의 안건 수집 |
| `NEWS_CRAWLER` | 매 4시간 | 뉴스 크롤링 + AI 분석 |
| `FULFILLMENT_TRACKER` | 매주 월요일 06:00 | 정책 이행률 추적 |
| `STOCK_IMPACT` | 매주 금요일 15:30 | 주가 영향도 업데이트 |

**이 기획서는 이 4개 워크플로우를 실제로 구현하고, 선거 데이터 수집 워크플로우를 추가하는 것을 목표로 한다.**

### 1.4 기존 타입 시스템

현재 정의된 핵심 타입 (변경 없이 확장):

```typescript
// lib/types.ts — 정부/정책 도메인
interface Agenda { id, title, ministry, ministerName, status, date, category, priority, description, relatedStocks[] }
interface Minister { id, name, ministry, position, fulfillmentRate, trackedAgendas, trend }
interface StockImpact { stockCode, stockName, impactScore, direction, sector, relatedPolicy, priceChange }
interface HotTopic { id, keyword, count, trend, relatedMinistry, category }

// lib/election-types.ts — 선거 도메인
interface Province { code, name, population, voterCount, leadingParty, candidates[], polls[], history[], issues[] }
interface District { code, provinceCode, name, population, leadingParty, candidates[], pollPct[], issues[] }
interface Candidate { id, name, party, age, incumbent, career[], pledges[] }
interface Poll { date, source, sampleSize, marginOfError, results[] }
```

---

## 2. 데이터 소스 상세 명세

### 2.1 데이터 소스 전체 맵

```
┌─────────────────────────────────────────────────────────────┐
│                    데이터 수집 레이어                         │
├──────────────┬──────────────┬───────────────┬───────────────┤
│   Tier 1     │   Tier 2     │    Tier 3     │   Tier 4      │
│  (핵심 API)  │ (보완 크롤링) │ (여론 감지)    │ (부가 정보)    │
├──────────────┼──────────────┼───────────────┼───────────────┤
│ 빅카인즈 API │ 언론사 RSS   │ 네이버 블로그  │ 정책브리핑     │
│ 네이버뉴스API│ 구글뉴스 RSS │ 네이버 카페    │ 열린국회 API   │
│ nesdc.go.kr  │              │ DC인사이드     │               │
│ 선관위 API   │              │ X(트위터)      │               │
└──────────────┴──────────────┴───────────────┴───────────────┘
```

### 2.2 Tier 1: 핵심 데이터 소스

#### A. 빅카인즈 (BigKinds) — 뉴스 빅데이터

| 항목 | 상세 |
|------|------|
| **운영 주체** | 한국언론진흥재단 |
| **URL** | https://bigkinds.or.kr |
| **커버리지** | **104개 언론사**, 1990년~현재, 748만 건+ |
| **비용** | 무료 (API 키 신청 필요) |
| **데이터 형태** | REST API (JSON) |
| **일일 다운로드** | 1,000건 (웹), API 제한은 별도 협의 |

**NLP API 엔드포인트 (빅카인즈랩)**:

| API | 엔드포인트 | 입력 | 출력 |
|-----|-----------|------|------|
| 뉴스 분류 | `POST api2.bigkindslab.or.kr:5002/get_cls` | `{ text }` | `{ big_cls, small_cls, region_cls }` |
| 개체명 인식 | `POST api2.bigkindslab.or.kr:5002/get_ner` | `{ text }` | `[{ word, label, desc }]` |
| 요약 | `POST api.bigkindslab.or.kr:5002/get_summary` | `{ sentences }` | `[summary1, summary2, summary3]` |
| 키워드 추출 | `POST api.bigkindslab.or.kr:5002/get_keyword` | `{ text }` | `[kw1, kw2, kw3, kw4, kw5]` |
| 형태소 분석 | `POST api.bigkindslab.or.kr:5002/get_tag` | `{ text }` | `[{ word, pos, desc }]` |

**활용 전략**:
- 검색 키워드: `지방선거`, `국무회의`, `후보`, `여론조사`, `정책`, 각 시도명
- 104개 언론사 = 중앙지 + 지역지 + 방송사 + 전문지 전부 커버
- NER로 후보자/정당/지역 자동 추출 → 우리 DB 엔티티와 매핑

#### B. 네이버 뉴스 검색 API — 실시간 뉴스

| 항목 | 상세 |
|------|------|
| **엔드포인트** | `GET https://openapi.naver.com/v1/search/news.json` |
| **인증** | `X-Naver-Client-Id` + `X-Naver-Client-Secret` |
| **일일 제한** | 25,000회/일 (회당 최대 100건 = 일 250만 건 메타데이터) |
| **페이지네이션** | `start` 최대 1,000 (쿼리당 최대 1,000건) |
| **비용** | 무료 |

**응답 구조**:
```json
{
  "items": [{
    "title": "<b>지방선거</b> 여론조사...",
    "originallink": "https://www.hani.co.kr/arti/...",
    "link": "https://n.news.naver.com/...",
    "description": "2026년 지방선거를 앞두고...",
    "pubDate": "Mon, 16 Mar 2026 09:30:00 +0900"
  }]
}
```

**제한사항 및 대응**:
- `description`은 요약만 제공 → `originallink`로 원문 크롤링 필요
- 검색어 다양화: `"지방선거"`, `"국무회의"`, `"여론조사" AND "{시도명}"`, 후보자 이름 등
- 동일 기사 중복 제거 로직 필요 (URL 기반 dedup)

**추가 활용 가능 API**:
- 블로그: `GET /v1/search/blog.json` (25,000회/일)
- 카페: `GET /v1/search/cafearticle.json` (25,000회/일)

#### C. 중앙선거여론조사심의위원회 (nesdc.go.kr) — 여론조사 통합

| 항목 | 상세 |
|------|------|
| **URL** | https://www.nesdc.go.kr |
| **데이터 규모** | 14,928건+ (2026.03 기준) |
| **법적 근거** | 공직선거법 — 모든 선거 여론조사 등록 의무 |
| **API** | 없음 (웹 스크래핑) |
| **비용** | 무료, 로그인 불필요 |

**스크래핑 전략**:

```
목록 페이지:
  https://www.nesdc.go.kr/portal/bbs/B0000005/list.do
    ?menuNo=200467
    &pageIndex={N}
    &pollGubuncd={선거구분코드}

상세 페이지:
  https://www.nesdc.go.kr/portal/bbs/B0000005/view.do
    ?nttId={ID}
    &menuNo=200467

주간 요약:
  https://www.nesdc.go.kr/portal/bbs/B0000025/list.do
    ?menuNo=200500
```

**상세 페이지 수집 가능 필드**:
- 등록번호, 선거구분, 지역, 선거명
- 조사기관명, 조사의뢰자
- 조사일시(시작~종료), 조사방법 (무선전화면접, ARS 등)
- 표본크기 (성별/연령대별/지역별)
- 접촉률, 응답률 (AAPOR 기준)
- 표본오차, 가중값 적용방법
- **후보별 지지율 결과**
- 전체 질문지 PDF, 결과분석 자료 PDF

**기술적 특성**:
- SSR (서버사이드 렌더링) → `fetch` + `cheerio`로 충분, Playwright 불필요
- `nttId` 순차적 → 마지막 수집 ID 기억하고 이후만 수집
- CSS 선택자: `.grid .row.tr .col a` (목록), `.grid .row` (상세 테이블)
- `pollGubuncd` 파라미터로 "제9회 전국동시지방선거"만 필터링 가능

#### D. 중앙선거관리위원회 API (data.go.kr) — 후보자/투개표

| API | 엔드포인트 | 용도 |
|-----|-----------|------|
| 후보자 정보 | `apis.data.go.kr/9760000/PofelcddInfoInqireService/` | 예비후보/후보자 목록 |
| 선거공약 정보 | `apis.data.go.kr/9760000/ElecPrmsInfoInqireService/` | 후보 공약 |
| 당선인 정보 | `apis.data.go.kr/9760000/WinnerInfoInqireService2/` | 당선 결과 |
| 투개표 정보 | `apis.data.go.kr/9760000/` | 실시간 개표 |
| 코드 정보 | `apis.data.go.kr/9760000/CommonCodeService/` | 선거ID, 선거구코드 |

**인증**: data.go.kr 회원가입 → API 활용신청 → 키 발급
**일일 제한**: 10,000건 (증량 신청 가능)
**응답 형태**: XML (일부 JSON 지원)
**비용**: 무료

### 2.3 Tier 2: 보완 크롤링 소스

#### 언론사 RSS 피드 (직접 확인된 것들)

| 언론사 | RSS URL | 카테고리 |
|--------|---------|---------|
| 조선일보 | `chosun.com/site/data/rss/politics.xml` | 정치 |
| 중앙일보 | `rss.joins.com/joins_politics_list.xml` | 정치 |
| 동아일보 | `rss.donga.com/politics.xml` | 정치 |
| 한겨레 | `hani.co.kr/rss/` | 전체 |
| 경향신문 | `khan.co.kr/rss/rssdata/total_news.xml` | 전체 |
| 연합뉴스 | `yna.co.kr/rss/politics.xml` | 정치 |
| SBS | `api.sbs.co.kr/xml/news/rss.jsp?pmDiv=politics` | 정치 |
| MBC | `imnews.imbc.com/rss/politics.xml` | 정치 |
| KBS | `news.kbs.co.kr/local/rss/rss.html` | 전체 |
| 오마이뉴스 | `rss.ohmynews.com/rss/ohmynews.xml` | 전체 |
| 프레시안 | `pressian.com/rss/rss.xml` | 전체 |

**구글 뉴스 RSS**:
```
https://news.google.com/rss/search?q={검색어}&hl=ko&gl=KR&ceid=KR:ko
```

#### 정책브리핑 RSS
```
https://www.korea.kr/etc/rss.do
```
→ 국무회의 안건/결과가 직접 게시됨

### 2.4 Tier 3: 여론 감지 소스

| 소스 | 방식 | 제한 | 용도 |
|------|------|------|------|
| 네이버 블로그 API | REST (25,000/일) | 요약만, 원문 별도 | 일반 여론 |
| 네이버 카페 API | REST (25,000/일) | 비공개 불가 | 커뮤니티 여론 |
| DC인사이드 | `dc-crawler` (Python) | 봇 차단 가능 | 온라인 여론 |
| X (트위터) | `twscrape` (비공식) | 불안정 | SNS 여론 |

### 2.5 데이터 소스별 수집 주기

```
┌────────────────────────────────────────────────────┐
│              수집 주기 타임라인 (하루)                │
├─────────┬──────────────────────────────────────────┤
│ 매 30분 │ nesdc.go.kr 신규 여론조사 체크             │
│ 매 1시간 │ 네이버 뉴스 API (키워드 검색)              │
│ 매 2시간 │ RSS 피드 전체 (20개+)                     │
│ 매 4시간 │ 빅카인즈 API (대규모 뉴스 배치)            │
│ 매 4시간 │ 커뮤니티/SNS 여론 수집                    │
│ 매 6시간 │ 선관위 API (후보자/공약 변경)              │
│ 매일 06:00 │ 일일 종합 분석 리포트 생성              │
│ 매주 수 09:00 │ 국무회의 안건 수집                  │
│ 매주 월 06:00 │ 정책 이행률 추적                    │
│ 매주 금 15:30 │ 주가 영향도 업데이트                 │
│ 선거 당일 │ 실시간 개표 데이터 (매 10초)              │
└─────────┴──────────────────────────────────────────┘
```

---

## 3. 시스템 아키텍처 설계

### 3.1 전체 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│                        TRIGGER.DEV                               │
│                   (에이전트 오케스트레이터)                         │
│                                                                  │
│  ┌─ 크론 스케줄러 ──────────────────────────────────────────┐    │
│  │                                                          │    │
│  │  ┌────────────────── Fan-Out (병렬) ──────────────────┐  │    │
│  │  │                                                    │  │    │
│  │  │  Worker A        Worker B        Worker C          │  │    │
│  │  │  빅카인즈 API    네이버뉴스 API   nesdc 스크래핑     │  │    │
│  │  │       │               │               │            │  │    │
│  │  │  Worker D        Worker E        Worker F          │  │    │
│  │  │  선관위 API      RSS 20개+       커뮤니티/SNS       │  │    │
│  │  │       │               │               │            │  │    │
│  │  └───────┼───────────────┼───────────────┼────────────┘  │    │
│  │          └───────────────┼───────────────┘               │    │
│  │                          ▼                               │    │
│  │              ┌── Raw Data Buffer ──┐                     │    │
│  │              │  (Supabase staging) │                     │    │
│  │              └─────────┬──────────┘                     │    │
│  │                        ▼                                 │    │
│  │  ┌────────── AI 분석 파이프라인 ──────────────────────┐  │    │
│  │  │                                                    │  │    │
│  │  │  [1차] KPF-BERT / 빅카인즈 NLP API                │  │    │
│  │  │    → 뉴스 분류, NER, 키워드 추출                    │  │    │
│  │  │    → 관련성 스코어링 (0~1)                          │  │    │
│  │  │    → 관련성 < 0.3 → 버림                           │  │    │
│  │  │                                                    │  │    │
│  │  │  [2차] Claude API (관련성 ≥ 0.3인 것만)             │  │    │
│  │  │    → 유의미성 최종 판단                             │  │    │
│  │  │    → 감성분석 (후보별 긍/부정)                       │  │    │
│  │  │    → 구조화: 비정형 텍스트 → 우리 스키마 JSON        │  │    │
│  │  │    → 트렌드 변화 감지                               │  │    │
│  │  │    → 지역이슈 ↔ 후보 연관관계                       │  │    │
│  │  │    → 국무회의 안건 ↔ 선거 이슈 매핑                  │  │    │
│  │  │                                                    │  │    │
│  │  └────────────────────┬───────────────────────────────┘  │    │
│  │                       ▼                                  │    │
│  │            ┌── Store Task ──┐                            │    │
│  │            │ Supabase 저장  │                            │    │
│  │            └───────┬────────┘                            │    │
│  └────────────────────┼─────────────────────────────────────┘    │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SUPABASE                                    │
│  ┌─────────────┬──────────────┬──────────────┬───────────────┐  │
│  │ raw_articles│ analyzed_news│ polls        │ candidates    │  │
│  │ raw_polls   │ poll_trends  │ issues       │ agendas       │  │
│  │ raw_sns     │ sentiments   │ hot_topics   │ ministers     │  │
│  └──────┬──────┴──────┬───────┴──────┬───────┴───────┬───────┘  │
│         │  Realtime   │              │               │          │
│         │  Channel    │              │               │          │
└─────────┼─────────────┼──────────────┼───────────────┼──────────┘
          │             │              │               │
          ▼             ▼              ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   NEXT.JS 프론트엔드                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 대시보드  │  │ 지방선거 관제탑│  │ 워크스페이스│  │ 투자자 브리핑│  │
│  │ /        │  │ /local-election│ │ /workspace│  │ /investor  │  │
│  └──────────┘  └──────────────┘  └──────────┘  └────────────┘  │
│                                                                  │
│  Supabase Realtime 구독 → 자동 UI 업데이트                        │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|----------|
| **오케스트레이션** | Trigger.dev v3 | TypeScript 네이티브, Next.js 통합, 크론+병렬 fan-out, 재시도/큐/옵저버빌리티 내장 |
| **웹 크롤링** | Crawlee (CheerioCrawler) | TypeScript 네이티브, 프로덕션 급, 동시성 제어, 요청 큐 관리 |
| **JS 렌더링 크롤링** | Crawlee (PlaywrightCrawler) | JS 렌더링 필요한 사이트 대응 |
| **1차 NLP 분석** | 빅카인즈랩 API / KPF-BERT | 한국어 뉴스 특화, 무료, 토큰 비용 절약 |
| **2차 AI 분석** | Claude API (claude-sonnet-4-6) | 고수준 판단, 구조화, 감성분석 |
| **데이터베이스** | Supabase (PostgreSQL) | 이미 설정됨, Realtime, RLS, Edge Functions |
| **실시간 전송** | Supabase Realtime | 프론트엔드 자동 업데이트, 웹소켓 |
| **프론트엔드** | Next.js 16 + React 19 (기존) | 변경 없음 |
| **XML 파싱** | fast-xml-parser | 선관위 API XML 응답 처리 |

### 3.3 디렉토리 구조 (추가되는 부분)

```
kukmu/
├── trigger/                          # Trigger.dev 태스크 정의
│   ├── trigger.config.ts
│   ├── orchestrators/
│   │   ├── news-pipeline.ts          # 뉴스 수집→분석→저장 오케스트레이터
│   │   ├── poll-pipeline.ts          # 여론조사 수집 오케스트레이터
│   │   ├── election-pipeline.ts      # 선거 데이터 수집 오케스트레이터
│   │   ├── cabinet-pipeline.ts       # 국무회의 수집 오케스트레이터
│   │   └── daily-report.ts           # 일일 종합 리포트 생성
│   ├── crawlers/
│   │   ├── bigkinds-crawler.ts       # 빅카인즈 API 호출
│   │   ├── naver-news-crawler.ts     # 네이버 뉴스 API + 원문 크롤링
│   │   ├── nesdc-scraper.ts          # 여론조사심의위 스크래핑
│   │   ├── nec-api-crawler.ts        # 선관위 API 호출
│   │   ├── rss-crawler.ts            # RSS 피드 20개+ 수집
│   │   ├── community-crawler.ts      # DC인사이드, 네이버카페 등
│   │   └── policy-briefing-crawler.ts # 정책브리핑 RSS
│   ├── analyzers/
│   │   ├── bigkinds-nlp.ts           # 빅카인즈 NLP API (분류/NER/키워드)
│   │   ├── claude-analyzer.ts        # Claude API 심층 분석
│   │   ├── relevance-scorer.ts       # 관련성 스코어링
│   │   ├── sentiment-analyzer.ts     # 감성분석 (후보별)
│   │   ├── trend-detector.ts         # 트렌드 변화 감지
│   │   └── entity-mapper.ts          # 엔티티 → DB 매핑
│   └── stores/
│       ├── article-store.ts          # 뉴스 기사 저장
│       ├── poll-store.ts             # 여론조사 저장
│       ├── candidate-store.ts        # 후보자 정보 저장
│       └── issue-store.ts            # 지역 이슈 저장
├── app/api/                          # Next.js API Routes
│   ├── news/route.ts                 # 뉴스 조회 API
│   ├── polls/route.ts                # 여론조사 조회 API
│   ├── candidates/route.ts           # 후보자 조회 API
│   ├── trigger/route.ts              # Trigger.dev 수동 실행
│   └── webhook/route.ts              # 외부 웹훅 수신
├── supabase/
│   └── migrations/
│       ├── 001_raw_tables.sql        # 원본 데이터 테이블
│       ├── 002_analyzed_tables.sql   # 분석 결과 테이블
│       ├── 003_election_tables.sql   # 선거 데이터 테이블
│       ├── 004_views.sql             # 집계 뷰
│       └── 005_rls_policies.sql      # Row Level Security
└── lib/
    ├── agents/                       # 기존 (리팩토링)
    │   ├── news-crawler.ts           → trigger/crawlers/로 이전
    │   └── workflows.ts              → trigger/orchestrators/로 이전
    └── db/
        ├── database.types.ts         # Supabase 자동 생성 타입
        ├── queries.ts                # 공통 쿼리 함수
        └── realtime.ts               # Realtime 구독 훅
```

---

## 4. 데이터베이스 스키마 설계

### 4.1 ERD 개요

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ raw_articles │────▶│analyzed_articles│────▶│article_entities│
└──────────────┘     └───────┬───────┘     └──────────────┘
                             │                      │
                             ▼                      ▼
                     ┌───────────────┐     ┌──────────────┐
                     │  sentiments   │     │  candidates  │
                     └───────────────┘     └──────┬───────┘
                                                  │
┌──────────────┐     ┌───────────────┐            │
│  raw_polls   │────▶│    polls      │────────────┤
└──────────────┘     └───────┬───────┘            │
                             │                    │
                             ▼                    ▼
                     ┌───────────────┐     ┌──────────────┐
                     │  poll_trends  │     │  provinces   │
                     └───────────────┘     └──────┬───────┘
                                                  │
                     ┌───────────────┐            │
                     │   issues      │────────────┘
                     └───────────────┘

┌──────────────┐     ┌───────────────┐
│   agendas    │────▶│agenda_tracking│
└──────┬───────┘     └───────────────┘
       │
       ▼
┌──────────────┐
│ stock_impacts│
└──────────────┘
```

### 4.2 테이블 상세 정의

#### 원본 데이터 (Raw) 테이블

```sql
-- 수집된 원본 뉴스 기사 (분석 전)
CREATE TABLE raw_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,          -- 'bigkinds', 'naver', 'rss', 'community'
  source_id       TEXT,                    -- 외부 시스템 ID (중복 방지)
  url             TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,                    -- 원문 전체 (nullable: 수집 실패 시)
  summary         TEXT,                    -- 네이버 API description 등
  author          TEXT,
  publisher       TEXT,                    -- 언론사명
  published_at    TIMESTAMPTZ,
  collected_at    TIMESTAMPTZ DEFAULT NOW(),
  is_analyzed     BOOLEAN DEFAULT FALSE,
  UNIQUE(source, source_id)
);

-- 수집된 원본 여론조사 데이터
CREATE TABLE raw_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nesdc_id        INTEGER UNIQUE,          -- nesdc.go.kr nttId
  election_type   TEXT,                    -- '제9회 전국동시지방선거'
  region          TEXT,                    -- '서울특별시', '부산광역시' 등
  pollster        TEXT NOT NULL,           -- 조사기관명
  commissioner    TEXT,                    -- 조사의뢰자
  survey_start    DATE,
  survey_end      DATE,
  method          TEXT,                    -- '무선전화면접', '무선ARS' 등
  sample_size     INTEGER,
  margin_of_error NUMERIC(3,1),
  response_rate   NUMERIC(5,2),
  raw_html        TEXT,                    -- 상세 페이지 원본 HTML
  raw_results     JSONB,                   -- 파싱된 후보별 결과 { "후보명": 43.5, ... }
  pdf_urls        TEXT[],                  -- 첨부 PDF URL
  collected_at    TIMESTAMPTZ DEFAULT NOW(),
  is_analyzed     BOOLEAN DEFAULT FALSE
);

-- 수집된 커뮤니티/SNS 데이터
CREATE TABLE raw_community_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,           -- 'dcinside', 'naver_cafe', 'x', 'naver_blog'
  source_id       TEXT,
  url             TEXT,
  title           TEXT,
  body            TEXT,
  author          TEXT,
  published_at    TIMESTAMPTZ,
  upvotes         INTEGER DEFAULT 0,
  comments_count  INTEGER DEFAULT 0,
  collected_at    TIMESTAMPTZ DEFAULT NOW(),
  is_analyzed     BOOLEAN DEFAULT FALSE,
  UNIQUE(source, source_id)
);
```

#### 분석 결과 테이블

```sql
-- AI 분석이 완료된 뉴스 기사
CREATE TABLE analyzed_articles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_article_id  UUID REFERENCES raw_articles(id) ON DELETE CASCADE,

  -- 빅카인즈 NLP 결과
  big_category    TEXT,                    -- 대분류 (정치, 경제, 사회...)
  small_category  TEXT,                    -- 소분류
  region_category TEXT,                    -- 지역 분류
  keywords        TEXT[],                  -- 추출된 키워드 5개
  entities        JSONB,                   -- NER 결과 [{ word, label, desc }]

  -- Claude AI 분석 결과
  relevance_score NUMERIC(3,2),            -- 0.00~1.00 (우리 프로젝트 관련성)
  is_significant  BOOLEAN DEFAULT FALSE,   -- 유의미 여부 (최종 판단)
  significance_reason TEXT,                -- 유의미 판단 근거

  sentiment       TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  sentiment_score NUMERIC(3,2),            -- -1.00~1.00

  ai_summary      TEXT,                    -- AI 생성 요약 (2-3문장)

  -- 매핑
  related_province_codes TEXT[],           -- 관련 시도 코드
  related_candidate_ids  UUID[],           -- 관련 후보자
  related_agenda_ids     UUID[],           -- 관련 국무회의 안건
  related_issue_ids      UUID[],           -- 관련 지역 이슈

  -- 트렌드
  trend_signal    TEXT CHECK (trend_signal IN ('rising', 'falling', 'stable', 'breaking')),
  trend_detail    TEXT,                    -- 트렌드 변화 설명

  analyzed_at     TIMESTAMPTZ DEFAULT NOW(),
  analyzer_model  TEXT DEFAULT 'claude-sonnet-4-6'
);

-- 후보별 감성분석 결과
CREATE TABLE candidate_sentiments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id      UUID REFERENCES analyzed_articles(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES candidates(id),
  sentiment       TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  sentiment_score NUMERIC(3,2),
  context         TEXT,                    -- 관련 문맥 발췌
  analyzed_at     TIMESTAMPTZ DEFAULT NOW()
);
```

#### 선거 데이터 테이블

```sql
-- 시도 (17개)
CREATE TABLE provinces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,    -- 'seoul', 'busan', ...
  name            TEXT NOT NULL,           -- '서울특별시'
  name_en         TEXT,
  population      INTEGER,
  voter_count     INTEGER,
  council_seats   INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 기초단체 (226개)
CREATE TABLE districts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  province_id     UUID REFERENCES provinces(id),
  name            TEXT NOT NULL,
  population      INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 후보자
CREATE TABLE candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     UUID REFERENCES provinces(id),
  district_id     UUID REFERENCES districts(id),           -- nullable (광역 후보)
  nec_id          TEXT,                    -- 선관위 후보자 번호
  name            TEXT NOT NULL,
  party           TEXT NOT NULL,           -- 'ppp', 'dp', 'rkp', ...
  age             INTEGER,
  is_incumbent    BOOLEAN DEFAULT FALSE,
  career          TEXT[],
  pledges         TEXT[],
  photo_url       TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(province_id, name, party)
);

-- 여론조사 결과 (분석 완료)
CREATE TABLE polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_poll_id     UUID REFERENCES raw_polls(id),
  province_id     UUID REFERENCES provinces(id),
  district_id     UUID REFERENCES districts(id),           -- nullable
  pollster        TEXT NOT NULL,
  commissioner    TEXT,
  survey_date     DATE NOT NULL,           -- 조사 종료일
  method          TEXT,
  sample_size     INTEGER,
  margin_of_error NUMERIC(3,1),
  response_rate   NUMERIC(5,2),
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 여론조사 후보별 결과
CREATE TABLE poll_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id         UUID REFERENCES polls(id) ON DELETE CASCADE,
  candidate_id    UUID REFERENCES candidates(id),
  percentage      NUMERIC(4,1) NOT NULL,   -- 43.5
  rank            INTEGER,
  UNIQUE(poll_id, candidate_id)
);

-- 여론조사 트렌드 (시계열 집계)
CREATE TABLE poll_trends (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     UUID REFERENCES provinces(id),
  candidate_id    UUID REFERENCES candidates(id),
  date            DATE NOT NULL,
  avg_percentage  NUMERIC(4,1),            -- 해당 날짜까지 최근 5개 조사 평균
  poll_count      INTEGER,                 -- 평균에 사용된 조사 수
  trend_direction TEXT CHECK (trend_direction IN ('up', 'down', 'stable')),
  change_amount   NUMERIC(4,1),            -- 전주 대비 변동폭
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(province_id, candidate_id, date)
);

-- 지역 이슈
CREATE TABLE issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id     UUID REFERENCES provinces(id),
  district_id     UUID REFERENCES districts(id),           -- nullable
  title           TEXT NOT NULL,
  description     TEXT,
  severity        TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category        TEXT,                    -- '경제', '교통', '환경', '복지', ...
  first_detected  TIMESTAMPTZ DEFAULT NOW(),
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  mention_count   INTEGER DEFAULT 1,       -- 언급 횟수
  related_articles UUID[],                 -- 관련 기사 ID
  is_active       BOOLEAN DEFAULT TRUE
);
```

#### 정부/정책 데이터 테이블

```sql
-- 국무회의 안건
CREATE TABLE agendas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  ministry        TEXT NOT NULL,
  minister_name   TEXT,
  status          TEXT CHECK (status IN ('proposed', 'discussing', 'decided', 'implementing', 'completed')),
  date            DATE,
  category        TEXT,
  priority        TEXT CHECK (priority IN ('urgent', 'normal', 'low')),
  description     TEXT,
  meeting_number  INTEGER,                 -- 국무회의 회차
  source_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 안건 이행 추적
CREATE TABLE agenda_tracking (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id       UUID REFERENCES agendas(id),
  status_before   TEXT,
  status_after    TEXT,
  tracked_at      TIMESTAMPTZ DEFAULT NOW(),
  source          TEXT,                    -- 변경 근거 (뉴스 URL 등)
  note            TEXT
);

-- 장관/국무위원
CREATE TABLE ministers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  ministry        TEXT NOT NULL,
  position        TEXT,
  photo_url       TEXT,
  fulfillment_rate NUMERIC(5,2) DEFAULT 0,
  tracked_agendas INTEGER DEFAULT 0,
  trend           TEXT CHECK (trend IN ('up', 'down', 'stable')),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 주가 영향도
CREATE TABLE stock_impacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_code      TEXT NOT NULL,
  stock_name      TEXT NOT NULL,
  sector          TEXT,
  related_agenda_id UUID REFERENCES agendas(id),
  related_policy  TEXT,
  impact_score    INTEGER CHECK (impact_score BETWEEN -100 AND 100),
  direction       TEXT CHECK (direction IN ('up', 'down', 'neutral')),
  price_change    NUMERIC(5,2),
  analyzed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 핫 토픽 (집계)
CREATE TABLE hot_topics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword         TEXT NOT NULL,
  count           INTEGER DEFAULT 1,
  trend           TEXT CHECK (trend IN ('up', 'down', 'stable', 'new')),
  related_ministry TEXT,
  category        TEXT,
  first_seen      TIMESTAMPTZ DEFAULT NOW(),
  last_seen       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword)
);
```

#### 뷰 및 인덱스

```sql
-- 시도별 최신 여론조사 요약 뷰
CREATE VIEW v_latest_polls AS
SELECT DISTINCT ON (p.province_id, pr.candidate_id)
  p.province_id,
  prov.name AS province_name,
  pr.candidate_id,
  c.name AS candidate_name,
  c.party,
  pr.percentage,
  p.pollster,
  p.survey_date,
  p.sample_size,
  p.margin_of_error
FROM polls p
JOIN poll_results pr ON p.id = pr.poll_id
JOIN candidates c ON pr.candidate_id = c.id
JOIN provinces prov ON p.province_id = prov.id
ORDER BY p.province_id, pr.candidate_id, p.survey_date DESC;

-- 후보별 감성 추이 뷰
CREATE VIEW v_candidate_sentiment_trend AS
SELECT
  cs.candidate_id,
  c.name AS candidate_name,
  c.party,
  DATE_TRUNC('day', cs.analyzed_at) AS date,
  AVG(cs.sentiment_score) AS avg_sentiment,
  COUNT(*) AS article_count
FROM candidate_sentiments cs
JOIN candidates c ON cs.candidate_id = c.id
GROUP BY cs.candidate_id, c.name, c.party, DATE_TRUNC('day', cs.analyzed_at)
ORDER BY date DESC;

-- 핵심 인덱스
CREATE INDEX idx_raw_articles_source ON raw_articles(source, source_id);
CREATE INDEX idx_raw_articles_collected ON raw_articles(collected_at DESC);
CREATE INDEX idx_raw_articles_unanalyzed ON raw_articles(is_analyzed) WHERE is_analyzed = FALSE;
CREATE INDEX idx_raw_polls_nesdc ON raw_polls(nesdc_id);
CREATE INDEX idx_analyzed_articles_relevance ON analyzed_articles(relevance_score DESC);
CREATE INDEX idx_analyzed_articles_significant ON analyzed_articles(is_significant) WHERE is_significant = TRUE;
CREATE INDEX idx_polls_province_date ON polls(province_id, survey_date DESC);
CREATE INDEX idx_poll_results_candidate ON poll_results(candidate_id);
CREATE INDEX idx_poll_trends_lookup ON poll_trends(province_id, candidate_id, date DESC);
CREATE INDEX idx_candidate_sentiments_candidate ON candidate_sentiments(candidate_id, analyzed_at DESC);
CREATE INDEX idx_issues_province ON issues(province_id) WHERE is_active = TRUE;
CREATE INDEX idx_agendas_status ON agendas(status);
CREATE INDEX idx_hot_topics_count ON hot_topics(count DESC);
```

---

## 5. 에이전트 워크플로우 상세 설계

### 5.1 Trigger.dev 설정

```typescript
// trigger.config.ts
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "kukmu-data-agents",
  runtime: "node",
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
    },
  },
  dirs: ["./trigger"],
});
```

### 5.2 뉴스 수집 파이프라인 (NEWS_PIPELINE)

```
스케줄: 매 4시간 (06:00, 10:00, 14:00, 18:00, 22:00)
예상 소요 시간: 5~15분
예상 수집량: 200~500건/회
예상 유의미 기사: 20~50건/회
```

```typescript
// trigger/orchestrators/news-pipeline.ts

import { schedules, task, queue } from "@trigger.dev/sdk";

const crawlQueue = queue({ name: "news-crawlers", concurrencyLimit: 10 });

// 1. 스케줄 정의
export const newsPipelineSchedule = schedules.task({
  id: "news-pipeline-schedule",
  cron: { pattern: "0 2,6,10,14,18 * * *", timezone: "Asia/Seoul" },
  run: async (payload) => {
    await newsPipelineOrchestrator.trigger({ triggeredAt: payload.timestamp });
  },
});

// 2. 오케스트레이터
export const newsPipelineOrchestrator = task({
  id: "news-pipeline-orchestrator",
  run: async (payload: { triggeredAt: Date }) => {

    // [Phase 1] Fan-out: 병렬 크롤링
    const crawlResults = await crawlAllSources.batchTriggerAndWait([
      { payload: { source: "bigkinds", keywords: ELECTION_KEYWORDS } },
      { payload: { source: "naver", keywords: ELECTION_KEYWORDS } },
      { payload: { source: "rss", feeds: RSS_FEEDS } },
      { payload: { source: "community", targets: COMMUNITY_TARGETS } },
    ]);

    const allArticles = crawlResults.runs
      .filter(r => r.ok)
      .flatMap(r => r.output.articles);

    // [Phase 2] 중복 제거
    const uniqueArticles = deduplicateByUrl(allArticles);

    // [Phase 3] Supabase raw_articles에 저장
    const stored = await storeRawArticles.triggerAndWait({
      articles: uniqueArticles,
    }).unwrap();

    // [Phase 4] Fan-out: 1차 NLP 분석 (빅카인즈 API)
    const nlpResults = await batchNlpAnalysis.triggerAndWait({
      articleIds: stored.newArticleIds,
    }).unwrap();

    // [Phase 5] 관련성 필터링 (score >= 0.3만 통과)
    const relevantIds = nlpResults.results
      .filter(r => r.relevanceScore >= 0.3)
      .map(r => r.articleId);

    // [Phase 6] Fan-out: 2차 Claude AI 심층 분석
    const aiResults = await batchClaudeAnalysis.batchTriggerAndWait(
      relevantIds.map(id => ({ payload: { articleId: id } }))
    );

    // [Phase 7] 분석 결과 저장 + 트렌드 업데이트
    await storeAnalysisResults.triggerAndWait({
      results: aiResults.runs.filter(r => r.ok).map(r => r.output),
    });

    // [Phase 8] 핫토픽 집계 업데이트
    await updateHotTopics.trigger({});

    return {
      totalCrawled: allArticles.length,
      unique: uniqueArticles.length,
      relevant: relevantIds.length,
      analyzed: aiResults.runs.filter(r => r.ok).length,
    };
  },
});

const ELECTION_KEYWORDS = [
  "지방선거", "6.3 선거", "광역단체장", "기초단체장",
  "국무회의", "국무위원", "정책 발표", "정부 정책",
  // + 17개 시도명, 주요 후보자 이름
];
```

### 5.3 여론조사 수집 파이프라인 (POLL_PIPELINE)

```
스케줄: 매 30분
예상 소요 시간: 1~3분
예상 수집량: 0~5건/회 (신규 등록 건만)
```

```typescript
// trigger/orchestrators/poll-pipeline.ts

export const pollPipelineSchedule = schedules.task({
  id: "poll-pipeline-schedule",
  cron: { pattern: "*/30 * * * *", timezone: "Asia/Seoul" },
  run: async () => {

    // [Phase 1] nesdc.go.kr 목록 페이지 스크래핑
    const latestPolls = await scrapeNesdcList.triggerAndWait({
      electionFilter: "제9회 전국동시지방선거",
    }).unwrap();

    // [Phase 2] DB에서 이미 수집된 nttId 조회
    const existingIds = await getExistingNesdcIds();
    const newPolls = latestPolls.filter(p => !existingIds.includes(p.nttId));

    if (newPolls.length === 0) return { newPolls: 0 };

    // [Phase 3] 신규 여론조사 상세 페이지 스크래핑 (병렬)
    const detailResults = await scrapeNesdcDetail.batchTriggerAndWait(
      newPolls.map(p => ({ payload: { nttId: p.nttId } }))
    );

    // [Phase 4] raw_polls에 저장
    const stored = await storeRawPolls.triggerAndWait({
      polls: detailResults.runs.filter(r => r.ok).map(r => r.output),
    }).unwrap();

    // [Phase 5] Claude API로 비정형 결과 → 구조화
    //   (후보별 지지율, 표본 정보 등을 우리 스키마로 변환)
    const structured = await structurePollData.batchTriggerAndWait(
      stored.newPollIds.map(id => ({ payload: { rawPollId: id } }))
    );

    // [Phase 6] polls + poll_results 테이블에 저장
    await storePollResults.triggerAndWait({
      results: structured.runs.filter(r => r.ok).map(r => r.output),
    });

    // [Phase 7] poll_trends 업데이트 (이동 평균 재계산)
    await updatePollTrends.trigger({});

    return { newPolls: newPolls.length };
  },
});
```

### 5.4 선거 데이터 수집 파이프라인 (ELECTION_PIPELINE)

```
스케줄: 매 6시간
예상 소요 시간: 2~5분
```

```typescript
// trigger/orchestrators/election-pipeline.ts

export const electionPipelineSchedule = schedules.task({
  id: "election-pipeline-schedule",
  cron: { pattern: "0 0,6,12,18 * * *", timezone: "Asia/Seoul" },
  run: async () => {

    // [Phase 1] 선관위 API - 후보자 정보 갱신
    const candidates = await fetchNecCandidates.triggerAndWait({
      electionId: "20260603",  // 제9회 지방선거
    }).unwrap();

    // [Phase 2] 선관위 API - 공약 정보 갱신
    const pledges = await fetchNecPledges.triggerAndWait({
      electionId: "20260603",
    }).unwrap();

    // [Phase 3] Upsert candidates 테이블
    await upsertCandidates.triggerAndWait({
      candidates: candidates.data,
      pledges: pledges.data,
    });

    // [Phase 4] 변경 감지 → 알림 (신규 후보 등록, 공약 변경 등)
    // → analyzed_articles에 시스템 알림으로 삽입

    return {
      candidatesUpdated: candidates.data.length,
      pledgesUpdated: pledges.data.length,
    };
  },
});
```

### 5.5 국무회의 수집 파이프라인 (CABINET_PIPELINE)

```
스케줄: 매주 수요일 09:00
예상 소요 시간: 3~10분
```

```typescript
// trigger/orchestrators/cabinet-pipeline.ts

export const cabinetPipelineSchedule = schedules.task({
  id: "cabinet-pipeline-schedule",
  cron: { pattern: "0 9 * * 3", timezone: "Asia/Seoul" }, // 매주 수요일 09:00
  run: async () => {

    // [Phase 1] 정책브리핑 RSS에서 국무회의 안건 수집
    const rssItems = await crawlPolicyBriefing.triggerAndWait({
      keywords: ["국무회의", "안건", "의결"],
    }).unwrap();

    // [Phase 2] 원문 크롤링 (정책브리핑 상세 페이지)
    const fullTexts = await crawlPolicyDetails.batchTriggerAndWait(
      rssItems.items.map(item => ({ payload: { url: item.link } }))
    );

    // [Phase 3] Claude AI로 안건 구조화
    //   제목, 소관부처, 우선순위, 설명, 관련 주가 영향 분석
    const agendas = await structureAgendas.triggerAndWait({
      articles: fullTexts.runs.filter(r => r.ok).map(r => r.output),
    }).unwrap();

    // [Phase 4] agendas 테이블 upsert
    await storeAgendas.triggerAndWait({ agendas: agendas.structured });

    // [Phase 5] 안건 ↔ 선거 이슈 매핑
    //   (예: "GTX 연장" 안건 → 경기도 지방선거 이슈와 연결)
    await mapAgendasToIssues.trigger({});

    return { newAgendas: agendas.structured.length };
  },
});
```

### 5.6 일일 종합 리포트 (DAILY_REPORT)

```
스케줄: 매일 06:00
```

```typescript
// trigger/orchestrators/daily-report.ts

export const dailyReportSchedule = schedules.task({
  id: "daily-report-schedule",
  cron: { pattern: "0 6 * * *", timezone: "Asia/Seoul" },
  run: async () => {

    // [Phase 1] 전일 데이터 집계
    const yesterday = getYesterday();

    const stats = await gatherDailyStats.triggerAndWait({
      date: yesterday,
    }).unwrap();
    // stats: { newArticles, significantArticles, newPolls,
    //          trendChanges, newIssues, sentimentShifts }

    // [Phase 2] Claude AI로 종합 브리핑 생성
    const briefing = await generateDailyBriefing.triggerAndWait({
      stats,
      date: yesterday,
    }).unwrap();
    // briefing: { summary, keyFindings[], riskAlerts[],
    //             provinceHighlights[], recommendedActions[] }

    // [Phase 3] 핫토픽 재집계
    await recalculateHotTopics.trigger({});

    // [Phase 4] poll_trends 일일 스냅샷
    await snapshotPollTrends.trigger({ date: yesterday });

    // [Phase 5] 브리핑 저장 (대시보드 표시용)
    await storeDailyBriefing.triggerAndWait({ briefing });

    return briefing;
  },
});
```

### 5.7 선거 당일 실시간 파이프라인 (D-DAY)

```
활성화: 2026.06.03 06:00 ~ 24:00
스케줄: 매 10초 (개표 시작 후)
```

```typescript
// trigger/orchestrators/election-day.ts

export const electionDaySchedule = schedules.task({
  id: "election-day-realtime",
  // 선거 당일에만 활성화 (동적 스케줄 생성)
  cron: { pattern: "*/10 * * * * *", timezone: "Asia/Seoul" },  // 매 10초
  run: async () => {

    // 선관위 투개표 API 실시간 호출
    const results = await fetchLiveResults.triggerAndWait({});

    // Supabase에 실시간 업데이트
    // → Realtime으로 프론트엔드에 즉시 반영
    await updateLiveResults.triggerAndWait({ results: results.data });
  },
});
```

---

## 6. AI 분석 파이프라인 설계

### 6.1 2단계 분석 전략

```
┌─────────────────────────────────────────────────────┐
│                  수집된 원본 데이터                    │
│              (200~500건 / 4시간마다)                  │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  [1단계] 빅카인즈 NLP API (무료, 빠름)               │
│                                                     │
│  • get_cls → 뉴스 카테고리 분류                      │
│    └ 정치/경제/사회 카테고리가 아닌 것 제외             │
│                                                     │
│  • get_ner → 개체명 인식                             │
│    └ 후보자명, 정당명, 지역명 추출                    │
│    └ 우리 DB의 candidates/provinces와 매칭 시도       │
│                                                     │
│  • get_keyword → 핵심 키워드 5개 추출                │
│                                                     │
│  • 관련성 스코어링 (규칙 기반):                       │
│    └ 선거 키워드 포함: +0.3                          │
│    └ 등록된 후보자명 포함: +0.3                       │
│    └ 등록된 지역명 포함: +0.2                         │
│    └ 국무회의/정책 키워드: +0.2                       │
│                                                     │
│  결과: 관련성 < 0.3 → 버림 (약 60~70% 필터링)        │
│        관련성 ≥ 0.3 → 2단계로 (약 60~150건)          │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  [2단계] Claude API (유료, 정밀)                     │
│  모델: claude-sonnet-4-6                             │
│                                                     │
│  입력: 기사 원문 + 1단계 NLP 결과 + 컨텍스트          │
│                                                     │
│  프롬프트 구조:                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ SYSTEM: 너는 한국 지방선거 분석 전문가다.        │   │
│  │ 다음 뉴스 기사를 분석하여 JSON으로 응답하라.      │   │
│  │                                              │   │
│  │ CONTEXT:                                     │   │
│  │ - 현재 17개 시도 후보자 목록 (이름, 정당)       │   │
│  │ - 최근 여론조사 트렌드 요약                     │   │
│  │ - 활성 지역 이슈 목록                          │   │
│  │                                              │   │
│  │ ARTICLE:                                     │   │
│  │ {기사 원문}                                    │   │
│  │                                              │   │
│  │ NLP RESULTS:                                 │   │
│  │ {1단계 분류/NER/키워드 결과}                    │   │
│  │                                              │   │
│  │ OUTPUT (JSON):                               │   │
│  │ {                                            │   │
│  │   is_significant: boolean,                   │   │
│  │   significance_reason: string,               │   │
│  │   summary: string (2-3문장),                 │   │
│  │   sentiment: "positive"|"negative"|...,      │   │
│  │   sentiment_score: -1.0 ~ 1.0,              │   │
│  │   candidate_sentiments: [                    │   │
│  │     { name, sentiment, score, context }      │   │
│  │   ],                                        │   │
│  │   related_provinces: string[],               │   │
│  │   related_issues: string[],                  │   │
│  │   trend_signal: "rising"|"falling"|...,      │   │
│  │   trend_detail: string,                      │   │
│  │   related_agendas: string[] (있을 경우)       │   │
│  │ }                                            │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  토큰 사용량 추정 (건당):                             │
│  - 입력: ~2,000 토큰 (기사) + ~500 (컨텍스트) = ~2,500│
│  - 출력: ~300 토큰                                   │
│  - 건당 비용: ~$0.009 (Sonnet 4.6 기준)              │
│  - 4시간 150건: ~$1.35                               │
│  - 일일 (5회): ~$6.75                                │
│  - 월간: ~$200                                       │
└─────────────────────────────────────────────────────┘
```

### 6.2 여론조사 구조화 분석

nesdc.go.kr에서 수집한 HTML 테이블 데이터를 Claude로 구조화:

```typescript
// trigger/analyzers/poll-structurer.ts

const POLL_STRUCTURE_PROMPT = `
당신은 한국 선거 여론조사 데이터 전문가입니다.
다음 HTML 테이블에서 추출된 여론조사 원본 데이터를 구조화하세요.

입력: {raw_html_table}

출력 (JSON):
{
  election_type: string,
  region: string,             // "서울특별시" 등
  pollster: string,           // 조사기관
  survey_period: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
  method: string,
  sample_size: number,
  margin_of_error: number,
  response_rate: number,
  results: [
    { candidate_name: string, party: string, percentage: number }
  ]
}

주의사항:
- 후보자명은 정확하게 추출 (한자 표기 제거)
- 정당명은 약칭으로 통일: 국민의힘→ppp, 더불어민주당→dp, 조국혁신당→rkp
- percentage는 소수점 1자리까지
- 무응답/기타 항목도 포함
`;
```

### 6.3 트렌드 감지 로직

```typescript
// trigger/analyzers/trend-detector.ts

interface TrendSignal {
  type: 'poll_shift' | 'sentiment_shift' | 'issue_emerging' | 'breaking_news';
  severity: 'critical' | 'high' | 'medium' | 'low';
  province?: string;
  candidate?: string;
  description: string;
  evidence: string[];
}

// 규칙 기반 + AI 하이브리드 트렌드 감지
async function detectTrends(): Promise<TrendSignal[]> {
  const signals: TrendSignal[] = [];

  // 1. 여론조사 급변 감지 (규칙 기반)
  //    최근 조사에서 ±3%p 이상 변동 시
  const pollShifts = await detectPollShifts(threshold: 3.0);

  // 2. 감성 급변 감지 (규칙 기반)
  //    24시간 내 특정 후보 감성 점수 ±0.3 이상 변동 시
  const sentimentShifts = await detectSentimentShifts(threshold: 0.3);

  // 3. 신규 이슈 감지 (AI 기반)
  //    최근 24시간 기사에서 기존에 없던 이슈 키워드 클러스터 발견 시
  const newIssues = await detectEmergingIssues();

  // 4. 속보 감지 (규칙 기반)
  //    동일 주제 기사 5개+ 1시간 내 발행 시
  const breaking = await detectBreakingNews(articleThreshold: 5, hourWindow: 1);

  return [...pollShifts, ...sentimentShifts, ...newIssues, ...breaking];
}
```

---

## 7. 프론트엔드 연동 설계

### 7.1 Supabase Realtime 구독

mock 데이터를 실시간 DB 데이터로 교체하는 전략:

```typescript
// lib/db/realtime.ts

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 여론조사 실시간 구독 훅
export function useRealtimePolls(provinceCode: string) {
  const [polls, setPolls] = useState<Poll[]>([]);

  useEffect(() => {
    // 초기 데이터 로드
    fetchPolls(provinceCode).then(setPolls);

    // Realtime 구독
    const channel = supabase
      .channel(`polls:${provinceCode}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'polls',
        filter: `province_id=eq.${provinceCode}`,
      }, (payload) => {
        setPolls(prev => [payload.new as Poll, ...prev].slice(0, 10));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [provinceCode]);

  return polls;
}

// 핫토픽 실시간 구독 훅
export function useRealtimeHotTopics() {
  const [topics, setTopics] = useState<HotTopic[]>([]);

  useEffect(() => {
    fetchHotTopics().then(setTopics);

    const channel = supabase
      .channel('hot-topics')
      .on('postgres_changes', {
        event: '*',  // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'hot_topics',
      }, () => {
        // 변경 시 전체 재조회 (집계 데이터이므로)
        fetchHotTopics().then(setTopics);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return topics;
}
```

### 7.2 기존 페이지별 마이그레이션 계획

| 페이지 | 현재 | 마이그레이션 |
|--------|------|------------|
| `/` 대시보드 | `mock-data.ts`의 `kpiStats`, `recentAgendas`, `topMinisters`, `hotTopics` | Supabase 쿼리 + `useRealtimeHotTopics()` |
| `/local-election` | `election-data.ts`의 하드코딩 provinces/districts | Supabase `provinces` + `candidates` + `useRealtimePolls()` |
| `/workspace` | `mock-data.ts`의 agendas 배열 | Supabase `agendas` + Realtime |
| `/investor` | `mock-data.ts`의 stockImpacts | Supabase `stock_impacts` + 주기적 갱신 |
| `/timeline` | `data/*.json` 정적 파일 | Supabase `agendas` + `agenda_tracking` |

### 7.3 API Routes

```typescript
// app/api/polls/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const province = searchParams.get('province');

  const { data } = await supabase
    .from('v_latest_polls')
    .select('*')
    .eq('province_code', province)
    .order('survey_date', { ascending: false })
    .limit(10);

  return Response.json(data);
}

// app/api/trigger/route.ts  (수동 실행용)
export async function POST(request: Request) {
  const { pipeline } = await request.json();
  const handle = await tasks.trigger(pipeline, {});
  return Response.json({ runId: handle.id });
}
```

---

## 8. 구현 로드맵

### Phase 1: 기반 구축 (1주)

```
[ ] Supabase 테이블 생성 (마이그레이션 5개)
[ ] Trigger.dev 프로젝트 초기화 및 설정
[ ] 환경변수 설정 (네이버 API, Anthropic, Supabase)
[ ] 빅카인즈 API 키 신청
[ ] data.go.kr 선관위 API 키 발급
[ ] 기본 타입 정의 (database.types.ts 자동 생성)
```

### Phase 2: 크롤러 구현 (1~2주)

```
[ ] nesdc.go.kr 스크래퍼 (목록 + 상세)
[ ] 네이버 뉴스 API 크롤러
[ ] RSS 피드 크롤러 (20개+)
[ ] 선관위 API 크롤러 (후보자/공약)
[ ] 정책브리핑 크롤러
[ ] 원문 크롤링 (Crawlee CheerioCrawler)
[ ] 중복 제거 로직
```

### Phase 3: AI 분석 파이프라인 (1~2주)

```
[ ] 빅카인즈 NLP API 연동 (분류/NER/키워드)
[ ] 관련성 스코어링 로직
[ ] Claude API 분석 프롬프트 설계 및 테스트
[ ] 여론조사 구조화 분석
[ ] 감성분석 파이프라인
[ ] 트렌드 감지 로직
```

### Phase 4: 오케스트레이션 (1주)

```
[ ] 뉴스 파이프라인 오케스트레이터
[ ] 여론조사 파이프라인 오케스트레이터
[ ] 선거 데이터 파이프라인 오케스트레이터
[ ] 국무회의 파이프라인 오케스트레이터
[ ] 일일 리포트 오케스트레이터
[ ] 크론 스케줄 설정 및 테스트
```

### Phase 5: 프론트엔드 연동 (1~2주)

```
[ ] Supabase Realtime 훅 구현
[ ] 대시보드 mock → DB 마이그레이션
[ ] 지방선거 관제탑 mock → DB 마이그레이션
[ ] 워크스페이스 mock → DB 마이그레이션
[ ] API Routes 구현
[ ] 로딩/에러 상태 처리
```

### Phase 6: 안정화 및 모니터링 (1주)

```
[ ] Trigger.dev 대시보드 모니터링 설정
[ ] 에러 알림 (Slack/Discord 웹훅)
[ ] 크롤링 실패 재시도 로직 검증
[ ] 부하 테스트 (동시 크롤링 10개)
[ ] 비용 모니터링 (Claude API 사용량)
[ ] 데이터 품질 검증 스크립트
```

### Phase 7: 선거 당일 대비 (선거 1주 전)

```
[ ] 실시간 개표 파이프라인 구현
[ ] 매 10초 폴링 부하 테스트
[ ] WebSocket 실시간 업데이트 테스트
[ ] 장애 대응 시나리오 준비
```

### 전체 일정

```
Phase 1 ──────  (1주)
Phase 2 ──────────────  (1~2주, Phase 1과 일부 병렬)
Phase 3 ──────────────  (1~2주, Phase 2와 병렬)
Phase 4 ──────  (1주, Phase 2,3 완료 후)
Phase 5 ──────────────  (1~2주, Phase 4와 병렬)
Phase 6 ──────  (1주)
Phase 7 ──────  (선거 1주 전)

총 예상 기간: 6~8주
목표 완료일: 2026-05-15 (선거 3주 전)
선거일: 2026-06-03
```

---

## 9. 비용 분석

### 9.1 월간 비용 추정

| 항목 | 단가 | 사용량/월 | 월 비용 |
|------|------|----------|--------|
| **Claude API (Sonnet 4.6)** | 입력 $3/M, 출력 $15/M | 입력 ~22.5M 토큰, 출력 ~2.7M 토큰 | **~$108** |
| **Supabase** | Pro $25/월 | 8GB DB, 250GB 전송 | **$25** |
| **Trigger.dev** | Hobby $10/월 | ~5,000 runs/월 | **$10** |
| **네이버 API** | 무료 | 25,000회/일 | **$0** |
| **빅카인즈 API** | 무료 | 신청 후 무료 | **$0** |
| **선관위 API** | 무료 | 10,000회/일 | **$0** |
| **nesdc.go.kr** | 무료 | 스크래핑 | **$0** |
| **Vercel** | Hobby 무료~Pro $20 | 호스팅 | **$0~$20** |
| | | **합계** | **~$143~$163/월** |

### 9.2 Claude API 비용 상세

```
뉴스 분석 (일일):
  - 4시간마다 × 5회 = 150건/회 × 5 = 750건/일
  - 건당: 입력 2,500토큰 + 출력 300토큰
  - 일일: 입력 1.875M + 출력 0.225M = $5.63 + $3.38 = $9.01/일

여론조사 구조화 (일일):
  - 평균 5건/일
  - 건당: 입력 3,000토큰 + 출력 500토큰
  - 일일: 입력 15K + 출력 2.5K = ~$0.08/일

일일 리포트:
  - 1회/일
  - 입력 10,000토큰 + 출력 2,000토큰 = ~$0.06/일

월간 총계: ($9.01 + $0.08 + $0.06) × 30 = ~$274/월
```

> **비용 최적화**: Sonnet 대신 Haiku 사용 시 비용 1/10로 절감 가능 (~$27/월).
> 1차 NLP 필터링으로 Claude 호출량을 60~70% 줄이는 것이 핵심.

### 9.3 비용 최적화 전략

1. **2단계 필터링**: 빅카인즈 NLP (무료)로 70% 필터 → Claude는 30%만 처리
2. **배치 처리**: 개별 호출 대신 여러 기사를 하나의 프롬프트에 묶어 처리
3. **캐싱**: 동일 기사 중복 분석 방지 (URL 기반 dedup)
4. **모델 선택**: 단순 분류는 Haiku, 심층 분석만 Sonnet
5. **프롬프트 최적화**: 컨텍스트를 최소화하되 정확도 유지

---

## 10. 리스크 및 대응 전략

### 10.1 기술적 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| nesdc.go.kr HTML 구조 변경 | 중 | 높음 | 스크래퍼에 구조 검증 로직 추가, 변경 감지 시 알림 |
| 빅카인즈 API 접근 제한 | 중 | 중 | 네이버 API + RSS로 폴백, API 키 갱신 자동화 |
| Claude API 비용 초과 | 낮 | 중 | 일일 비용 한도 설정, Haiku 폴백, 배치 크기 조절 |
| 크롤링 IP 차단 | 중 | 중 | 요청 간격 준수 (1~2초), User-Agent 설정, 프록시 |
| Supabase 용량 초과 | 낮 | 중 | raw_articles 30일 보관 후 아카이브, 불필요 데이터 정리 |

### 10.2 데이터 품질 리스크

| 리스크 | 대응 |
|--------|------|
| 중복 기사 수집 | URL + 제목 기반 dedup, 유사도 0.9 이상 제거 |
| 오분석 (AI 할루시네이션) | 구조화된 JSON 스키마 강제, 후보자명 DB 교차 검증 |
| 여론조사 파싱 오류 | raw_html 원본 보관, 수동 검증 인터페이스 |
| 감성분석 편향 | 다수 기사 평균으로 개별 오류 상쇄, 정기적 샘플 검증 |

### 10.3 운영 리스크

| 리스크 | 대응 |
|--------|------|
| 선거 당일 트래픽 폭주 | Supabase Pro 플랜, CDN 캐싱, 정적 폴백 페이지 |
| 스케줄러 장애 | Trigger.dev 재시도 로직 (3회), 수동 트리거 API |
| 법적 이슈 (크롤링) | 공공데이터 우선 사용, RSS 기반 수집, robots.txt 준수 |

---

## 부록 A: 환경변수 목록

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Trigger.dev
TRIGGER_SECRET_KEY=tr_dev_...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# 네이버
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...

# 빅카인즈
BIGKINDS_API_KEY=...

# 공공데이터포털 (선관위)
DATA_GO_KR_API_KEY=...

# 한국투자증권 (주가 데이터, 선택)
KIS_APP_KEY=...
KIS_APP_SECRET=...
```

## 부록 B: 참고 프로젝트

| 프로젝트 | URL | 참고 포인트 |
|---------|-----|------------|
| Crawl4AI | github.com/unclecode/crawl4ai | 크롤링 → LLM 구조화 추출 패턴 |
| Horizon | github.com/Thysrael/Horizon | 다중소스 → AI 스코어링 → 일일 브리핑 |
| Scraping Agent AI | github.com/hmshb/scraping-agent-ai | LangGraph 에이전트 크롤링 |
| Volby2025 | github.com/moodixmarket/volby2025 | 선관위 XML → WebSocket 실시간 |
| BIGKINDS-LAB | github.com/KPF-bigkinds/BIGKINDS-LAB | KPF-BERT 한국어 NLP 모델 |
| Trigger.dev | trigger.dev/docs/guides/example-projects | Deep Research Agent 가이드 |
| Crawlee | crawlee.dev | TypeScript 프로덕션 크롤러 |
| teampopong | github.com/teampopong/data-for-rnd | 한국 선거 데이터 표준 레퍼런스 |

## 부록 C: 선거 일정 주요 마일스톤

```
2026-03-16  현재 (기획 완료)
2026-04-15  Phase 4 완료 목표 (파이프라인 가동 시작)
2026-05-01  Phase 5 완료 목표 (프론트엔드 연동 완료)
2026-05-15  Phase 6 완료 목표 (안정화 완료)
2026-05-20  예비후보 등록 마감
2026-05-24  공식 선거운동 시작
2026-05-27  Phase 7 완료 목표 (D-day 준비)
2026-06-03  ★ 제9회 전국동시지방선거
```

---

> **이 기획서는 국무노션 프로젝트의 실시간 데이터 수집 에이전트 시스템 구축을 위한 청사진이다.**
> **모든 설계는 현재 프로젝트의 기존 타입 시스템, 디렉토리 구조, 기술 스택과의 호환성을 최우선으로 고려하였다.**
