"""
PDF 없는 회의록에 대해 HWPX 다운로드를 재시도합니다.
기존 meetings_metadata.json에서 pdf_downloaded=false인 항목만 처리합니다.
"""

import os
import re
import time
import json
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://www.mois.go.kr"
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


def get_hwpx_urls(detail_url: str) -> list[str]:
    """상세 페이지에서 HWPX 다운로드 URL을 추출합니다."""
    resp = session.get(detail_url, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    hwpx_urls = []

    # 모든 링크에서 FileDown 패턴 탐색
    all_links = soup.find_all("a")
    for link in all_links:
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
            # HWPX 판별: 텍스트에 hwp 포함, 또는 fileSn=0
            if ".hwp" in text or "fileSn=0" in download_url:
                hwpx_urls.append(download_url)
            elif "FileDown.do" in download_url and ".pdf" not in text:
                # PDF가 아닌 모든 첨부파일도 HWPX로 시도
                hwpx_urls.append(download_url)

    return hwpx_urls


def download_file(url: str, filepath: str) -> bool:
    """파일을 다운로드합니다."""
    if os.path.exists(filepath):
        print(f"  [SKIP] 이미 존재: {os.path.basename(filepath)}")
        return True

    try:
        resp = session.get(url, timeout=60, stream=True)
        resp.raise_for_status()

        with open(filepath, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)

        file_size = os.path.getsize(filepath)
        if file_size < 1000:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if "<html" in content.lower():
                os.remove(filepath)
                print(f"  [FAIL] HTML 에러 페이지")
                return False

        print(f"  [OK] 다운로드 완료: {os.path.basename(filepath)} ({file_size / 1024:.1f} KB)")
        return True

    except Exception as e:
        print(f"  [ERROR] 다운로드 실패: {e}")
        return False


def recrawl_hwpx():
    """PDF 없는 항목에 대해 HWPX를 다운로드합니다."""
    os.makedirs(HWPX_DIR, exist_ok=True)

    # 메타데이터 로드
    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        meetings = json.load(f)

    # PDF 없는 항목 필터링 (이미 HWPX 다운로드한 것도 건너뜀)
    missing = [
        m for m in meetings
        if not m.get("pdf_downloaded") and not m.get("hwpx_downloaded")
    ]

    print(f"PDF/HWPX 없는 항목: {len(missing)}건")
    if not missing:
        print("모든 항목 처리 완료!")
        return

    for i, meeting in enumerate(missing):
        ntt_id = meeting["ntt_id"]
        title = meeting["title"]
        detail_url = meeting["detail_url"]

        print(f"\n[{i+1}/{len(missing)}] {title}")
        print(f"  URL: {detail_url}")

        try:
            hwpx_urls = get_hwpx_urls(detail_url)
        except Exception as e:
            print(f"  [ERROR] 상세 페이지 크롤링 실패: {e}")
            # 연결 리셋 시 더 오래 대기
            if "10054" in str(e) or "ConnectionReset" in str(e):
                print(f"  [WAIT] 서버 차단 감지, 30초 대기...")
                time.sleep(30)
            continue

        if not hwpx_urls:
            print(f"  [WARN] 첨부파일을 찾을 수 없음")
            time.sleep(2)
            continue

        print(f"  HWPX URL 발견: {len(hwpx_urls)}개")

        hwpx_filenames = []
        hwpx_downloaded = False

        for j, url in enumerate(hwpx_urls):
            suffix = f"_{j+1}" if len(hwpx_urls) > 1 else ""
            safe_title = re.sub(r'[<>:"/\\|?*]', '_', title)[:80]
            filename = f"{ntt_id}_{safe_title}{suffix}.hwpx"
            filepath = os.path.join(HWPX_DIR, filename)

            if download_file(url, filepath):
                hwpx_downloaded = True
                hwpx_filenames.append(filename)

            time.sleep(1)

        # 메타데이터 업데이트
        meeting["hwpx_urls"] = hwpx_urls
        meeting["hwpx_filenames"] = hwpx_filenames
        meeting["hwpx_downloaded"] = hwpx_downloaded

        # 매 건마다 저장 (중간 중단 대비)
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(meetings, f, ensure_ascii=False, indent=2)

        time.sleep(3)  # 서버 부하 방지

    # 최종 통계
    pdf_count = sum(1 for m in meetings if m.get("pdf_downloaded"))
    hwpx_count = sum(1 for m in meetings if m.get("hwpx_downloaded"))
    neither = sum(1 for m in meetings if not m.get("pdf_downloaded") and not m.get("hwpx_downloaded"))

    print(f"\n{'='*60}")
    print(f"재크롤링 완료!")
    print(f"PDF: {pdf_count}건 | HWPX: {hwpx_count}건 | 미처리: {neither}건")
    print(f"{'='*60}")


if __name__ == "__main__":
    recrawl_hwpx()
