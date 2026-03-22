export const ELECTION_KEYWORDS = [
  "지방선거", "6.3 선거", "전국동시지방선거", "광역단체장", "기초단체장",
  "국무회의", "국무위원", "정책 발표", "정부 정책",
  "여론조사", "지지율", "출구조사",
  "서울시장", "부산시장", "대구시장", "인천시장", "광주시장",
  "대전시장", "울산시장", "세종시장", "경기도지사", "강원도지사",
  "충북지사", "충남지사", "전북지사", "전남지사", "경북지사", "경남지사", "제주지사",
];

export const PROVINCE_CODES: Record<string, string> = {
  "서울": "seoul", "부산": "busan", "대구": "daegu", "인천": "incheon",
  "광주": "gwangju", "대전": "daejeon", "울산": "ulsan", "세종": "sejong",
  "경기": "gyeonggi", "강원": "gangwon", "충북": "chungbuk", "충남": "chungnam",
  "전북": "jeonbuk", "전남": "jeonnam", "경북": "gyeongbuk", "경남": "gyeongnam",
  "제주": "jeju",
};

export const PROVINCE_CODE_TO_NAME: Record<string, string> = {
  seoul: "서울", busan: "부산", daegu: "대구", incheon: "인천",
  gwangju: "광주", daejeon: "대전", ulsan: "울산", sejong: "세종",
  gyeonggi: "경기", gangwon: "강원", chungbuk: "충북", chungnam: "충남",
  jeonbuk: "전북", jeonnam: "전남", gyeongbuk: "경북", gyeongnam: "경남",
  jeju: "제주",
};

/**
 * District search query templates.
 * {district} is replaced with the district name (e.g. "강남구").
 * {province} is replaced with the province name (e.g. "서울").
 */
export const DISTRICT_QUERY_TEMPLATES = [
  "{province} {district} 구청장 선거 2026",
  "{district} 지역 이슈",
  "{district} 주요 현안",
];

/**
 * Province codes that should have district-level collection in the automated pipeline.
 * These are the major cities with many districts.
 */
export const DISTRICT_COLLECTION_PROVINCES = [
  "seoul", "busan", "incheon", "daegu",
];

/**
 * Generate district-level search keywords from a list of district names for a province.
 * Returns an array of search queries ready for the Naver API.
 */
export function generateDistrictKeywords(
  provinceName: string,
  districtNames: string[],
): string[] {
  const keywords: string[] = [];
  for (const district of districtNames) {
    for (const template of DISTRICT_QUERY_TEMPLATES) {
      keywords.push(
        template
          .replace("{province}", provinceName)
          .replace("{district}", district),
      );
    }
  }
  return keywords;
}

export const RSS_FEEDS = [
  { name: "조선일보 정치", url: "http://www.chosun.com/site/data/rss/politics.xml" },
  { name: "중앙일보 정치", url: "http://rss.joins.com/joins_politics_list.xml" },
  { name: "동아일보 정치", url: "http://rss.donga.com/politics.xml" },
  { name: "한겨레", url: "https://www.hani.co.kr/rss/" },
  { name: "경향신문", url: "http://www.khan.co.kr/rss/rssdata/total_news.xml" },
  { name: "연합뉴스 정치", url: "https://www.yna.co.kr/rss/politics.xml" },
  { name: "SBS 정치", url: "http://api.sbs.co.kr/xml/news/rss.jsp?pmDiv=politics" },
  { name: "MBC 정치", url: "http://imnews.imbc.com/rss/politics.xml" },
  { name: "오마이뉴스", url: "https://rss.ohmynews.com/rss/ohmynews.xml" },
  { name: "프레시안", url: "http://www.pressian.com/rss/rss.xml" },
  { name: "한국일보", url: "http://rss.hankooki.com/news/hk00_list.xml" },
  { name: "세계일보", url: "http://rss.segye.com/segye_recent.xml" },
  { name: "정책브리핑", url: "https://www.korea.kr/rss/policy.xml" },
  { name: "구글뉴스 지방선거", url: "https://news.google.com/rss/search?q=지방선거&hl=ko&gl=KR&ceid=KR:ko" },
  { name: "구글뉴스 국무회의", url: "https://news.google.com/rss/search?q=국무회의&hl=ko&gl=KR&ceid=KR:ko" },
];
