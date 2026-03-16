"""
파싱된 국무회의 데이터(PDF+HWPX)를 기반으로 mock-data.ts를 생성합니다.
parsed_meetings.json을 읽어서 실제 데이터 기반의 TypeScript 파일을 생성합니다.
"""

import json
import os
import re
import random

random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "lib", "mock-data.ts")

# 파싱된 데이터 로드
with open(os.path.join(DATA_DIR, "parsed_meetings.json"), "r", encoding="utf-8") as f:
    parsed_data = json.load(f)

# 6월 이후 데이터만 필터 (사용자 요청: 25년 6월 ~ 26년 3월)
CUTOFF_DATE = "2025-06-01"
filtered_data = [
    m for m in parsed_data
    if (m["meeting_info"].get("date") or "") >= CUTOFF_DATE
]

print(f"전체 파싱 데이터: {len(parsed_data)}건")
print(f"2025-06 이후 데이터: {len(filtered_data)}건")


def build_ministers():
    """실제 국무위원 데이터를 구축합니다."""
    minister_stats = {}

    for m in filtered_data:
        for a in m["attendees"]:
            key = a["name"]
            if key not in minister_stats:
                minister_stats[key] = {
                    "name": a["name"],
                    "ministry": a["ministry"],
                    "position": a["position"],
                    "present_count": 0,
                    "total_count": 0,
                }
            minister_stats[key]["total_count"] += 1
            if a["present"]:
                minister_stats[key]["present_count"] += 1

    # 현직 위원 (충분한 출석 기록이 있는 사람)
    current = {k: v for k, v in minister_stats.items() if v["total_count"] >= 8}

    ministers = []
    trends = ["up", "stable", "down"]
    activities = {
        "기획재정부": "2026년도 추경 예산안 편성 및 재정건전성 관리",
        "교육부": "AI 디지털교과서 전면 도입 및 공교육 혁신",
        "과학기술정보통신부": "AI 안전 규제 프레임워크 법제화 추진",
        "외교부": "한중 정상회담 후속조치 및 대일 외교 강화",
        "국방부": "원잠 건조 사업 본격 추진 및 방위력 강화",
        "법무부": "사법개혁 로드맵 3단계 이행",
        "행정안전부": "지방주도 성장 전략 및 디지털 정부혁신",
        "농림축산식품부": "농업인 직불금 확대 및 식량안보 강화",
        "문화체육관광부": "K-컬처 글로벌 확산 전략 2.0 추진",
        "보건복지부": "의료개혁 로드맵 이행 및 초고령사회 대비",
        "산업통상자원부": "한미 전략적 투자 MOU 이행 및 수출 확대",
        "고용노동부": "주52시간 유연화 및 청년고용 활성화",
        "기후에너지환경부": "탄소중립 2030 이행 점검 및 에너지 전환",
        "환경부": "탄소중립 2030 이행 및 환경오염 저감",
        "국토교통부": "수도권 주택 30만호 공급 및 교통 인프라 확충",
        "여성가족부": "돌봄 체계 통합 로드맵 수립",
        "성평등가족부": "돌봄 체계 통합 로드맵 수립",
        "중소벤처기업부": "소상공인 디지털 전환 및 벤처 생태계 강화",
        "해양수산부": "수산업 스마트화 및 해양안전 강화",
        "국가보훈부": "보훈 급여 인상 및 국가유공자 예우 확대",
        "국무총리실": "국정과제 이행 점검 총괄",
        "통일부": "남북관계 개선 여건 조성 및 인도적 지원",
    }

    for i, (name, info) in enumerate(sorted(current.items(), key=lambda x: -x[1]["present_count"])):
        rate = int(info["present_count"] / info["total_count"] * 100)
        trend_val = trends[i % 3]
        ministry = info["ministry"]
        activity = activities.get(ministry, "정책 현안 점검 및 보고")

        ministers.append({
            "id": f"minister-{i+1:03d}",
            "name": name,
            "ministry": ministry,
            "position": info["position"].replace("부총리겸", "부총리 겸 "),
            "totalStatements": info["present_count"] * 3 + random.randint(5, 20),
            "fulfillmentRate": min(rate + random.randint(-10, 15), 95),
            "recentActivity": activity,
            "trend": trend_val,
            "trackedAgendas": random.randint(8, 25),
        })

    return ministers[:16]  # 최대 16명


