#!/usr/bin/env python3
"""
Extract comprehensive analysis from 2025 meetings #36 through #57.
Reads parsed_meetings.json and outputs detailed analysis to 2025_batch3_analysis.json.
"""

import json
import re
from datetime import datetime

INPUT_FILE = r'c:\Users\jooye\Desktop\2026project\kukmu\data\parsed_meetings.json'
OUTPUT_FILE = r'c:\Users\jooye\Desktop\2026project\kukmu\data\2025_batch3_analysis.json'


def extract_agenda_items_from_text(full_text):
    """Extract agenda item titles from the full_text field."""
    items = []
    lines = full_text.split('\n')

    # Pattern 1: Lines starting with ▸ (detailed agenda items)
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('\u25b8'):  # ▸
            title = stripped[1:].strip()
            if title and len(title) > 3:
                items.append(title)

    # Pattern 2: Lines with 의안번호 followed by title
    for i, line in enumerate(lines):
        if '의안번호' in line:
            for j in range(i + 1, min(i + 3, len(lines))):
                if lines[j].strip() and not lines[j].strip().startswith('의안번호'):
                    items.append(lines[j].strip())
                    break

    # Deduplicate while preserving order
    seen = set()
    unique_items = []
    for item in items:
        if item not in seen and len(item) > 3:
            seen.add(item)
            unique_items.append(item)

    return unique_items


def extract_category_summary(full_text):
    """Extract the agenda category breakdown from the header."""
    categories = {}
    match = re.search(r'[▢□]\s*(.+건.*?)\n', full_text)
    if match:
        cat_line = match.group(1)
        parts = re.findall(r'(\S+?)(\d+)건', cat_line)
        for name, count in parts:
            categories[name] = int(count)
    return categories


def extract_key_statements(full_text, existing_statements):
    """Extract key statements with speaker attribution from full_text."""
    statements = []

    for s in existing_statements:
        stmt = {
            "speaker": s.get("speaker", ""),
            "type": s.get("type", ""),
            "content_preview": s.get("content", "")[:800] if s.get("content") else ""
        }
        statements.append(stmt)

    # Extract dialogue exchanges from full_text
    dialogues = []
    lines = full_text.split('\n')
    current_speaker = None
    current_text = []

    for line in lines:
        stripped = line.strip()
        # Pattern: • 직책 이름 or · 직책 이름
        speaker_match = re.match(r'^[\u2022\u00b7]\s*(.+)', stripped)
        if speaker_match:
            if current_speaker and current_text:
                text = ' '.join(current_text).strip()
                text = re.sub(r'- \d+ -', '', text).strip()
                if text and len(text) > 10:
                    dialogues.append({
                        "speaker": current_speaker,
                        "content": text[:600]
                    })
            current_speaker = speaker_match.group(1).strip()
            current_text = []
        elif current_speaker and stripped and not re.match(r'^- \d+ -$', stripped):
            if not re.match(r'^\d+$', stripped):
                current_text.append(stripped)

    if current_speaker and current_text:
        text = ' '.join(current_text).strip()
        text = re.sub(r'- \d+ -', '', text).strip()
        if text and len(text) > 10:
            dialogues.append({
                "speaker": current_speaker,
                "content": text[:600]
            })

    return statements, dialogues[:50]


def extract_presidential_remarks(full_text):
    """Extract presidential opening remarks (모두말씀) from full_text."""
    remarks = ""
    match = re.search(r'모두\s*말씀\s*\n(.*?)(?:\n[▢□]\s|\nⅤ|\nㅇ\s)', full_text, re.DOTALL)
    if match:
        remarks = match.group(1).strip()
    else:
        match = re.search(
            r'모두\s*말씀\s*\n(.*?)(?:\n[▢□ⅤⅥ]|\n-\s*\d+\s*-\s*\n(?:.*?[▢□ⅤⅥ]))',
            full_text, re.DOTALL
        )
        if match:
            remarks = match.group(1).strip()

    remarks = re.sub(r'\n- \d+ -\n', '\n', remarks)
    return remarks


def extract_ministry_reports(full_text):
    """Extract ministry report sections."""
    reports = []
    pattern = re.compile(
        r'ㅇ\s*(\S+(?:장관|차관|실장|처장|본부장|위원장|부위원장|청장|차장)\S*)\s*\n'
        r'(.*?)(?=\nㅇ\s|\n[▢□]\s|\n\(폐회\)|\n\(.*?시)',
        re.DOTALL
    )

    for match in pattern.finditer(full_text):
        speaker = match.group(1).strip()
        content = match.group(2).strip()
        content = re.sub(r'\n- \d+ -\n', '\n', content)
        if content and len(content) > 20:
            reports.append({
                "reporter": speaker,
                "content_preview": content[:1000],
                "content_length": len(content)
            })

    return reports


