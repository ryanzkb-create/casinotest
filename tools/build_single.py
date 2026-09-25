#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file.

    python3 tools/build_single.py            -> dist/golden-mirage.html (open by double-clicking)
    python3 tools/build_single.py --fragment OUT.html
        -> same page without <!DOCTYPE>/<html>/<head>/<body> wrappers
           (for hosts that add their own page skeleton)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def inline(html: str) -> str:
    def css(m):
        return "<style>\n" + (ROOT / m.group(1)).read_text() + "\n</style>"

    def js(m):
        attrs, src = m.group(1), m.group(2)
        code = (ROOT / src).read_text()
        assert "</script" not in code, f"{src} contains </script"
        return f"<script{attrs}>\n{code}\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
    html = re.sub(r'<script([^>]*?) src="(js/[^"]+)"></script>', js, html)
    return html


def fragment(html: str) -> str:
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    # drop tags the host skeleton already provides
    head = re.sub(r'\s*<meta charset="UTF-8">', "", head)
    head = re.sub(r'\s*<meta name="viewport"[^>]*>', "", head)
    return head.strip() + "\n" + body.strip() + "\n"


def main():
    html = inline((ROOT / "index.html").read_text())
    if len(sys.argv) > 2 and sys.argv[1] == "--fragment":
        out = Path(sys.argv[2])
        out.write_text(fragment(html))
    else:
        out = ROOT / "dist" / "golden-mirage.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(html)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
