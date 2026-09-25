#!/usr/bin/env python3
"""Build Golden Mirage for distribution.

    python3 tools/build_single.py
        -> dist/golden-mirage.html: one self-contained file (CSS, scripts and all
           3D assets embedded) that you can open by double-clicking.
    python3 tools/build_single.py --web OUT_DIR [--fragment]
        -> OUT_DIR/golden-mirage.html + OUT_DIR/assets/: a lighter page that
           streams the assets from next to it (for web hosting). --fragment
           drops the <!DOCTYPE>/<html>/<head>/<body> wrappers for hosts that
           add their own page skeleton.

The 3D engine (js/r3d/*.js) is bundled with esbuild, which is run through npx
if it isn't installed. Three.js itself stays on the jsDelivr CDN (import map).
"""
import base64
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = '<script type="module" src="js/r3d/main.js"></script>'


def esbuild_cmd():
    local = ROOT / "node_modules" / ".bin" / "esbuild"
    if local.exists():
        return [str(local)]
    if shutil.which("esbuild"):
        return ["esbuild"]
    return ["npx", "--yes", "esbuild@0.24.2"]


def bundle_engine() -> str:
    out = subprocess.run(
        esbuild_cmd() + ["js/r3d/main.js", "--bundle", "--format=esm", "--target=es2020",
                         "--external:three", "--external:three/addons/*", "--log-level=warning"],
        cwd=ROOT, check=True, capture_output=True, text=True)
    return out.stdout


def inline(html: str) -> str:
    def css(m):
        return "<style>\n" + (ROOT / m.group(1)).read_text() + "\n</style>"

    def js(m):
        attrs, src = m.group(1), m.group(2)
        code = (ROOT / src).read_text()
        assert "</script" not in code, f"{src} contains </script"
        return f"<script{attrs}>\n{code}\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="(css/[^"]+)">', css, html)
    assert MODULE in html, "3D engine module tag not found in index.html"
    engine = bundle_engine()
    assert "</script" not in engine
    html = html.replace(MODULE, f'<script type="module">\n{engine}\n</script>')
    html = re.sub(r'<script([^>]*?) src="(js/[^"]+)"></script>', js, html)
    return html


def asset_files():
    return sorted(p for p in (ROOT / "assets").rglob("*") if p.is_file())


def embed_assets(html: str) -> str:
    parts = []
    for p in asset_files():
        rel = p.relative_to(ROOT).as_posix()
        parts.append(f'"{rel}":"{base64.b64encode(p.read_bytes()).decode()}"')
    blob = "<script>window.__ASSETS={" + ",".join(parts) + "};</script>"
    # must run before the engine module starts loading
    return html.replace('<script type="importmap">', blob + '\n  <script type="importmap">', 1)


def fragment(html: str) -> str:
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    head = re.sub(r'\s*<meta charset="UTF-8">', "", head)
    head = re.sub(r'\s*<meta name="viewport"[^>]*>', "", head)
    return head.strip() + "\n" + body.strip() + "\n"


def main():
    html = inline((ROOT / "index.html").read_text())
    if len(sys.argv) > 2 and sys.argv[1] == "--web":
        out_dir = Path(sys.argv[2])
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "golden-mirage.html"
        out.write_text(fragment(html) if "--fragment" in sys.argv else html)
        for p in asset_files():
            dest = out_dir / p.relative_to(ROOT)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, dest)
    else:
        out = ROOT / "dist" / "golden-mirage.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(embed_assets(html))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