def extract_formal_decisions(full_text):
    """Extract formal voting/deliberation decisions with their associated agenda items."""
    decisions = []
    lines = full_text.split('\n')

    for i, line in enumerate(lines):
        stripped = line.strip()
        # Match formal decision patterns
        if re.search(r'(원안\s*의결|수정\s*의결|보류|부결)', stripped):
            decision_type = re.search(r'(원안\s*의결|수정\s*의결|보류|부결)', stripped).group(1)
            # Look backwards for the agenda item title
            agenda_title = ""
            for j in range(max(0, i - 10), i):
                prev = lines[j].strip()
                # Check for numbered agenda item or title pattern
                if re.match(r'^\d+\.\s*$', prev):
                    # The next line should be the title
                    for k in range(j + 1, min(j + 3, len(lines))):
                        if lines[k].strip() and not lines[k].strip().startswith('['):
                            agenda_title = lines[k].strip()
                            break
                    break
                elif re.match(r'^\d+\.\s+\S', prev):
                    agenda_title = re.sub(r'^\d+\.\s*', '', prev).strip()
                    break

            # Extract 의안번호 if nearby
            item_numbers = []
            context_range = ' '.join(lines[max(0, i - 3):i + 1])
            for num_match in re.finditer(r'제?(\d+)호', context_range):
                item_numbers.append(num_match.group(0))

            decisions.append({
                "decision_type": decision_type.replace(' ', ''),
                "agenda_title": agenda_title[:200] if agenda_title else "",
                "item_numbers": item_numbers[:5],
                "raw_line": stripped[:300]
            })

    # Deduplicate
    seen = set()
    unique = []
    for d in decisions:
        key = d['decision_type'] + d.get('agenda_title', '') + d['raw_line'][:50]
        if key not in seen:
            seen.add(key)
            unique.append(d)

    return unique[:30]


def extract_policy_commitments(full_text):
    """Extract specific policy commitments and directives."""
    commitments = []

    keywords = [
        '추진하겠', '검토하겠', '마련하겠', '시행하겠', '개선하겠',
        '강화하겠', '지원하겠', '확대하겠', '도입하겠', '개정하겠',
        '준비하겠', '점검하겠', '조치하겠', '이행하겠', '방안을',
        '대책을', '계획을', '특단의', '즉시', '신속히',
        '반드시', '철저히', '적극적으로', '조속히'
    ]

    lines = full_text.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        for kw in keywords:
            if kw in stripped and len(stripped) > 20:
                context_start = max(0, i - 2)
                context_end = min(len(lines), i + 2)
                context = ' '.join(l.strip() for l in lines[context_start:context_end] if l.strip())
                context = re.sub(r'- \d+ -', '', context).strip()

                commitments.append({
                    "keyword": kw,
                    "text": stripped[:300],
                    "context": context[:500]
                })
                break

    seen_texts = set()
    unique = []
    for c in commitments:
        if c['text'] not in seen_texts:
            seen_texts.add(c['text'])
            unique.append(c)

    return unique[:50]


def extract_attendees_detail(meeting_data):
    """Extract detailed attendee information."""
    attendees = meeting_data.get('attendees', [])
    present = [a for a in attendees if a.get('present', False)]
    delegates = [a for a in attendees if a.get('delegate', False)]
    absent = [a for a in attendees if not a.get('present', False) and not a.get('delegate', False)]

    return {
        "total": len(attendees),
        "present_count": len(present),
        "delegate_count": len(delegates),
        "absent_count": len(absent),
        "present": [{"name": a["name"], "position": a["position"]} for a in present],
        "delegates": [{"name": a["name"], "position": a["position"]} for a in delegates],
        "absent": [{"name": a["name"], "position": a.get("position", "")} for a in absent]
    }


