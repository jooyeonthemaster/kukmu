import { Province, ElectionStats, PartyId, Candidate, Poll, HistoricalResult, ProvinceIssue } from "./election-types";

function c(id: string, name: string, party: PartyId, age: number, inc: boolean, career: string[], pledges: string[]): Candidate {
  return { id, name, party, age, incumbent: inc, career, pledges };
}

function poll(date: string, src: string, size: number, moe: number, results: [string, PartyId, number][]): Poll {
  return { date, source: src, sampleSize: size, marginOfError: moe, results: results.map(([n, p, pct]) => ({ candidateName: n, party: p, percentage: pct })) };
}

function hist(year: number, winner: string, party: PartyId, pct: number, turnout: number): HistoricalResult {
  return { year, winner, party, percentage: pct, turnout };
}

function issue(title: string, cat: string, sev: "critical" | "high" | "medium" | "low"): ProvinceIssue {
  return { title, category: cat, severity: sev };
}

export const provinces: Province[] = [
  {
    code: "11", name: "서울특별시", nameEn: "Seoul", population: 9411000, voterCount: 8120000, councilSeats: 110, leadingParty: "dp",
    candidates: [
      c("11-1", "오세훈", "ppp", 63, true, ["現 서울특별시장", "前 서울시장(2006-2011)"], ["서울 글로벌 금융허브 조성", "GTX-D 신설 추진", "공공임대 10만호 확대"]),
      c("11-2", "우상호", "dp", 64, false, ["現 국회의원(서울 서대문갑)", "前 더불어민주당 원내대표"], ["서울 균형발전 종합계획", "역세권 청년주택 20만호", "서울형 기본소득 도입"]),
      c("11-3", "김선동", "rkp", 58, false, ["前 국회의원", "前 진보정의당 원내대표"], ["부동산 투기 근절", "서울 탈탄소 2035", "소상공인 임대료 상한제"]),
    ],
    polls: [
      poll("2026-03-14", "한국갤럽", 1004, 3.1, [["오세훈", "ppp", 38.2], ["우상호", "dp", 43.5], ["김선동", "rkp", 8.1]]),
      poll("2026-03-10", "리얼미터", 2012, 2.2, [["오세훈", "ppp", 39.8], ["우상호", "dp", 42.1], ["김선동", "rkp", 7.4]]),
      poll("2026-03-05", "한국리서치", 1500, 2.5, [["오세훈", "ppp", 40.1], ["우상호", "dp", 41.8], ["김선동", "rkp", 7.9]]),
      poll("2026-02-28", "엠브레인", 1003, 3.1, [["오세훈", "ppp", 41.5], ["우상호", "dp", 40.2], ["김선동", "rkp", 6.8]]),
      poll("2026-02-20", "NBS", 1200, 2.8, [["오세훈", "ppp", 42.3], ["우상호", "dp", 38.9], ["김선동", "rkp", 7.2]]),
    ],
    history: [hist(2022, "오세훈", "ppp", 59.0, 59.0), hist(2018, "박원순", "dp", 52.8, 60.2), hist(2014, "박원순", "dp", 56.1, 56.8)],
    issues: [issue("전세사기 피해 대책", "주거", "critical"), issue("GTX 개통 지연", "교통", "high"), issue("소상공인 경영난", "경제", "high")],
    keyMunicipalities: ["강남구", "서초구", "송파구", "강서구", "마포구", "영등포구", "노원구", "은평구", "관악구", "성북구"],
  },
  {
    code: "31", name: "경기도", nameEn: "Gyeonggi", population: 13600000, voterCount: 11200000, councilSeats: 142, leadingParty: "dp",
    candidates: [
      c("31-1", "김동연", "dp", 63, true, ["現 경기도지사", "前 경제부총리"], ["경기북도 분도 추진", "반도체 클러스터 완성", "경기 공공의료 확충"]),
      c("31-2", "김은혜", "ppp", 52, false, ["現 국회의원(성남분당갑)", "前 대통령실 홍보수석"], ["경기남부 광역교통망", "신도시 인프라 확충", "경기 산업단지 혁신"]),
    ],
    polls: [
      poll("2026-03-13", "한국갤럽", 1502, 2.5, [["김동연", "dp", 48.2], ["김은혜", "ppp", 36.5]]),
      poll("2026-03-08", "리얼미터", 2500, 2.0, [["김동연", "dp", 47.1], ["김은혜", "ppp", 37.8]]),
      poll("2026-02-25", "한국리서치", 1800, 2.3, [["김동연", "dp", 46.5], ["김은혜", "ppp", 38.2]]),
    ],
    history: [hist(2022, "김동연", "dp", 51.1, 55.7), hist(2018, "이재명", "dp", 56.4, 60.5)],
    issues: [issue("GTX 연장 노선 갈등", "교통", "critical"), issue("반도체 특구 환경영향", "환경", "high"), issue("신도시 학교 부족", "교육", "high")],
    keyMunicipalities: ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "화성시", "남양주시", "평택시", "의정부시"],
  },
  {
    code: "21", name: "부산광역시", nameEn: "Busan", population: 3350000, voterCount: 2870000, councilSeats: 47, leadingParty: "ppp",
    candidates: [
      c("21-1", "박형준", "ppp", 61, true, ["現 부산광역시장", "前 부산대 교수"], ["가덕도 신공항 2030 완공", "북항 재개발 2단계", "부산 해양수도 비전"]),
      c("21-2", "김영춘", "dp", 68, false, ["前 해양수산부 장관", "前 국회의원"], ["부산 청년 정착 지원금", "도시철도 2호선 연장", "부산항 물류 혁신"]),
    ],
    polls: [
      poll("2026-03-12", "한국갤럽", 803, 3.5, [["박형준", "ppp", 46.8], ["김영춘", "dp", 38.2]]),
      poll("2026-03-06", "리얼미터", 1505, 2.5, [["박형준", "ppp", 45.1], ["김영춘", "dp", 39.5]]),
      poll("2026-02-22", "NBS", 1001, 3.1, [["박형준", "ppp", 47.2], ["김영춘", "dp", 36.8]]),
    ],
    history: [hist(2022, "박형준", "ppp", 64.7, 52.1), hist(2018, "오거돈", "dp", 52.2, 55.3)],
    issues: [issue("가덕도 신공항 진척도", "교통", "critical"), issue("인구 감소 대응", "인구", "high"), issue("북항 재개발 지연", "도시개발", "medium")],
    keyMunicipalities: ["해운대구", "부산진구", "동래구", "남구", "북구", "사하구", "금정구", "연제구"],
  },
  {
    code: "22", name: "대구광역시", nameEn: "Daegu", population: 2385000, voterCount: 2020000, councilSeats: 30, leadingParty: "ppp",
    candidates: [
      c("22-1", "홍준표", "ppp", 72, true, ["現 대구광역시장", "前 자유한국당 대표"], ["대구 메가시티 추진", "대구경북 통합 신공항", "대구 첨단산업 유치"]),
      c("22-2", "권영진", "dp", 62, false, ["前 대구시장", "시민단체 활동가"], ["대구 청년 일자리 5만개", "도시 녹화 프로젝트", "대구형 복지 확대"]),
    ],
    polls: [
      poll("2026-03-11", "한국갤럽", 602, 4.0, [["홍준표", "ppp", 52.3], ["권영진", "dp", 28.5]]),
      poll("2026-03-03", "리얼미터", 1203, 2.8, [["홍준표", "ppp", 50.8], ["권영진", "dp", 30.1]]),
    ],
    history: [hist(2022, "홍준표", "ppp", 65.7, 50.8), hist(2018, "권영진", "ppp", 69.7, 54.2)],
    issues: [issue("대구경북 통합 논의", "행정", "high"), issue("대구 산업구조 전환", "경제", "high"), issue("노후 주거지 재개발", "도시개발", "medium")],
    keyMunicipalities: ["수성구", "달서구", "북구", "중구", "동구", "남구", "달성군"],
  },
  {
    code: "23", name: "인천광역시", nameEn: "Incheon", population: 2980000, voterCount: 2510000, councilSeats: 37, leadingParty: "dp",
    candidates: [
      c("23-1", "유정복", "ppp", 68, true, ["現 인천광역시장", "前 인천시장(2014-2018)"], ["인천 MICE 산업 육성", "수도권 제2외곽순환도로", "인천 바이오 클러스터"]),
      c("23-2", "박남춘", "dp", 65, false, ["前 인천광역시장", "前 국회의원"], ["인천시민 교통복지카드", "영종 복합리조트 정상화", "인천 스마트시티 2030"]),
    ],
    polls: [
      poll("2026-03-13", "한국갤럽", 703, 3.7, [["유정복", "ppp", 37.5], ["박남춘", "dp", 44.1]]),
      poll("2026-03-05", "리얼미터", 1402, 2.6, [["유정복", "ppp", 38.8], ["박남춘", "dp", 42.5]]),
    ],
    history: [hist(2022, "유정복", "ppp", 57.2, 52.4), hist(2018, "박남춘", "dp", 52.5, 57.1)],
    issues: [issue("영종도 개발 지연", "도시개발", "high"), issue("검단신도시 인프라", "교통", "high"), issue("인천공항 소음 피해", "환경", "medium")],
    keyMunicipalities: ["남동구", "부평구", "서구", "연수구", "중구", "미추홀구", "계양구"],
  },
  {
    code: "24", name: "광주광역시", nameEn: "Gwangju", population: 1441000, voterCount: 1210000, councilSeats: 22, leadingParty: "dp",
    candidates: [
      c("24-1", "강기정", "dp", 61, true, ["現 광주광역시장", "前 대통령비서실 정무수석"], ["AI 집적단지 조성", "광주형 일자리 2.0", "광주 문화수도 비전"]),
      c("24-2", "이정현", "ppp", 58, false, ["前 국회의원", "前 새누리당 대표"], ["광주 경제자유구역 확대", "광주-목포 초고속철", "기업유치 인센티브 강화"]),
    ],
    polls: [
      poll("2026-03-10", "한국갤럽", 503, 4.4, [["강기정", "dp", 62.8], ["이정현", "ppp", 12.3]]),
      poll("2026-02-28", "리얼미터", 1003, 3.1, [["강기정", "dp", 60.5], ["이정현", "ppp", 13.8]]),
    ],
    history: [hist(2022, "강기정", "dp", 61.3, 48.5), hist(2018, "이용섭", "dp", 79.9, 52.1)],
    issues: [issue("AI 산업단지 인력난", "경제", "high"), issue("광주형 일자리 성과", "고용", "medium"), issue("도심 공동화 현상", "도시", "medium")],
    keyMunicipalities: ["서구", "북구", "광산구", "남구", "동구"],
  },
  {
    code: "25", name: "대전광역시", nameEn: "Daejeon", population: 1452000, voterCount: 1230000, councilSeats: 22, leadingParty: "dp",
    candidates: [
      c("25-1", "이장우", "ppp", 66, true, ["現 대전광역시장", "前 국회의원(대전 동구)"], ["대전 과학벨트 완성", "대전도시철도 2호선", "대전 스마트시티"]),
      c("25-2", "허태정", "dp", 62, false, ["前 대전광역시장", "前 대전시 정무부시장"], ["대전 R&D 특구 확대", "세종-대전 광역교통망", "청년과학자 정착금"]),
    ],
    polls: [
      poll("2026-03-12", "한국갤럽", 503, 4.4, [["이장우", "ppp", 35.2], ["허태정", "dp", 44.8]]),
      poll("2026-03-01", "리얼미터", 1003, 3.1, [["이장우", "ppp", 36.5], ["허태정", "dp", 43.1]]),
    ],
    history: [hist(2022, "이장우", "ppp", 52.5, 50.2), hist(2018, "허태정", "dp", 52.7, 55.3)],
    issues: [issue("도시철도 2호선 트램", "교통", "high"), issue("대덕연구단지 노후화", "과학기술", "medium"), issue("원도심 재생", "도시개발", "medium")],
    keyMunicipalities: ["서구", "유성구", "대덕구", "중구", "동구"],
  },
  {
    code: "26", name: "울산광역시", nameEn: "Ulsan", population: 1121000, voterCount: 945000, councilSeats: 22, leadingParty: "ppp",
    candidates: [
      c("26-1", "김두겸", "ppp", 66, true, ["現 울산광역시장", "前 울산 남구청장"], ["울산 수소경제 수도", "태화강 생태관광벨트", "울산 문화예술회관 건립"]),
      c("26-2", "송철호", "dp", 65, false, ["前 울산광역시장", "前 울산지방법원 판사"], ["울산 탈석유 전환", "노동자 복지센터 확대", "울산형 그린뉴딜"]),
    ],
    polls: [
      poll("2026-03-08", "한국갤럽", 503, 4.4, [["김두겸", "ppp", 44.5], ["송철호", "dp", 38.2]]),
    ],
    history: [hist(2022, "김두겸", "ppp", 50.2, 52.8), hist(2018, "송철호", "dp", 49.8, 57.2)],
    issues: [issue("현대차 전환 고용불안", "고용", "critical"), issue("석유화학 탈탄소", "환경", "high"), issue("인구유출 심화", "인구", "medium")],
    keyMunicipalities: ["남구", "중구", "동구", "북구", "울주군"],
  },
  {
    code: "29", name: "세종특별자치시", nameEn: "Sejong", population: 388000, voterCount: 310000, councilSeats: 18, leadingParty: "dp",
    candidates: [
      c("29-1", "최민호", "ppp", 55, true, ["現 세종특별자치시장", "前 행정안전부 차관"], ["세종 행정수도 완성", "세종 BRT 고도화", "스마트시티 리빙랩"]),
      c("29-2", "이춘희", "dp", 70, false, ["前 세종특별자치시장", "前 연기군수"], ["세종 완전한 행정수도", "세종 대학 유치", "자족도시 인프라 확충"]),
    ],
    polls: [
      poll("2026-03-09", "리얼미터", 503, 4.4, [["최민호", "ppp", 34.8], ["이춘희", "dp", 46.2]]),
    ],
    history: [hist(2022, "최민호", "ppp", 50.9, 55.1), hist(2018, "이춘희", "dp", 55.3, 60.2)],
    issues: [issue("행정수도 이전 완성도", "행정", "critical"), issue("생활인프라 부족", "도시", "high"), issue("교통 혼잡 심화", "교통", "high")],
    keyMunicipalities: ["한솔동", "새롬동", "도담동", "아름동", "종촌동"],
  },
  {
    code: "32", name: "강원특별자치도", nameEn: "Gangwon", population: 1538000, voterCount: 1310000, councilSeats: 42, leadingParty: "ppp",
    candidates: [
      c("32-1", "김진태", "ppp", 62, true, ["現 강원특별자치도지사", "前 국회의원(춘천)"], ["강원 관광메카 비전", "레고랜드 정상화", "강원 특별자치도 완성"]),
      c("32-2", "최문순", "dp", 68, false, ["前 강원도지사", "前 MBC 사장"], ["강원 청년 U턴 프로젝트", "동해안 에너지 자립", "강원 유기농 특구"]),
    ],
    polls: [
      poll("2026-03-11", "한국갤럽", 503, 4.4, [["김진태", "ppp", 44.2], ["최문순", "dp", 40.5]]),
    ],
    history: [hist(2022, "김진태", "ppp", 55.8, 54.2), hist(2018, "최문순", "dp", 51.3, 58.5)],
    issues: [issue("레고랜드 재정 건전성", "재정", "critical"), issue("동계올림픽 시설 활용", "관광", "high"), issue("산간지역 의료공백", "의료", "medium")],
    keyMunicipalities: ["춘천시", "원주시", "강릉시", "속초시", "동해시", "삼척시", "태백시"],
  },
  {
    code: "33", name: "충청북도", nameEn: "Chungbuk", population: 1600000, voterCount: 1350000, councilSeats: 33, leadingParty: "ppp",
    candidates: [
      c("33-1", "김영환", "ppp", 62, true, ["現 충청북도지사", "前 국회의원(청주)"], ["오송 바이오밸리 확대", "충북 반도체 생태계", "충청권 메가시티"]),
      c("33-2", "노영민", "dp", 66, false, ["前 대통령비서실장", "前 국회의원(청주)"], ["청주 도시재생 뉴딜", "충북 의료원 확충", "농업 스마트팜 혁신"]),
    ],
    polls: [
      poll("2026-03-10", "리얼미터", 703, 3.7, [["김영환", "ppp", 40.2], ["노영민", "dp", 43.8]]),
    ],
    history: [hist(2022, "김영환", "ppp", 51.2, 52.5), hist(2018, "이시종", "dp", 61.4, 56.8)],
    issues: [issue("오송 참사 후속 대책", "안전", "critical"), issue("바이오산업 인력양성", "경제", "high"), issue("청주 도심 교통체증", "교통", "medium")],
    keyMunicipalities: ["청주시", "충주시", "제천시", "음성군", "진천군"],
  },
  {
    code: "34", name: "충청남도", nameEn: "Chungnam", population: 2120000, voterCount: 1780000, councilSeats: 40, leadingParty: "ppp",
    candidates: [
      c("34-1", "김태흠", "ppp", 55, true, ["現 충청남도지사", "前 국회의원(보령서천)"], ["충남 배터리 밸리", "서해안 관광벨트", "내포신도시 자족기능"]),
      c("34-2", "양승조", "dp", 63, false, ["前 충청남도지사", "前 국회의원"], ["충남 탈석탄 전환", "농어촌 의료 공공성", "충남 스마트농업 특구"]),
    ],
    polls: [
      poll("2026-03-09", "한국갤럽", 603, 4.0, [["김태흠", "ppp", 41.5], ["양승조", "dp", 42.8]]),
    ],
    history: [hist(2022, "김태흠", "ppp", 55.2, 53.1), hist(2018, "양승조", "dp", 54.8, 57.5)],
    issues: [issue("화력발전소 미세먼지", "환경", "critical"), issue("배터리 산업 유치 경쟁", "경제", "high"), issue("서산-태안 교통 열악", "교통", "medium")],
    keyMunicipalities: ["천안시", "아산시", "서산시", "당진시", "논산시", "공주시", "보령시"],
  },
  {
    code: "35", name: "전북특별자치도", nameEn: "Jeonbuk", population: 1786000, voterCount: 1520000, councilSeats: 37, leadingParty: "dp",
    candidates: [
      c("35-1", "김관영", "dp", 55, true, ["現 전북특별자치도지사", "前 국회의원(군산)"], ["전북 특별자치도 규제특례", "새만금 투자 유치", "전북 수소경제 거점"]),
      c("35-2", "박태완", "ppp", 58, false, ["前 전주시 부시장", "기업인 출신"], ["새만금 산업단지 조기 분양", "전북 기업하기 좋은 환경", "전주 한옥마을 관광벨트"]),
    ],
    polls: [
      poll("2026-03-08", "리얼미터", 603, 4.0, [["김관영", "dp", 55.2], ["박태완", "ppp", 20.8]]),
    ],
    history: [hist(2022, "김관영", "dp", 65.2, 50.5), hist(2018, "송하진", "dp", 69.2, 55.2)],
    issues: [issue("새만금 개발 진척도", "개발", "critical"), issue("인구 감소 위기", "인구", "critical"), issue("특별자치도 성과", "행정", "high")],
    keyMunicipalities: ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시"],
  },
  {
    code: "36", name: "전라남도", nameEn: "Jeonnam", population: 1832000, voterCount: 1560000, councilSeats: 52, leadingParty: "dp",
    candidates: [
      c("36-1", "김영록", "dp", 68, true, ["現 전라남도지사", "前 농림축산식품부 장관"], ["전남 블루이코노미", "목포 해양관광도시", "전남 농생명 실리콘밸리"]),
      c("36-2", "문충운", "ppp", 56, false, ["前 여수시 부시장", "해양 전문가"], ["전남 해양수산 신성장", "광양만권 산업 고도화", "여수 관광특구 확대"]),
    ],
    polls: [
      poll("2026-03-07", "한국갤럽", 503, 4.4, [["김영록", "dp", 61.5], ["문충운", "ppp", 14.2]]),
    ],
    history: [hist(2022, "김영록", "dp", 73.2, 48.8), hist(2018, "김영록", "dp", 81.4, 52.5)],
    issues: [issue("인구소멸 위기 군 증가", "인구", "critical"), issue("농촌 고령화", "복지", "critical"), issue("전남 의료 공백", "의료", "high")],
    keyMunicipalities: ["목포시", "여수시", "순천시", "광양시", "나주시", "무안군"],
  },
  {
    code: "37", name: "경상북도", nameEn: "Gyeongbuk", population: 2626000, voterCount: 2230000, councilSeats: 57, leadingParty: "ppp",
    candidates: [
      c("37-1", "이철우", "ppp", 70, true, ["現 경상북도지사", "前 국회의원(김천)"], ["경북 첨단 반도체 벨트", "포항 이차전지 허브", "경북 스마트농업 혁신"]),
      c("37-2", "오중기", "dp", 58, false, ["前 포항시 부시장", "시민운동가"], ["경북 균형발전 프로젝트", "포항 지진 완전 복구", "경북 청년 농업인 육성"]),
    ],
    polls: [
      poll("2026-03-10", "리얼미터", 803, 3.5, [["이철우", "ppp", 53.8], ["오중기", "dp", 25.1]]),
    ],
    history: [hist(2022, "이철우", "ppp", 70.6, 49.2), hist(2018, "이철우", "ppp", 50.7, 54.8)],
    issues: [issue("포항 지진 피해 복구", "안전", "high"), issue("경북 북부 소멸위기", "인구", "critical"), issue("울진 원전 안전성", "에너지", "high")],
    keyMunicipalities: ["포항시", "구미시", "경산시", "경주시", "안동시", "김천시", "영주시"],
  },
  {
    code: "38", name: "경상남도", nameEn: "Gyeongnam", population: 3314000, voterCount: 2780000, councilSeats: 52, leadingParty: "ppp",
    candidates: [
      c("38-1", "박완수", "ppp", 62, true, ["現 경상남도지사", "前 국회의원(창원의창)"], ["경남 우주항공산업 허브", "진해 군항도시 재생", "경남 스마트제조 혁신"]),
      c("38-2", "김경수", "dp", 55, false, ["前 경상남도지사", "前 국회의원(김해)"], ["경남 제조업 혁신 2.0", "창원 메가시티", "경남 교육여건 개선"]),
    ],
    polls: [
      poll("2026-03-11", "한국갤럽", 703, 3.7, [["박완수", "ppp", 45.2], ["김경수", "dp", 39.8]]),
    ],
    history: [hist(2022, "박완수", "ppp", 58.5, 51.8), hist(2018, "김경수", "dp", 52.7, 56.2)],
    issues: [issue("조선업 구조조정", "경제", "critical"), issue("거제·통영 인구감소", "인구", "high"), issue("경남 광역교통 미비", "교통", "high")],
    keyMunicipalities: ["창원시", "김해시", "진주시", "양산시", "거제시", "통영시", "사천시"],
  },
  {
    code: "39", name: "제주특별자치도", nameEn: "Jeju", population: 676000, voterCount: 540000, councilSeats: 41, leadingParty: "dp",
    candidates: [
      c("39-1", "오영훈", "dp", 53, true, ["現 제주특별자치도지사", "前 국회의원(제주시갑)"], ["제주 탄소제로 섬 2030", "제2공항 주민합의", "제주 관광 질적 성장"]),
      c("39-2", "고충홍", "ppp", 60, false, ["前 제주도 행정부지사", "前 국토부 국장"], ["제주 제2공항 조기 착공", "제주 물류비 절감", "제주 IT산업 유치"]),
    ],
    polls: [
      poll("2026-03-09", "리얼미터", 503, 4.4, [["오영훈", "dp", 48.5], ["고충홍", "ppp", 32.1]]),
    ],
    history: [hist(2022, "오영훈", "dp", 55.0, 54.2), hist(2018, "원희룡", "ppp", 52.0, 60.5)],
    issues: [issue("제2공항 찬반 갈등", "교통", "critical"), issue("관광객 오버투어리즘", "관광", "high"), issue("지하수 오염 우려", "환경", "high")],
    keyMunicipalities: ["제주시", "서귀포시"],
  },
];

