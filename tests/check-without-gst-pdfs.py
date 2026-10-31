"""Run after the browser suite with a Python runtime containing pdfplumber."""
import json
import re
from pathlib import Path
import pdfplumber

folder = Path('tmp/ngst-qa')
report = {}
for name in ['kalpesh', 'long-table']:
    with pdfplumber.open(folder / f'{name}.pdf') as document:
        pages = document.pages
        texts = [page.extract_text() or '' for page in pages]
        assert len(pages) >= 2, f'{name}: expected multiple pages'
        assert len(pages[0].images) >= 1, f'{name}: missing company logo'
        for index, page in enumerate(pages):
            assert abs(float(page.width) - 595) < 2 and abs(float(page.height) - 842) < 2, 'A4 page required'
            for word in page.extract_words():
                assert word['x0'] >= 30 and word['x1'] <= float(page.width) - 30, f'{name} page {index + 1}: horizontal clipping'
                assert word['top'] >= 28 and word['bottom'] <= float(page.height) - 10, f'{name} page {index + 1}: vertical clipping'
            assert f'Page {index + 1} of {len(pages)}' in texts[index], f'{name}: missing page counter'
        all_text = '\n'.join(texts)
        assert 'Outstanding balance' in texts[-1] and 'Grand total in words' in texts[-1], 'Keep financial summary together'
        if name == 'long-table':
            assert all('DELIVERY DATE' in text for text in texts), 'Repeat table headings'
            for index in range(1, 101):
                assert len(re.findall(rf'\bPaver Blocks {index}\b', all_text)) == 1, f'Missing or duplicated delivery {index}'
            assert '100 brass' in all_text and '4,20,000.00' in all_text
        else:
            assert '250 brass' in all_text and '10,45,200.00' in all_text
            # Browser workflow adds a third payment of Rs 1,000 before printing.
            assert '4,78,300.00' in all_text
        report[name] = {'pages': len(pages), 'logo': True, 'a4': True, 'margins': 'passed', 'summary': 'intact'}
(folder / 'pdf-qa-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