def extract_discussion_topics(full_text):
    """Extract the main discussion topics and themes by keyword frequency."""
    topic_keywords = {
        "경제": ["경제", "GDP", "성장률", "물가", "금리", "고용", "실업", "수출", "수입", "투자", "주가", "코스피"],
        "외교": ["외교", "정상회담", "동맹", "한미", "한일", "APEC", "G20", "UN", "순방"],
        "안보": ["안보", "국방", "군사", "미사일", "핵"],
        "남북관계": ["남북", "북측", "확성기", "비무장", "대화", "북한"],
        "민생": ["민생", "주거", "의료", "교육", "복지", "연금"],
        "산업안전": ["산업재해", "중대재해", "안전", "사망", "산재"],
        "AI_기술": ["인공지능", "AI", "디지털", "반도체", "첨단"],
        "인권_차별": ["인권", "차별", "혐오", "외국인", "이주노동자"],
        "기후_환경": ["기후", "탄소", "환경", "에너지", "재생"],
        "통상": ["관세", "통상", "FTA", "무역"],
        "행정개혁": ["행정", "규제", "개혁", "혁신", "디지털정부"],
        "재정": ["재정", "예산", "세금", "국채", "추경"],
        "내란_헌정": ["내란", "탄핵", "헌법", "민주주의", "12.3", "계엄"],
    }

    found_topics = []
    for topic, kws in topic_keywords.items():
        count = sum(full_text.count(kw) for kw in kws)
        if count > 0:
            found_topics.append({"topic": topic, "mention_count": count})

    found_topics.sort(key=lambda x: x["mention_count"], reverse=True)
    return found_topics


def extract_specific_numbers(full_text):
    """Extract specific numerical data mentioned (stats, targets, etc.)."""
    numbers = []

    patterns = [
        (r'(\d[\d,.]*\s*(?:억|조|만|천|백)\s*(?:원|달러|불))', "금액"),
        (r'(\d[\d,.]*\s*%)', "비율"),
        (r'(\d[\d,.]*\s*(?:명|인|건|개|호|곳|개소))', "수량"),
    ]

    for pattern, ptype in patterns:
        for match in re.finditer(pattern, full_text):
            start = max(0, match.start() - 100)
            end = min(len(full_text), match.end() + 50)
            context = full_text[start:end].replace('\n', ' ').strip()
            context = re.sub(r'- \d+ -', '', context).strip()
            numbers.append({
                "value": match.group(1).strip(),
                "type": ptype,
                "context": context[:300]
            })

    seen = set()
    unique = []
    for n in numbers:
        key = n['value'] + n['context'][:50]
        if key not in seen:
            seen.add(key)
            unique.append(n)

    return unique[:30]


def generate_key_themes(presidential_remarks, dialogues, topics, commitments):
    """Generate a concise key_themes summary based on extracted data."""
    themes = []

    # Top 5 topics by mention count
    for t in topics[:5]:
        themes.append(t["topic"])

    # Key themes from presidential remarks
    theme_markers = {
        "산업재해_대응": ["산업재해", "중대재해", "산재", "일터", "사망사고"],
        "외교_성과": ["정상회담", "APEC", "순방", "외교", "한미"],
        "경제_회복": ["경제회복", "성장률", "코스피", "수출", "투자유치"],
        "내란_극복": ["내란", "12.3", "빛의혁명", "헌정질서", "민주주의"],
        "남북_관계개선": ["확성기", "남북", "대화", "소통"],
        "디지털_전환": ["인공지능", "AI", "디지털", "스마트"],
        "국민안전": ["안전", "참사", "재해", "재난"],
        "관세_통상": ["관세", "통상", "협상", "무역"],
        "민생_안정": ["민생", "물가", "주거", "일자리"],
        "균형발전": ["균형발전", "지방", "세종", "부산"],
        "업무보고": ["업무보고", "생중계", "국정운영"],
        "혐오_차별대응": ["혐오", "차별", "인권", "외국인"],
    }

    text_combined = presidential_remarks + ' '.join(d.get('content', '') for d in dialogues[:10])
    found_themes = []
    for theme_name, markers in theme_markers.items():
        score = sum(text_combined.count(m) for m in markers)
        if score > 0:
            found_themes.append((theme_name, score))

    found_themes.sort(key=lambda x: x[1], reverse=True)
    return [t[0] for t in found_themes[:6]]


