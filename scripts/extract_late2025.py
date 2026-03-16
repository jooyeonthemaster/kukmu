import json
import sys

with open(r'c:\Users\jooye\Desktop\2026project\kukmu\data\parsed_meetings.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for m in data:
    info = m.get('meeting_info', {})
    if info.get('year') == 2025 and info.get('meeting_number', 0) >= 48:
        num = info['meeting_number']
        # Save each meeting separately
        output = {
            'meeting_info': m['meeting_info'],
            'attendees': m.get('attendees', []),
            'agendas': m.get('agendas', {}),
            'statements': m.get('statements', []),
        }
        outpath = rf'c:\Users\jooye\Desktop\2026project\kukmu\data\temp_meetings\m{num}_detail.json'
        with open(outpath, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        # Also save full_text separately
        ft = m.get('full_text', '')
        ftpath = rf'c:\Users\jooye\Desktop\2026project\kukmu\data\temp_meetings\m{num}_fulltext.txt'
        with open(ftpath, 'w', encoding='utf-8') as f:
            f.write(ft)

        print(f"Meeting #{num} - {info['date']} - text_length: {m.get('text_length', 0)} - statements: {len(output['statements'])}")