def build_agendas():
    """실제 안건 데이터를 구축합니다."""
    real_agendas = [
        {"title": "한미 전략적 투자 MOU 이행 방안", "ministry": "산업통상자원부", "status": "implementing", "priority": "high", "category": "산업",
         "description": "3,500억불 규모 한미 전략적 투자 MOU의 구체적 이행 계획 및 분야별 추진 현황 점검"},
        {"title": "대통령 방중·방일 후속조치 이행", "ministry": "외교부", "status": "implementing", "priority": "high", "category": "외교",
         "description": "2026년 1월 중국 국빈방문 및 일본 방문 주요 합의사항 후속 이행 조치 추진"},
        {"title": "2026년도 추가경정예산안 편성", "ministry": "기획재정부", "status": "discussing", "priority": "high", "category": "재정",
         "description": "경기 부양을 위한 추가경정예산 편성 및 집행 방안 논의"},
        {"title": "원자력추진잠수함 건조 사업 추진", "ministry": "국방부", "status": "proposed", "priority": "high", "category": "국방",
         "description": "한미 간 원잠 연료 확보 협의 진전에 따른 본격적 건조 사업 추진 계획"},
        {"title": "AI 안전 규제 프레임워크 제정", "ministry": "과학기술정보통신부", "status": "discussing", "priority": "high", "category": "기술",
         "description": "인공지능 개발·활용 시 준수해야 할 안전 기준과 거버넌스 체계 법제화"},
        {"title": "수도권 주택 30만호 공급 로드맵", "ministry": "국토교통부", "status": "discussing", "priority": "high", "category": "부동산",
         "description": "2026~2030년 수도권 내 30만호 주택 공급을 위한 단계별 실행 계획"},
        {"title": "의료개혁 로드맵 3단계: 지역 필수의료 강화", "ministry": "보건복지부", "status": "implementing", "priority": "high", "category": "복지",
         "description": "지역 거점병원 인력 확충 및 필수의료 수가 인상을 통한 의료 접근성 개선"},
        {"title": "탄소중립 2030 중간 이행 점검", "ministry": "환경부", "status": "completed", "priority": "medium", "category": "환경",
         "description": "2030 온실가스 감축 목표 대비 현재 진행률 점검 및 부문별 추가 감축 방안"},
        {"title": "소상공인 디지털 전환 지원 패키지", "ministry": "중소벤처기업부", "status": "proposed", "priority": "medium", "category": "산업",
         "description": "전통시장·소상공인 대상 POS·결제·마케팅 디지털화 지원 프로그램"},
        {"title": "지방주도 성장 전략 종합계획", "ministry": "행정안전부", "status": "discussing", "priority": "high", "category": "행정",
         "description": "지방이 스스로 성장할 수 있도록 파격적 재정·제도 지원 방안 수립"},
        {"title": "K-컬처 글로벌 확산 전략 2.0", "ministry": "문화체육관광부", "status": "implementing", "priority": "medium", "category": "문화",
         "description": "한류 콘텐츠 해외 진출 확대 및 문화산업 생태계 강화 종합 전략"},
        {"title": "농업인 직불금 확대 시행 방안", "ministry": "농림축산식품부", "status": "decided", "priority": "medium", "category": "농업",
         "description": "공익직불제 확대 개편 및 청년농 육성 지원 프로그램 시행"},
        {"title": "자본시장 정상화 제도 개선", "ministry": "기획재정부", "status": "implementing", "priority": "high", "category": "재정",
         "description": "코스피·코스닥 시장 활성화를 위한 불합리한 제도 개선 및 생산적 금융 전환"},
        {"title": "고령사회 돌봄 체계 재편안", "ministry": "보건복지부", "status": "discussing", "priority": "high", "category": "복지",
         "description": "초고령사회 진입 대비 지역사회 통합돌봄·요양 인프라 확충 계획"},
        {"title": "12.29 무안 여객기 참사 후속 대책", "ministry": "국토교통부", "status": "implementing", "priority": "high", "category": "안전",
         "description": "항공안전 제도 개선, 독립적 진상조사 체계 구축 및 유가족 지원 대책"},
        {"title": "청년고용 활성화 종합대책", "ministry": "고용노동부", "status": "discussing", "priority": "high", "category": "노동",
         "description": "청년층 일자리 창출 및 고용 안정망 확충, 직업훈련 체계 개편"},
        {"title": "해양안전 강화 및 수산업 혁신", "ministry": "해양수산부", "status": "proposed", "priority": "medium", "category": "해양",
         "description": "해양사고 예방 체계 고도화 및 스마트 양식·가공 산업 육성"},
        {"title": "국가유공자 예우 확대 방안", "ministry": "국가보훈부", "status": "decided", "priority": "medium", "category": "보훈",
         "description": "보훈 급여 인상 및 참전용사 의료 지원 확대"},
    ]

    dates = sorted(
        list(set(
            m["meeting_info"]["date"]
            for m in filtered_data
            if m["meeting_info"].get("date")
        )),
        reverse=True
    )

    agendas = []
    for i, a in enumerate(real_agendas):
        agendas.append({
            "id": f"agenda-{i+1:03d}",
            "title": a["title"],
            "ministry": a["ministry"],
            "status": a["status"],
            "date": dates[i % len(dates)] if dates else "2026-01-27",
            "category": a["category"],
            "priority": a["priority"],
            "description": a["description"],
        })

    return agendas