export function getElectionStats(): ElectionStats {
  const now = new Date();
  const election = new Date(2026, 5, 3);
  const diff = Math.ceil((election.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    totalProvinces: provinces.length,
    totalCandidates: provinces.reduce((sum, p) => sum + p.candidates.length, 0),
    totalPolls: provinces.reduce((sum, p) => sum + p.polls.length, 0),
    averageTurnout2022: 52.7,
    electionDate: "2026-06-03",
    dDay: diff,
  };
}

export function getProvinceByCode(code: string): Province | undefined {
  return provinces.find(p => p.code === code);
}

export const PROVINCE_CODE_MAP: Record<string, string> = {
  "서울특별시": "11", "서울": "11",
  "부산광역시": "21", "부산": "21",
  "대구광역시": "22", "대구": "22",
  "인천광역시": "23", "인천": "23",
  "광주광역시": "24", "광주": "24",
  "대전광역시": "25", "대전": "25",
  "울산광역시": "26", "울산": "26",
  "세종특별자치시": "29", "세종": "29",
  "경기도": "31", "경기": "31",
  "강원도": "32", "강원특별자치도": "32", "강원": "32",
  "충청북도": "33", "충북": "33",
  "충청남도": "34", "충남": "34",
  "전라북도": "35", "전북특별자치도": "35", "전북": "35",
  "전라남도": "36", "전남": "36",
  "경상북도": "37", "경북": "37",
  "경상남도": "38", "경남": "38",
  "제주특별자치도": "39", "제주": "39",
};
