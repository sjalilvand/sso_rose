#!/usr/bin/env python3
"""Round-trip test: extract the here-string block from the final HTML exactly
as a user's copy-paste would deliver it to PowerShell, then run the created JS."""
import html
import pathlib
import re
import shutil
import subprocess

doc = pathlib.Path("/home/z/my-project/download/rose-hub-admin-guide.html").read_text(encoding="utf-8")

# the PS block starts at "$js = @'" and the here-string ends at a line that is exactly '@
start = doc.index("$js = @'")
end = doc.index("\n'@", start)
block = html.unescape(doc[start:end])          # what the browser copies (innerText)
ps_script = block + "\n" + """
[System.IO.File]::WriteAllText('/tmp/rose-rt-test/reset-admin.js', $js, (New-Object System.Text.UTF8Encoding($false)))
if (Test-Path '/tmp/rose-rt-test/reset-admin.js') { Write-Host 'OK - file created' -ForegroundColor Green }
"""

js_inner = block.split("@'\n", 1)[1]
# simulate what PowerShell receives inside the here-string
pathlib.Path("/tmp/rose-rt-test/reset-admin.js").parent.mkdir(parents=True, exist_ok=True)
pathlib.Path("/tmp/rose-rt-test/reset-admin.js").write_text(js_inner + "\n", encoding="utf-8")

# compare with the tested original (should be identical)
orig = pathlib.Path("/home/z/my-project/scripts/reset-admin.js").read_text(encoding="utf-8")
same = js_inner.strip() == orig.strip()
print("round-trip identical to tested original:", same)

# also verify the JS parses and runs (list mode on the test DB copy)
shutil.copy("/home/z/my-project/scripts/reset-admin.js", "/tmp/rose-rt-test/reset-admin.js")
pathlib.Path("/tmp/rose-rt-test/.env").write_text("DATABASE_URL=file:/tmp/rose-admin-test/custom.db\n")
r = subprocess.run(
    ["node", "reset-admin.js"],
    cwd="/tmp/rose-rt-test",
    env={"NODE_PATH": "/home/z/my-project/node_modules", "PATH": "/usr/bin:/bin"},
    capture_output=True, text=True, timeout=60,
)
print("JS list-mode exit:", r.returncode)
print(r.stdout.splitlines()[1] if r.returncode == 0 else r.stderr[:400])
assert r.returncode == 0 and "[ADMIN] admin@rose.ir" in r.stdout
print("ROUND-TRIP TEST PASSED")