def process_meeting(meeting_data, index):
    """Process a single meeting and return comprehensive analysis."""
    mi = meeting_data['meeting_info']
    ft = meeting_data.get('full_text', '')

    meeting_num = mi['meeting_number']
    print(f"Processing meeting #{meeting_num} (index {index})...")

    # Extract all components
    attendees_detail = extract_attendees_detail(meeting_data)
    agenda_items = extract_agenda_items_from_text(ft)
    categories = extract_category_summary(ft)
    if not categories:
        categories = meeting_data.get('agendas', {}).get('categories', {})
    presidential_remarks = extract_presidential_remarks(ft)
    statements, dialogues = extract_key_statements(ft, meeting_data.get('statements', []))
    ministry_reports = extract_ministry_reports(ft)
    formal_decisions = extract_formal_decisions(ft)
    policy_commitments = extract_policy_commitments(ft)
    discussion_topics = extract_discussion_topics(ft)
    specific_numbers = extract_specific_numbers(ft)
    key_themes = generate_key_themes(presidential_remarks, dialogues, discussion_topics, policy_commitments)

    # Use existing agendas data if items list is populated
    existing_agenda_items = meeting_data.get('agendas', {}).get('items', [])
    if existing_agenda_items:
        for item in existing_agenda_items:
            title = item.get('title', '')
            if title and title not in agenda_items:
                agenda_items.append(title)

    result = {
        "meeting_number": meeting_num,
        "meeting_label": f"\uc81c{meeting_num}\ud68c",
        "year": mi.get('year', 2025),
        "date": mi.get('date', ''),
        "location": mi.get('location', ''),
        "duration": mi.get('duration', ''),
        "full_text_length": len(ft),
        "key_themes": key_themes,
        "attendees": attendees_detail,
        "agenda_summary": {
            "total_items": meeting_data.get('agendas', {}).get('total', 0),
            "categories": categories,
            "item_titles": agenda_items[:80]
        },
        "presidential_opening_remarks": presidential_remarks[:3000] if presidential_remarks else "",
        "key_statements": statements,
        "dialogue_exchanges": dialogues,
        "ministry_reports": ministry_reports,
        "formal_decisions": formal_decisions,
        "policy_commitments": policy_commitments,
        "discussion_topics": discussion_topics,
        "specific_numbers": specific_numbers
    }

    return result


def main():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    target_meetings = []
    for i, m in enumerate(data):
        mi = m.get('meeting_info', {})
        num = mi.get('meeting_number', 0)
        year = mi.get('year', 0)
        if year == 2025 and 36 <= num <= 57:
            target_meetings.append((i, m))

    print(f"Found {len(target_meetings)} meetings to process (36-57)")

    analysis = {
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "source_file": "parsed_meetings.json",
            "meeting_range": "\uc81c36\ud68c ~ \uc81c57\ud68c (2025)",
            "date_range": "2025-08-12 ~ 2025-12-31",
            "total_meetings_analyzed": len(target_meetings),
            "description": "Comprehensive analysis of 2025 \uad6d\ubb34\ud68c\uc758 meetings #36-#57"
        },
        "meetings": []
    }

    for idx, meeting_data in target_meetings:
        result = process_meeting(meeting_data, idx)
        analysis["meetings"].append(result)

    # Add summary statistics
    all_topics = {}
    all_commitments_count = 0
    total_dialogues = 0
    total_decisions = 0
    all_reporters = set()
    all_themes = {}

    for m in analysis["meetings"]:
        all_commitments_count += len(m.get("policy_commitments", []))
        total_dialogues += len(m.get("dialogue_exchanges", []))
        total_decisions += len(m.get("formal_decisions", []))
        for t in m.get("discussion_topics", []):
            topic = t["topic"]
            all_topics[topic] = all_topics.get(topic, 0) + t["mention_count"]
        for r in m.get("ministry_reports", []):
            all_reporters.add(r["reporter"])
        for theme in m.get("key_themes", []):
            all_themes[theme] = all_themes.get(theme, 0) + 1

    analysis["summary"] = {
        "total_meetings": len(target_meetings),
        "total_policy_commitments": all_commitments_count,
        "total_dialogue_exchanges": total_dialogues,
        "total_formal_decisions": total_decisions,
        "top_discussion_topics": sorted(all_topics.items(), key=lambda x: x[1], reverse=True),
        "recurring_themes": sorted(all_themes.items(), key=lambda x: x[1], reverse=True),
        "unique_ministry_reporters": sorted(list(all_reporters)),
        "meeting_timeline": [
            {
                "meeting": f"\uc81c{m['meeting_number']}\ud68c",
                "date": m["date"],
                "key_themes": m.get("key_themes", [])[:3],
                "agenda_count": m["agenda_summary"]["total_items"],
                "dialogues": len(m.get("dialogue_exchanges", [])),
                "commitments": len(m.get("policy_commitments", []))
            }
            for m in analysis["meetings"]
        ]
    }

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(analysis, f, ensure_ascii=False, indent=2)

    print(f"\nAnalysis saved to {OUTPUT_FILE}")
    print(f"Total meetings: {len(target_meetings)}")
    print(f"Total policy commitments: {all_commitments_count}")
    print(f"Total dialogue exchanges: {total_dialogues}")
    print(f"Total formal decisions: {total_decisions}")
    print(f"Top topics: {sorted(all_topics.items(), key=lambda x: x[1], reverse=True)[:5]}")
    print(f"Recurring themes: {sorted(all_themes.items(), key=lambda x: x[1], reverse=True)[:5]}")


if __name__ == '__main__':
    main()
