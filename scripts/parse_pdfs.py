"""
국무회의 회의록 통합 파서
다운로드된 PDF와 HWPX에서 회의 정보, 참석자, 안건을 추출합니다.
"""

import os
import re
import json
import zipfile
from xml.etree import ElementTree as ET

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

PDF_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "pdfs")
HWPX_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "hwpx")
METADATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "meetings_metadata.json")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "parsed_meetings.json")

# 국무위원 부처 매핑
MINISTRY_MAP = {
    "국무총리": "국무총리실",
    "기획재정부장관": "기획재정부",
    "교육부장관": "교육부",
    "과학기술정보통신부장관": "과학기술정보통신부",
    "통일부장관": "통일부",
    "외교부장관": "외교부",
    "국방부장관": "국방부",
    "법무부장관": "법무부",
    "국가보훈부장관": "국가보훈부",
    "행정안전부장관": "행정안전부",
    "농림축산식품부장관": "농림축산식품부",
    "문화체육관광부장관": "문화체육관광부",
    "보건복지부장관": "보건복지부",
    "산업통상부장관": "산업통상자원부",
    "산업통상자원부장관": "산업통상자원부",
    "고용노동부장관": "고용노동부",
    "기후에너지환경부장관": "기후에너지환경부",
    "환경부장관": "환경부",
    "국토교통부장관": "국토교통부",
    "성평등가족부장관": "성평등가족부",
    "여성가족부장관": "여성가족부",
    "중소벤처기업부장관": "중소벤처기업부",
    "해양수산부장관": "해양수산부",
    "부총리겸기획재정부장관": "기획재정부",
    "부총리겸교육부장관": "교육부",
    "부총리겸과학기술정보통신부장관": "과학기술정보통신부",
}


