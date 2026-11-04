#!/usr/bin/env python3
"""Build rose-hub-admin-guide.html from fragments + inject tested reset-admin.js."""
import html
import pathlib
import shutil

ROOT = pathlib.Path("/home/z/my-project")
SCRIPTS = ROOT / "scripts"
DOWNLOAD = ROOT / "download"
DOWNLOAD.mkdir(exist_ok=True)

part1 = (SCRIPTS / "guide-part1.html").read_text(encoding="utf-8")
part2 = (SCRIPTS / "guide-part2.html").read_text(encoding="utf-8")
part3 = (SCRIPTS / "guide-part3.html").read_text(encoding="utf-8")

reset_js = (SCRIPTS / "reset-admin.js").read_text(encoding="utf-8")
reset_js_escaped = html.escape(reset_js, quote=False)

if "@@RESET_JS@@" not in part1:
    raise SystemExit("placeholder @@RESET_JS@@ not found in part1")

doc = part1.replace("@@RESET_JS@@", reset_js_escaped) + part2 + part3

out = DOWNLOAD / "rose-hub-admin-guide.html"
out.write_text(doc, encoding="utf-8")

# نسخهٔ آمادهٔ ابزار ریست هم کنار راهنما تحویل می‌شود
shutil.copy2(SCRIPTS / "reset-admin.js", DOWNLOAD / "reset-admin.js")

size = out.stat().st_size
print(f"OK  {out}  ({size:,} bytes)")
print(f"OK  {DOWNLOAD / 'reset-admin.js'}")
# sanity checks
assert "reset-admin.js" in doc
assert "&amp;" in doc and "&gt;" in doc  # escaped code present
assert "start-all-rose.ps1" in doc
assert "rose-bale-bot" in doc
print("sanity checks passed")
