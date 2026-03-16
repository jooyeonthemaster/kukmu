import json
import sys

with open(r'c:\Users\jooye\Desktop\2026project\kukmu\data\parsed_meetings.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

target_meetings = []
for m in data:
    info = m.get('meeting_info', {})
    if info.get('year') == 2025 and 20 <= info.get('meeting_number', 0) <= 29:
        target_meetings.append(m)

# Save extracted meetings to a separate file
with open(r'c:\Users\jooye\Desktop\2026project\kukmu\data\meetings_20_29.json', 'w', encoding='utf-8') as f:
    json.dump(target_meetings, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(target_meetings)} meetings")
for m in target_meetings:
    info = m['meeting_info']
    print(f"  Meeting #{info['meeting_number']} - {info['date']} - text_length: {m.get('text_length', 0)}")