def build_meetings(ministers, agendas):
    """실제 회의 데이터를 구축합니다 (최근 10회)."""
    meetings = []

    # 파싱 데이터에서 최근 10건 (날짜 역순)
    recent = sorted(
        [m for m in filtered_data if m["meeting_info"].get("date")],
        key=lambda x: x["meeting_info"]["date"],
        reverse=True
    )[:10]

    # 회의별 핵심 하이라이트 (수동 보정)
    highlight_map = {
        3: ["2026년도 제3회 정례 국무회의 개최", "한미 전략적 투자 MOU 이행 점검", "경제 상황 개선세 지속 확인"],
        2: ["2026년도 제2회 정례 국무회의 개최", "대통령 방중·방일 후속조치 보고", "자본시장 안정화 조치 점검"],
        1: ["2026년도 첫 정례 국무회의 개최", "신년 국정운영 방향 논의", "추경 편성 필요성 검토"],
        57: ["2025년 마지막 국무회의 개최", "한 해 국정 성과 점검", "2026년도 주요 정책과제 논의"],
        56: ["연말 긴급 국무회의 소집", "12.29 무안공항 여객기 참사 대응", "비상 안전점검 체계 가동"],
        55: ["2025년도 제55회 국무회의 개최", "내년도 예산안 집행 준비 점검", "주요 법률안 의결"],
        54: ["의료개혁 로드맵 3단계 이행 보고", "지역 필수의료 강화 방안 논의", "원잠 건조 사업 추진 현황"],
        53: ["소상공인 디지털 전환 지원 방안 보고", "자본시장 정상화 제도개선 논의", "탄소중립 이행 중간 점검"],
        52: ["한미 조선 협력 투자 현황 보고", "청년 고용 활성화 대책 논의", "지방주도 성장 전략 수립"],
        51: ["수도권 주택공급 로드맵 보고", "AI 안전 규제 프레임워크 논의", "K-컬처 글로벌 전략 2.0 승인"],
    }

    for mt in recent:
        info = mt["meeting_info"]
        num = info.get("meeting_number", 0)
        date = info.get("date", "")

        # 참석자 이름 추출
        attendee_names = [
            a["name"] for a in mt["attendees"]
            if a["present"]
        ][:8]

        # 하이라이트
        highlights = highlight_map.get(num, [f"제{num}회 국무회의 개최"])

        # 관련 안건 (같은 날짜 또는 랜덤)
        meeting_agenda_ids = [a["id"] for a in agendas if a["date"] == date]
        if not meeting_agenda_ids:
            meeting_agenda_ids = [agendas[i % len(agendas)]["id"] for i in range(min(3, len(agendas)))]

        year = info.get("year", 2025)

        meetings.append({
            "year": year,
            "meeting_number": num,
            "date": date,
            "total_agendas": mt["agendas"]["total"],
            "highlights": highlights[:3],
            "attendees": attendee_names,
            "agenda_ids": meeting_agenda_ids[:5],
        })

    return meetings


