import json
import re
import os

# Paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
input_path = os.path.join(base_dir, 'data', 'parsed_meetings.json')
output_path = os.path.join(base_dir, 'data', '2025_batch2_analysis.json')

with open(input_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

targets = [m for m in data if m['meeting_info']['year'] == 2025 and 20 <= m['meeting_info']['meeting_number'] <= 35]
targets.sort(key=lambda x: x['meeting_info']['meeting_number'])


def extract_attendees_detail(meeting):
    attendees_present = []
    attendees_delegate = []
    for a in meeting.get('attendees', []):
        info = {
            "name": a['name'],
            "position": a['position'],
            "ministry": a['ministry']
        }
        if a.get('present', False) and not a.get('delegate', False):
            attendees_present.append(info)
        elif a.get('delegate', False):
            attendees_delegate.append(info)

    ft = meeting.get('full_text', '')
    chair = ""
    chair_match = re.search(r'주재\s*[:：]\s*(.+?)[\n]', ft)
    if chair_match:
        chair = chair_match.group(1).strip()

    delegate_names = []
    delegate_match = re.search(r'대리출석\(△\)\s*\n?\s*(.+?)(?:\n비)', ft, re.DOTALL)
    if delegate_match:
        delegate_names = [d.strip() for d in delegate_match.group(1).strip().split('  ') if d.strip()]

    return {
        "chair": chair,
        "present": attendees_present,
        "delegates": attendees_delegate,
        "delegate_names": delegate_names
    }


def extract_agenda_items(meeting):
    ft = meeting.get('full_text', '')
    agendas = []

    matches = re.findall(r'(?:^|\n)\s*(\d+)\.\s*\n(.+?)(?:\n\s*\[|$)', ft)
    if matches:
        for num, title in matches:
            title = title.strip()
            if title and len(title) > 5 and not title.startswith('ㅇ') and not title.startswith('▢'):
                agendas.append({
                    "number": int(num),
                    "title": title
                })

    return agendas


def extract_key_statements(meeting):
    statements = []
    for s in meeting.get('statements', []):
        content = s.get('content', '').strip()
        if len(content) > 10:
            statements.append({
                "speaker": s['speaker'],
                "type": s['type'],
                "content": content
            })

    ft = meeting.get('full_text', '')
    oral_reports = []
    oral_section = re.search(r'▢\s*구두보고\s*및\s*협조사항(.+?)(?:▢\s*산\s*회|$)', ft, re.DOTALL)
    if oral_section:
        text = oral_section.group(1)
        speakers = re.findall(r'ㅇ\s*(.+?장관|.+?차관|.+?실장|.+?처장|.+?위원장)\s+(\S+)\s*\n([\s\S]*?)(?=ㅇ\s*\S|$)', text)
        for position, name, content in speakers:
            content = content.strip()
            if len(content) > 20:
                oral_reports.append({
                    "speaker": f"{position} {name}",
                    "content": content[:500]
                })

    return statements, oral_reports


def extract_decisions(meeting):
    ft = meeting.get('full_text', '')
    decisions = []
    decision_matches = re.findall(r'ㅇ\s*의\s*결\s*[:：]\s*(.+?)(?:\n)', ft)
    for d in decision_matches:
        d = d.strip()
        if d:
            decisions.append(d)
    return decisions


def extract_policy_commitments(meeting):
    commitments = []
    ft = meeting.get('full_text', '')

    policy_patterns = [
        r'정부는\s+(.{20,200}?)(?:임\.|함\.)',
        r'추진하[겠고](.{10,150}?)(?:임\.|함\.)',
        r'대책을?\s+(.{10,150}?)(?:임\.|함\.)',
    ]

    for pattern in policy_patterns:
        matches = re.findall(pattern, ft)
        for m_text in matches:
            m_text = m_text.strip()
            if len(m_text) > 15:
                commitments.append(m_text)

    return list(set(commitments))[:10]


def extract_topics_summary(meeting):
    topics = []
    for s in meeting.get('statements', []):
        if s['type'] == '모두말씀':
            content = s['content']
            sentences = re.split(r'(?<=[.。])\s+', content)
            for sent in sentences:
                sent = sent.strip()
                if len(sent) > 20:
                    if any(keyword in sent for keyword in [
                        '추경', '예산', '안보', '경제', '민생', '통상', 'AI', '반도체',
                        '선거', '산불', '재난', '의대', '의료', '일자리', '쿠폰', '관세',
                        '수해', '홍수', '공약', 'SKT', '유심', '호라이즌', '상속세', '보훈',
                        '기후', '디지털', '원전', '에너지', '소상공인', '안전', '국방',
                        '외교', '복지', '주거', '부동산', '물가', '수출', '성장', '금리',
                        '환율', '투자', '고용', '실업', '저출산', '고령화', '연금',
                        '교육', '과학', '기술', '혁신', '규제', '개혁', '법', '제도',
                        '대통령', '국회', '헌법', '권한대행', '정권', '인수위', '국정과제'
                    ]):
                        topics.append(sent[:300])
    return topics[:20]


# Build analysis
analysis = {
    "metadata": {
        "analysis_title": "2025년 국무회의 제20회~제35회 종합 분석",
        "meetings_analyzed": 16,
        "date_range": "2025-05-02 ~ 2025-08-11",
        "generated_from": "parsed_meetings.json full_text analysis",
        "description": "제20회~제35회 국무회의는 대통령권한대행 체제(이주호 부총리)에서 이재명 신정부 초기까지의 과도기를 포함합니다."
    },
    "meetings": []
}

for m in targets:
    mn = m['meeting_info']['meeting_number']
    print(f"Processing meeting #{mn}...")

    attendees = extract_attendees_detail(m)
    agendas = extract_agenda_items(m)
    statements, oral_reports = extract_key_statements(m)
    decisions = extract_decisions(m)
    topics = extract_topics_summary(m)
    commitments = extract_policy_commitments(m)

    meeting_analysis = {
        "meeting_number": mn,
        "meeting_title": f"제{mn}회 국무회의",
        "date": m['meeting_info']['date'],
        "location": m['meeting_info']['location'],
        "duration": m['meeting_info']['duration'],
        "total_agendas": m.get('agendas', {}).get('total', len(agendas)),
        "attendees": attendees,
        "agenda_items": agendas,
        "key_statements": statements,
        "oral_reports": oral_reports,
        "decisions": decisions,
        "key_topics_discussed": topics,
        "policy_commitments": commitments
    }

    analysis["meetings"].append(meeting_analysis)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(analysis, f, ensure_ascii=False, indent=2)

print(f"\nSaved analysis to {output_path}")
print(f"Total meetings: {len(analysis['meetings'])}")
for m_a in analysis['meetings']:
    print(f"  #{m_a['meeting_number']}: {len(m_a['agenda_items'])} agendas, {len(m_a['key_statements'])} statements, {len(m_a['decisions'])} decisions, {len(m_a['key_topics_discussed'])} topics")
