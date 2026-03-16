"""
HWPX 파일 파서
HWPX (한컴 오피스 신규 포맷)에서 텍스트를 추출합니다.
HWPX는 ZIP 파일 내부에 ODF-like XML이 있는 구조입니다.
"""

import os
import re
import zipfile
import json
from xml.etree import ElementTree as ET

HWPX_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "hwpx")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "parsed_hwpx.json")

# HWPX XML 네임스페이스
NAMESPACES = {
    "hp": "http://www.hancom.co.kr/hwpml/2011/paragraph",
    "ht": "http://www.hancom.co.kr/hwpml/2011/text",
    "hc": "http://www.hancom.co.kr/hwpml/2011/core",
    "ha": "http://www.hancom.co.kr/hwpml/2011/app",
    "config": "urn:oasis:names:tc:opendocument:xmlns:config:1.0",
}


def extract_text_from_xml(xml_content: bytes) -> str:
    """XML에서 텍스트를 추출합니다."""
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError:
        return ""

    texts = []

    # 모든 텍스트 노드 수집 (네임스페이스 무관하게)
    for elem in root.iter():
        # <hp:t>, <ht:t>, 또는 단순 <t> 태그에서 텍스트 추출
        tag = elem.tag
        local_name = tag.split("}")[-1] if "}" in tag else tag

        if local_name == "t" and elem.text:
            texts.append(elem.text)
        elif local_name == "run" and elem.text:
            texts.append(elem.text)

    return "\n".join(texts)


def extract_all_text_recursive(element) -> list[str]:
    """재귀적으로 모든 텍스트 추출"""
    texts = []
    if element.text and element.text.strip():
        texts.append(element.text.strip())
    for child in element:
        texts.extend(extract_all_text_recursive(child))
    if element.tail and element.tail.strip():
        texts.append(element.tail.strip())
    return texts


def parse_hwpx(filepath: str) -> dict:
    """HWPX 파일에서 텍스트를 추출합니다."""
    result = {
        "filename": os.path.basename(filepath),
        "text": "",
        "sections": [],
    }

    try:
        with zipfile.ZipFile(filepath, "r") as zf:
            file_list = zf.namelist()

            # section 파일들 찾기 (Contents/section0.xml, section1.xml, ...)
            section_files = sorted([
                f for f in file_list
                if re.match(r"Contents/section\d+\.xml", f)
            ])

            if not section_files:
                # 대체 경로 탐색
                section_files = sorted([
                    f for f in file_list
                    if "section" in f.lower() and f.endswith(".xml")
                ])

            all_text = []
            for section_file in section_files:
                xml_data = zf.read(section_file)

                # 방법 1: 구조적 파싱
                text = extract_text_from_xml(xml_data)

                # 방법 2: 구조적 파싱 실패시 brute-force
                if not text or len(text) < 50:
                    try:
                        root = ET.fromstring(xml_data)
                        text_parts = extract_all_text_recursive(root)
                        text = "\n".join(text_parts)
                    except ET.ParseError:
                        pass

                # 방법 3: 정규식으로 <t> 태그 내용 추출
                if not text or len(text) < 50:
                    xml_str = xml_data.decode("utf-8", errors="ignore")
                    t_matches = re.findall(r"<[^>]*:t[^>]*>([^<]+)</[^>]*:t>", xml_str)
                    if not t_matches:
                        t_matches = re.findall(r"<t[^>]*>([^<]+)</t>", xml_str)
                    if t_matches:
                        text = "\n".join(t_matches)

                if text:
                    all_text.append(text)
                    result["sections"].append({
                        "file": section_file,
                        "text_length": len(text),
                    })

            result["text"] = "\n\n".join(all_text)

    except zipfile.BadZipFile:
        print(f"  [ERROR] 유효하지 않은 ZIP 파일: {filepath}")
    except Exception as e:
        print(f"  [ERROR] HWPX 파싱 실패: {filepath} - {e}")

    return result


def parse_all_hwpx():
    """모든 HWPX 파일을 파싱합니다."""
    if not os.path.exists(HWPX_DIR):
        print(f"HWPX 디렉토리가 없습니다: {HWPX_DIR}")
        return []

    hwpx_files = sorted([f for f in os.listdir(HWPX_DIR) if f.endswith(".hwpx")])
    print(f"총 {len(hwpx_files)}개 HWPX 파일 발견")

    results = []
    for i, hwpx_file in enumerate(hwpx_files):
        filepath = os.path.join(HWPX_DIR, hwpx_file)
        print(f"\n[{i+1}/{len(hwpx_files)}] 파싱 중: {hwpx_file}")

        result = parse_hwpx(filepath)
        text_len = len(result["text"])
        sections = len(result["sections"])
        print(f"  텍스트 길이: {text_len} 문자, 섹션: {sections}개")

        if text_len > 0:
            # 미리보기 출력
            preview = result["text"][:200].replace("\n", " ")
            print(f"  미리보기: {preview}...")
        else:
            print(f"  [WARN] 텍스트 추출 실패!")
            # ZIP 내부 파일 목록 출력
            try:
                with zipfile.ZipFile(filepath, "r") as zf:
                    print(f"  ZIP 내부 파일: {zf.namelist()[:10]}")
            except Exception:
                pass

        results.append(result)

    # 결과 저장
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"HWPX 파싱 완료! 총 {len(results)}건")
    print(f"결과 저장: {OUTPUT_FILE}")

    return results


if __name__ == "__main__":
    parse_all_hwpx()
