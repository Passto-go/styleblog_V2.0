#!/usr/bin/env python3
import sys, markdown
from weasyprint import HTML

SRC = sys.argv[1]
OUT = sys.argv[2]

with open(SRC, encoding='utf-8') as f:
    md = f.read()

body = markdown.markdown(
    md,
    extensions=['fenced_code', 'tables', 'sane_lists', 'nl2br'],
)

CSS = """
@page { size: A4; margin: 18mm 16mm 20mm 16mm;
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; color:#888; } }
* { box-sizing: border-box; }
body { font-family: "Noto Sans CJK SC", sans-serif; font-size: 10.5pt; line-height: 1.65;
  color:#1a1a1a; }
h1 { font-size: 21pt; margin: 0 0 6pt; padding-bottom:8pt; border-bottom:3px solid #7d9dba; }
h2 { font-size: 15pt; margin: 18pt 0 8pt; padding-bottom:4pt; border-bottom:1px solid #c9d4de; color:#27435c; }
h3 { font-size: 12pt; margin: 13pt 0 5pt; color:#2f5a7a; }
h4 { font-size: 11pt; margin: 10pt 0 4pt; }
p  { margin: 5pt 0; }
a  { color:#2f5a7a; text-decoration: none; }
code { font-family: "Noto Sans Mono CJK SC", monospace; font-size: 9pt;
  background:#f2f4f7; padding:1px 4px; border-radius:3px; color:#b5341f; }
pre { background:#f6f8fa; border:1px solid #e2e8ee; border-radius:6px;
  padding:9pt 11pt; overflow-x:auto; margin:6pt 0; line-height:1.5; }
pre code { background:none; padding:0; color:#24292e; font-size:8.6pt; }
table { border-collapse: collapse; width:100%; margin:7pt 0; font-size:9pt; }
th, td { border:1px solid #d4dce4; padding:5pt 7pt; text-align:left; vertical-align:top; }
th { background:#eef3f8; font-weight:600; }
tr:nth-child(even) td { background:#fafbfc; }
blockquote { border-left:3px solid #7d9dba; margin:6pt 0; padding:2pt 12pt; color:#555; background:#f7fafc; }
ul, ol { margin:5pt 0; padding-left:20pt; }
li { margin:2pt 0; }
hr { border:none; border-top:1px solid #ddd; margin:12pt 0; }
"""

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head>
<body>{body}</body></html>"""

HTML(string=html, base_url='/').write_pdf(OUT)
print("PDF 已生成:", OUT)