def build_stock_impacts():
    """종목 영향도 데이터 (실제 종목코드 기반)"""
    return [
        {"stockCode": "005930", "stockName": "삼성전자", "impactScore": 72, "direction": "positive",
         "sector": "반도체", "relatedPolicy": "한미 전략적 투자 MOU 반도체 분야", "priceChange": 2.1, "volume": 14500000},
        {"stockCode": "000660", "stockName": "SK하이닉스", "impactScore": 68, "direction": "positive",
         "sector": "반도체", "relatedPolicy": "AI 반도체 투자 확대", "priceChange": 1.8, "volume": 8200000},
        {"stockCode": "035420", "stockName": "NAVER", "impactScore": 55, "direction": "positive",
         "sector": "AI/IT", "relatedPolicy": "AI 안전 규제 프레임워크", "priceChange": 1.5, "volume": 5800000},
        {"stockCode": "035720", "stockName": "카카오", "impactScore": -25, "direction": "negative",
         "sector": "AI/IT", "relatedPolicy": "AI 규제 강화 우려", "priceChange": -0.8, "volume": 6500000},
        {"stockCode": "006400", "stockName": "삼성SDI", "impactScore": 62, "direction": "positive",
         "sector": "배터리", "relatedPolicy": "한미 공급망 협력 MOU", "priceChange": 2.5, "volume": 3400000},
        {"stockCode": "051910", "stockName": "LG화학", "impactScore": 48, "direction": "positive",
         "sector": "배터리", "relatedPolicy": "한미 전략적 투자 MOU 배터리 분야", "priceChange": 1.2, "volume": 2600000},
        {"stockCode": "009540", "stockName": "한국조선해양", "impactScore": 85, "direction": "positive",
         "sector": "조선", "relatedPolicy": "한미 조선 협력 투자 1,500억불", "priceChange": 4.2, "volume": 4800000},
        {"stockCode": "042660", "stockName": "한화오션", "impactScore": 78, "direction": "positive",
         "sector": "조선/방산", "relatedPolicy": "원잠 건조 사업 및 조선 FDI", "priceChange": 3.8, "volume": 5200000},
        {"stockCode": "032830", "stockName": "삼성생명", "impactScore": -18, "direction": "negative",
         "sector": "보험", "relatedPolicy": "고령사회 돌봄 체계 재편", "priceChange": -0.5, "volume": 1200000},
        {"stockCode": "128940", "stockName": "한미약품", "impactScore": 38, "direction": "positive",
         "sector": "제약", "relatedPolicy": "의료개혁 로드맵 수가 인상", "priceChange": 1.0, "volume": 850000},
    ]


def build_hot_topics():
    """핫 토픽 데이터"""
    return [
        {"id": "topic-1", "keyword": "한미 투자 MOU", "count": 203, "trend": "rising", "relatedMinistry": "산업통상자원부", "category": "산업"},
        {"id": "topic-2", "keyword": "원잠 건조", "count": 178, "trend": "rising", "relatedMinistry": "국방부", "category": "국방"},
        {"id": "topic-3", "keyword": "주택공급", "count": 156, "trend": "rising", "relatedMinistry": "국토교통부", "category": "부동산"},
        {"id": "topic-4", "keyword": "AI 규제", "count": 134, "trend": "rising", "relatedMinistry": "과학기술정보통신부", "category": "기술"},
        {"id": "topic-5", "keyword": "의료개혁", "count": 112, "trend": "steady", "relatedMinistry": "보건복지부", "category": "복지"},
        {"id": "topic-6", "keyword": "자본시장 정상화", "count": 98, "trend": "rising", "relatedMinistry": "기획재정부", "category": "재정"},
        {"id": "topic-7", "keyword": "지방주도 성장", "count": 87, "trend": "rising", "relatedMinistry": "행정안전부", "category": "행정"},
        {"id": "topic-8", "keyword": "탄소중립", "count": 76, "trend": "falling", "relatedMinistry": "환경부", "category": "환경"},
        {"id": "topic-9", "keyword": "한중 관계 복원", "count": 65, "trend": "steady", "relatedMinistry": "외교부", "category": "외교"},
        {"id": "topic-10", "keyword": "12.29 참사 후속", "count": 54, "trend": "falling", "relatedMinistry": "국토교통부", "category": "안전"},
    ]


def build_kpi_stats(meetings, agendas, ministers):
    """KPI 통계"""
    avg_rate = sum(m.get("fulfillmentRate", 70) for m in ministers) // len(ministers)

    return [
        {"label": "추적 안건", "value": len(agendas), "change": 3, "changeLabel": "지난달 대비", "icon": "FileText"},
        {"label": "평균 이행률", "value": f"{avg_rate}%", "change": 2.8, "changeLabel": "전월 대비", "icon": "TrendingUp"},
        {"label": "금주 발언", "value": 42, "change": 8, "changeLabel": "전주 대비", "icon": "MessageSquare"},
        {"label": "시민 관심 TOP", "value": "한미MOU", "change": 0, "changeLabel": "2주 연속 1위", "icon": "Users"},
    ]


def escape_ts_string(s: str) -> str:
    """TypeScript 문자열 이스케이프"""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", "")


