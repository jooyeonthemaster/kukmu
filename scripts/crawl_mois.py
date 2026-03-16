"""
MOIS 국무회의 회의록 크롤러
행정안전부 사이트에서 국무회의 회의록 PDF를 다운로드합니다.
"""

import os
import re
import time
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, parse_qs, urlparse

BASE_URL = "https://www.mois.go.kr"
LIST_URL = f"{BASE_URL}/frt/bbs/type001/commonSelectBoardList.do"
DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "pdfs")
HWPX_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "hwpx")
METADATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "meetings_metadata.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": BASE_URL,
}

session = requests.Session()
session.headers.update(HEADERS)


def ensure_dirs():
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    os.makedirs(HWPX_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(METADATA_FILE), exist_ok=True)


def get_list_page(page_num: int) -> list[dict]:
    """목록 페이지에서 게시글 링크와 제목을 추출합니다."""
    params = {
        "bbsId": "BBSMSTR_000000000430",
        "pageIndex": str(page_num),
    }

    resp = session.get(LIST_URL, params=params, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    items = []
    # table.table_style1 구조 파싱
    rows = soup.select("table.table_style1 tr")
    if not rows:
        rows = soup.select("table tr")

    for row in rows:
        tds = row.find_all("td")
        if not tds:
            continue  # 헤더 행 건너뜀

        link_tag = row.select_one("td a")
        if not link_tag:
            continue

        title = link_tag.get_text(strip=True)

        # 국무회의 회의록만 필터링 (차관회의 제외)
        if "차관회의" in title:
            continue

        # onclick: fn_egov_inqire_notice('124257', 'BBSMSTR_000000000430')
        onclick = link_tag.get("onclick", "")
        href = link_tag.get("href", "")

        detail_url = None
        ntt_id = None

        if onclick:
            # fn_egov_inqire_notice('nttId', 'bbsId') 패턴
            match = re.search(r"fn_egov_inqire_notice\(['\"](\d+)['\"],\s*['\"]([^'\"]+)['\"]", onclick)
            if match:
                ntt_id = match.group(1)
                bbs_id = match.group(2)
                detail_url = f"{BASE_URL}/frt/bbs/type001/commonSelectBoardArticle.do?bbsId={bbs_id}&nttId={ntt_id}"

        if not detail_url and href and href != "#" and "commonSelectBoardArticle" in href:
            detail_url = urljoin(BASE_URL, href)
            parsed = urlparse(href)
            qs = parse_qs(parsed.query)
            ntt_id = qs.get("nttId", [None])[0]

        if detail_url and ntt_id:
            # 날짜 추출 (보통 5번째 td에 있음: 번호, 제목, 첨부, 부서, 날짜, 조회)
            date_str = ""
            for td in tds:
                text = td.get_text(strip=True)
                if re.match(r"\d{4}\.\d{2}\.\d{2}", text):
                    date_str = text.rstrip(".").replace(".", "-")
                    break

            items.append({
                "ntt_id": ntt_id,
                "title": title,
                "detail_url": detail_url,
                "date": date_str,
            })

    return items


def get_detail_page(detail_url: str) -> dict:
    """상세 페이지에서 PDF 다운로드 URL과 회의 정보를 추출합니다."""
    resp = session.get(detail_url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    result = {
        "pdf_urls": [],
        "hwpx_urls": [],
        "content_text": "",
    }

    # 첨부파일 링크 찾기
    file_links = soup.select("a[href*='FileDown.do'], a[onclick*='FileDown'], a[href*='atchFileId']")

    for link in file_links:
        href = link.get("href", "")
        onclick = link.get("onclick", "")
        text = link.get_text(strip=True).lower()

        download_url = None

        if "FileDown.do" in href:
            download_url = urljoin(BASE_URL, href)
        elif "FileDown.do" in onclick:
            match = re.search(r"(\/cmm\/fms\/FileDown\.do\?[^'\"]+)", onclick)
            if match:
                download_url = urljoin(BASE_URL, match.group(1))

        if download_url:
            if ".pdf" in text:
                result["pdf_urls"].append(download_url)
            elif ".hwp" in text:
                result["hwpx_urls"].append(download_url)
            elif "fileSn=1" in download_url:
                # fileSn=1은 보통 PDF
                result["pdf_urls"].append(download_url)
            elif "fileSn=0" in download_url:
                # fileSn=0은 보통 HWPX
                result["hwpx_urls"].append(download_url)
            else:
                # 확장자 불분명 - 둘 다 저장
                result["pdf_urls"].append(download_url)
                result["hwpx_urls"].append(download_url)

    # 본문 텍스트 추출 (iframe 내용 대신 페이지 본문)
    content_div = soup.select_one(".view_con, .board_view, #articleBody, .bbsV_cont")
    if content_div:
        result["content_text"] = content_div.get_text(strip=True)[:2000]

    # 첨부파일이 없는 경우 - 페이지 전체에서 FileDown 패턴 탐색
    if not result["pdf_urls"] and not result["hwpx_urls"]:
        all_links = soup.find_all("a")
        for link in all_links:
            href = link.get("href", "")
            if "FileDown.do" in href or "atchFileId" in href:
                full_url = urljoin(BASE_URL, href)
                link_text = link.get_text(strip=True).lower()
                if "pdf" in link_text:
                    result["pdf_urls"].append(full_url)
                elif "hwp" in link_text:
                    result["hwpx_urls"].append(full_url)
                elif "fileSn=1" in href:
                    result["pdf_urls"].append(full_url)
                elif "fileSn=0" in href:
                    result["hwpx_urls"].append(full_url)
                else:
                    result["hwpx_urls"].append(full_url)

    return result


def download_file(url: str, filename: str, dest_dir: str = None) -> bool:
    """파일을 다운로드합니다 (PDF 또는 HWPX)."""
    if dest_dir is None:
        dest_dir = DOWNLOAD_DIR
    filepath = os.path.join(dest_dir, filename)
    if os.path.exists(filepath):
        print(f"  [SKIP] 이미 존재: {filename}")
        return True

    try:
        resp = session.get(url, timeout=60, stream=True)
        resp.raise_for_status()

        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = os.path.getsize(filepath)
        if file_size < 1000:
            # 너무 작으면 HTML 에러 페이지일 수 있음
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if "<html" in content.lower():
                os.remove(filepath)
                print(f"  [FAIL] HTML 에러 페이지: {filename}")
                return False

        print(f"  [OK] 다운로드 완료: {filename} ({file_size / 1024:.1f} KB)")
        return True

    except Exception as e:
        print(f"  [ERROR] 다운로드 실패: {filename} - {e}")
        return False


def crawl_all(max_pages: int = 5, start_page: int = 1):
    """전체 크롤링 실행 (기본: 최근 5페이지 = 약 50건)"""
    ensure_dirs()

    all_meetings = []
    existing_metadata = {}

    # 기존 메타데이터 로드
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
            existing_metadata = {m["ntt_id"]: m for m in existing_data}

    for page_num in range(start_page, start_page + max_pages):
        print(f"\n{'='*60}")
        print(f"[페이지 {page_num}] 목록 크롤링 중...")
        print(f"{'='*60}")

        try:
            items = get_list_page(page_num)
        except Exception as e:
            print(f"[ERROR] 목록 페이지 {page_num} 크롤링 실패: {e}")
            continue

        if not items:
            print(f"[INFO] 페이지 {page_num}에 항목이 없습니다. 종료합니다.")
            break

        print(f"  -> {len(items)}개 국무회의 회의록 발견")

        for item in items:
            ntt_id = item["ntt_id"]

            # 이미 크롤링한 항목은 건너뜀 (PDF 또는 HWPX 다운로드 완료된 경우)
            if ntt_id in existing_metadata:
                existing = existing_metadata[ntt_id]
                if existing.get("pdf_downloaded") or existing.get("hwpx_downloaded"):
                    print(f"\n[SKIP] {item['title']} (이미 처리됨)")
                    all_meetings.append(existing)
                    continue

            print(f"\n[처리] {item['title']}")
            print(f"  URL: {item['detail_url']}")

            time.sleep(1)  # 예의 바른 크롤링

            try:
                detail = get_detail_page(item["detail_url"])
            except Exception as e:
                print(f"  [ERROR] 상세 페이지 크롤링 실패: {e}")
                item["pdf_downloaded"] = False
                all_meetings.append(item)
                continue

            # PDF 다운로드
            pdf_downloaded = False
            pdf_filenames = []
            for i, pdf_url in enumerate(detail["pdf_urls"]):
                suffix = f"_{i+1}" if len(detail["pdf_urls"]) > 1 else ""
                safe_title = re.sub(r'[<>:"/\\|?*]', '_', item['title'])[:80]
                filename = f"{ntt_id}_{safe_title}{suffix}.pdf"

                if download_file(pdf_url, filename, DOWNLOAD_DIR):
                    pdf_downloaded = True
                    pdf_filenames.append(filename)

                time.sleep(0.5)

            # PDF가 없으면 HWPX 다운로드 시도
            hwpx_downloaded = False
            hwpx_filenames = []
            if not pdf_downloaded and detail["hwpx_urls"]:
                print(f"  [INFO] PDF 없음, HWPX 다운로드 시도...")
                for i, hwpx_url in enumerate(detail["hwpx_urls"]):
                    suffix = f"_{i+1}" if len(detail["hwpx_urls"]) > 1 else ""
                    safe_title = re.sub(r'[<>:"/\\|?*]', '_', item['title'])[:80]
                    filename = f"{ntt_id}_{safe_title}{suffix}.hwpx"

                    if download_file(hwpx_url, filename, HWPX_DIR):
                        hwpx_downloaded = True
                        hwpx_filenames.append(filename)

                    time.sleep(0.5)

            meeting_data = {
                **item,
                "pdf_urls": detail["pdf_urls"],
                "hwpx_urls": detail["hwpx_urls"],
                "pdf_filenames": pdf_filenames,
                "hwpx_filenames": hwpx_filenames,
                "pdf_downloaded": pdf_downloaded,
                "hwpx_downloaded": hwpx_downloaded,
                "content_preview": detail["content_text"][:500],
            }
            all_meetings.append(meeting_data)

        time.sleep(2)  # 페이지 간 대기

    # 메타데이터 저장
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(all_meetings, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"크롤링 완료!")
    print(f"총 {len(all_meetings)}건 처리")
    pdf_count = sum(1 for m in all_meetings if m.get("pdf_downloaded"))
    hwpx_count = sum(1 for m in all_meetings if m.get("hwpx_downloaded"))
    print(f"PDF 다운로드: {pdf_count}건")
    print(f"HWPX 다운로드: {hwpx_count}건")
    print(f"메타데이터 저장: {METADATA_FILE}")
    print(f"PDF 저장 경로: {DOWNLOAD_DIR}")
    print(f"HWPX 저장 경로: {HWPX_DIR}")
    print(f"{'='*60}")

    return all_meetings


if __name__ == "__main__":
    import sys

    max_pages = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    start_page = int(sys.argv[2]) if len(sys.argv) > 2 else 1

    print(f"MOIS 국무회의 회의록 크롤러 시작 (페이지 {start_page}~{start_page + max_pages - 1})")
    crawl_all(max_pages=max_pages, start_page=start_page)