def extract_meeting_info(text: str) -> dict:
    """회의 기본 정보 추출 (회차, 날짜, 장소)"""
    info = {
        "meeting_number": None,
        "year": None,
        "date": None,
        "location": None,
        "duration": None,
    }

    # 회차 추출: 제48회 국무회의
    match = re.search(r"제(\d+)회\s*국무회의", text)
    if match:
        info["meeting_number"] = int(match.group(1))

    # 연도 추출
    match = re.search(r"(\d{4})년도\s*제\d+회", text)
    if match:
        info["year"] = int(match.group(1))

    # 날짜 추출: 2025. 11. 4.(화), 14:00 ~ 16:07
    match = re.search(r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*\([월화수목금토일]\)", text)
    if match:
        y, m, d = match.group(1), match.group(2).zfill(2), match.group(3).zfill(2)
        info["date"] = f"{y}-{m}-{d}"

    # 시간 추출
    match = re.search(r"(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})", text)
    if match:
        info["duration"] = f"{match.group(1)} ~ {match.group(2)}"

    # 장소
    match = re.search(r"장\s*소\s*[:：]\s*(.+?)(?:\n|$)", text)
    if match:
        info["location"] = match.group(1).strip()

    return info


def extract_attendees(text: str) -> list[dict]:
    """참석자 명단 추출"""
    attendees = []
    seen = set()

    # 패턴: 직책+이름+○/×/△
    # 예: 국무총리김민석○, 외교부장관조현○
    patterns = [
        # "부총리겸기획재정부장관구윤철○" 패턴
        r"(부총리겸[가-힣]+부장관)\s*([가-힣]{2,4})\s*([○×△])",
        # "국무총리김민석○" 패턴
        r"(국무총리)\s*([가-힣]{2,4})\s*([○×△])",
        # "외교부장관조현○" 패턴
        r"([가-힣]+부장관)\s*([가-힣]{2,4})\s*([○×△])",
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, text):
            position = match.group(1).strip()
            name = match.group(2).strip()
            status = match.group(3)

            if name in seen:
                continue
            seen.add(name)

            ministry = MINISTRY_MAP.get(position, position)

            attendees.append({
                "name": name,
                "position": position,
                "ministry": ministry,
                "present": status == "○",
                "delegate": status == "△",
            })

    return attendees


def extract_agendas(text: str) -> list[dict]:
    """상정 안건 추출"""
    agendas = []

    # 상정안건 수 추출
    match = re.search(r"상정안건\s*[:：]\s*총\s*(\d+)\s*건", text)
    total = int(match.group(1)) if match else 0

    # 안건 분류 추출: 법률공포안73건, 대통령령안3건, 일반안1건, 부처보고3건
    categories = {}
    cat_match = re.search(r"▢\s*(법률공포안\d+건.*?)(?:\n|$)", text)
    if cat_match:
        cat_text = cat_match.group(1)
        for cm in re.finditer(r"([가-힣]+안?)\s*(\d+)\s*건", cat_text):
            categories[cm.group(1)] = int(cm.group(2))

    # 부처보고 내용 추출
    report_sections = re.finditer(
        r"([가-힣]+부|국방부|외교부|산업부|교육부|환경부|보건복지부|국토교통부|기획재정부|과기부|행안부|농식품부|문체부|고용부|해수부|중기부|법무부|통일부)\s*\n((?:Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|\d+)\.\s*.+?)(?=(?:[가-힣]+부\s*\n(?:Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|\d+)\.)|\Z)",
        text,
        re.DOTALL
    )

    for section in report_sections:
        ministry = section.group(1)
        content = section.group(2)

        # 보고 제목 추출
        titles = re.findall(r"(?:Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|\d+)\.\s*(.+?)(?:\n|$)", content)
        for title in titles:
            title = title.strip()
            if len(title) > 5 and not title.startswith("□"):
                agendas.append({
                    "title": title,
                    "ministry": ministry,
                    "type": "부처보고",
                })

    # 의안 번호 기반 추출: 의안번호 제XXXXX호
    bill_matches = re.finditer(
        r"(?:의안번호\s*)?제?\s*(\d+)\s*호?\s*\n?\s*(.+?)(?:\n|$)",
        text
    )

    # 법률공포안/대통령령안 제목 추출
    law_matches = re.finditer(
        r"[◇◆●▶]\s*(.+?(?:법|령|안|규칙))\s*(?:일부개정|전부개정|제정|공포)?",
        text
    )
    for m in law_matches:
        title = m.group(1).strip()
        if len(title) > 3:
            agendas.append({
                "title": title,
                "ministry": "",
                "type": "법률안",
            })

    return {
        "total": total,
        "categories": categories,
        "items": agendas[:30],  # 최대 30개
    }


def extract_key_statements(text: str) -> list[dict]:
    """주요 발언 추출 (모두말씀, 부처보고 관련)"""
    statements = []

    # 모두 말씀 추출
    modu_match = re.search(
        r"(?:모두\s*말씀|모두발언)\s*\n(.+?)(?=▢|부처보고|상정안건)",
        text,
        re.DOTALL
    )
    if modu_match:
        modu_text = modu_match.group(1).strip()
        # 핵심 문장 추출 (마침표 기준)
        sentences = re.split(r"(?<=[.。])\s", modu_text)
        key_sentences = [s.strip() for s in sentences if len(s.strip()) > 20][:5]
        if key_sentences:
            statements.append({
                "speaker": "대통령",
                "type": "모두말씀",
                "content": " ".join(key_sentences)[:500],
            })

    # 부처보고 요약 추출
    report_pattern = re.compile(
        r"(?:보\s*고\s*[:：]|ᄋ\s*보\s*고\s*[:：])\s*(.+?)(?:\n|$)"
    )
    for match in report_pattern.finditer(text):
        reporters = match.group(1).strip()
        statements.append({
            "speaker": reporters,
            "type": "부처보고",
            "content": reporters,
        })

    return statements


def extract_text_from_hwpx(filepath: str) -> str:
    """HWPX 파일에서 텍스트를 추출합니다."""
    try:
        with zipfile.ZipFile(filepath, "r") as zf:
            file_list = zf.namelist()
            section_files = sorted([
                f for f in file_list
                if re.match(r"Contents/section\d+\.xml", f)
            ])
            if not section_files:
                section_files = sorted([
                    f for f in file_list
                    if "section" in f.lower() and f.endswith(".xml")
                ])

            all_text = []
            for section_file in section_files:
                xml_data = zf.read(section_file)
                # 정규식으로 <t> 태그 내용 추출 (가장 안정적)
                xml_str = xml_data.decode("utf-8", errors="ignore")
                t_matches = re.findall(r"<[^>]*:t[^>]*>([^<]+)</[^>]*:t>", xml_str)
                if not t_matches:
                    t_matches = re.findall(r"<t[^>]*>([^<]+)</t>", xml_str)
                if t_matches:
                    all_text.append("\n".join(t_matches))

            return "\n\n".join(all_text)
    except Exception as e:
        print(f"  [ERROR] HWPX 텍스트 추출 실패: {e}")
        return ""


def parse_text(full_text: str, filename: str, source_type: str = "pdf") -> dict:
    """텍스트에서 회의 정보를 추출합니다 (PDF/HWPX 공용)."""
    meeting_info = extract_meeting_info(full_text)
    attendees = extract_attendees(full_text)
    agendas = extract_agendas(full_text)
    statements = extract_key_statements(full_text)

    return {
        "filename": filename,
        "source_type": source_type,
        "meeting_info": meeting_info,
        "attendees": attendees,
        "agendas": agendas,
        "statements": statements,
        "text_length": len(full_text),
        "full_text": full_text,
    }


def parse_pdf(filepath: str) -> dict:
    """PDF 파일 하나를 파싱합니다."""
    if fitz is None:
        raise ImportError("PyMuPDF (fitz) is not installed")
    doc = fitz.open(filepath)
    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n"
    total_pages = len(doc)
    doc.close()

    result = parse_text(full_text, os.path.basename(filepath), "pdf")
    result["total_pages"] = total_pages
    return result


def parse_hwpx(filepath: str) -> dict:
    """HWPX 파일 하나를 파싱합니다."""
    full_text = extract_text_from_hwpx(filepath)
    result = parse_text(full_text, os.path.basename(filepath), "hwpx")
    return result


def parse_all():
    """메타데이터 기반으로 모든 PDF+HWPX를 파싱합니다."""
    # 메타데이터 로드
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            meetings = json.load(f)
    else:
        meetings = []

    # PDF만 있는 경우 기존 방식으로 파싱
    if not meetings:
        if not os.path.exists(PDF_DIR):
            print(f"PDF 디렉토리가 없습니다: {PDF_DIR}")
            return []
        pdf_files = sorted([f for f in os.listdir(PDF_DIR) if f.endswith(".pdf")])
        for pdf_file in pdf_files:
            meetings.append({"pdf_filenames": [pdf_file], "pdf_downloaded": True})

    # 파싱할 항목 수집
    parse_items = []
    for m in meetings:
        if m.get("pdf_downloaded") and m.get("pdf_filenames"):
            # PDF 우선 (첫 번째 파일만 사용, 나머지는 HWPX일 수 있음)
            for fname in m["pdf_filenames"]:
                filepath = os.path.join(PDF_DIR, fname)
                if os.path.exists(filepath):
                    parse_items.append(("pdf", filepath, m))
                    break
        elif m.get("hwpx_downloaded") and m.get("hwpx_filenames"):
            for fname in m["hwpx_filenames"]:
                filepath = os.path.join(HWPX_DIR, fname)
                if os.path.exists(filepath):
                    parse_items.append(("hwpx", filepath, m))
                    break

    print(f"총 {len(parse_items)}개 파일 파싱 예정 (PDF+HWPX)")

    results = []
    for i, (ftype, filepath, meta) in enumerate(parse_items):
        fname = os.path.basename(filepath)
        print(f"\n[{i+1}/{len(parse_items)}] [{ftype.upper()}] {fname}")

        try:
            if ftype == "pdf":
                result = parse_pdf(filepath)
            else:
                result = parse_hwpx(filepath)

            # 메타데이터에서 연도 보완
            info = result["meeting_info"]
            if not info.get("year") and meta.get("title"):
                year_match = re.search(r"(\d{4})년도", meta["title"])
                if year_match:
                    info["year"] = int(year_match.group(1))

            print(f"  회차: {info.get('year')}년 제{info.get('meeting_number')}회")
            print(f"  날짜: {info.get('date')}")
            print(f"  참석자: {len(result['attendees'])}명")
            print(f"  안건: 총 {result['agendas']['total']}건")
            results.append(result)
        except Exception as e:
            print(f"  [ERROR] 파싱 실패: {e}")

    # 날짜 순으로 정렬
    results.sort(key=lambda r: r["meeting_info"].get("date") or "")

    # 결과 저장
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"파싱 완료! 총 {len(results)}건")
    print(f"결과 저장: {OUTPUT_FILE}")

    # 통계 출력
    all_ministers = {}
    for r in results:
        for a in r["attendees"]:
            key = a["name"]
            if key not in all_ministers:
                all_ministers[key] = {
                    "name": a["name"],
                    "ministry": a["ministry"],
                    "position": a["position"],
                    "attendance_count": 0,
                    "total_meetings": 0,
                }
            all_ministers[key]["total_meetings"] += 1
            if a["present"]:
                all_ministers[key]["attendance_count"] += 1

    print(f"\n{'='*60}")
    print("국무위원 출석 현황:")
    print(f"{'='*60}")
    for name, info in sorted(all_ministers.items(), key=lambda x: -x[1]["attendance_count"]):
        rate = info["attendance_count"] / info["total_meetings"] * 100 if info["total_meetings"] > 0 else 0
        print(f"  {name} ({info['ministry']}): {info['attendance_count']}/{info['total_meetings']}회 출석 ({rate:.0f}%)")

    return results


if __name__ == "__main__":
    parse_all()