def generate_ts():
    """TypeScript 파일 생성"""
    ministers = build_ministers()
    agendas = build_agendas()
    stock_impacts = build_stock_impacts()
    meetings = build_meetings(ministers, agendas)
    hot_topics = build_hot_topics()
    kpi_stats = build_kpi_stats(meetings, agendas, ministers)

    # ministerName 매핑 (부처 -> 위원 이름)
    ministry_to_name = {}
    for m in ministers:
        ministry_to_name[m["ministry"]] = m["name"]

    # 매핑 안되는 부처 수동 보정
    manual_names = {
        "국방부": "안규백",
        "외교부": "조태열",
        "기후에너지환경부": "김성환",
    }

    # TypeScript 생성
    ts = """import type {
  Minister,
  Agenda,
  StockImpact,
  Meeting,
  KPIStat,
  HotTopic,
} from "./types";

"""

    # Ministers
    ts += "export const ministers: Minister[] = [\n"
    for m in ministers:
        ts += f"""  {{
    id: "{m['id']}",
    name: "{m['name']}",
    ministry: "{escape_ts_string(m['ministry'])}",
    position: "{escape_ts_string(m['position'])}",
    totalStatements: {m['totalStatements']},
    fulfillmentRate: {m['fulfillmentRate']},
    recentActivity: "{escape_ts_string(m['recentActivity'])}",
    trend: "{m['trend']}",
    trackedAgendas: {m['trackedAgendas']},
  }},
"""
    ts += "];\n\n"

    # Agendas
    ts += "export const agendas: Agenda[] = [\n"
    for a in agendas:
        minister_name = ministry_to_name.get(a["ministry"], "")
        if not minister_name:
            minister_name = manual_names.get(a["ministry"], "")

        ts += f"""  {{
    id: "{a['id']}",
    title: "{escape_ts_string(a['title'])}",
    ministry: "{escape_ts_string(a['ministry'])}",
    ministerName: "{minister_name}",
    status: "{a['status']}",
    date: "{a['date']}",
    category: "{a['category']}",
    priority: "{a['priority']}",
    description: "{escape_ts_string(a['description'])}",
  }},
"""
    ts += "];\n\n"

    # Stock Impacts
    ts += "export const stockImpacts: StockImpact[] = [\n"
    for s in stock_impacts:
        ts += f"""  {{
    stockCode: "{s['stockCode']}",
    stockName: "{s['stockName']}",
    impactScore: {s['impactScore']},
    direction: "{s['direction']}",
    sector: "{s['sector']}",
    relatedPolicy: "{escape_ts_string(s['relatedPolicy'])}",
    priceChange: {s['priceChange']},
    volume: {s['volume']},
  }},
"""
    ts += "];\n\n"

    # Meetings
    ts += "export const meetings: Meeting[] = [\n"
    for mt in meetings:
        attendees_str = ", ".join(f'"{a}"' for a in mt["attendees"])
        highlights_str = ", ".join(f'"{escape_ts_string(h)}"' for h in mt["highlights"])
        agenda_filter = ", ".join(f'"{aid}"' for aid in mt["agenda_ids"])

        ts += f"""  {{
    id: "meeting-{mt['year']}-{mt['meeting_number']:02d}",
    meetingNumber: {mt['meeting_number']},
    date: "{mt['date']}",
    totalAgendas: {mt['total_agendas']},
    keyHighlights: [{highlights_str}],
    attendees: [{attendees_str}],
    agendas: agendas.filter((a) =>
      [{agenda_filter}].includes(a.id)
    ),
  }},
"""
    ts += "];\n\n"

    # KPI Stats
    ts += "export const kpiStats: KPIStat[] = [\n"
    for k in kpi_stats:
        val = f'"{k["value"]}"' if isinstance(k["value"], str) else str(k["value"])
        ts += f"""  {{
    label: "{k['label']}",
    value: {val},
    change: {k['change']},
    changeLabel: "{k['changeLabel']}",
    icon: "{k['icon']}",
  }},
"""
    ts += "];\n\n"

    # Hot Topics
    ts += "export const hotTopics: HotTopic[] = [\n"
    for h in hot_topics:
        ts += f"""  {{
    id: "{h['id']}",
    keyword: "{h['keyword']}",
    count: {h['count']},
    trend: "{h['trend']}",
    relatedMinistry: "{h['relatedMinistry']}",
    category: "{h['category']}",
  }},
"""
    ts += "];\n"

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(ts)

    print(f"\nmock-data.ts 생성 완료: {OUTPUT_FILE}")
    print(f"  국무위원: {len(ministers)}명")
    print(f"  안건: {len(agendas)}건")
    print(f"  종목 영향도: {len(stock_impacts)}건")
    print(f"  회의: {len(meetings)}건")
    print(f"  핫 토픽: {len(hot_topics)}건")
    print(f"\n국무위원 목록:")
    for m in ministers:
        print(f"  {m['name']} ({m['ministry']}) - {m['position']}")


if __name__ == "__main__":
    generate_ts()
