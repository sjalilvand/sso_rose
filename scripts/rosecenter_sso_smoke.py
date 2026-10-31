# -*- coding: utf-8 -*-
"""تست دود رز سنتر: همگام‌سازی پروفایل SSO رز هاب (فاز ۶۵)."""
import os
import sys
import time

import jwt

os.chdir("/tmp/rc-test")
sys.path.insert(0, "/tmp/rc-test")

import app as appmod  # noqa: E402
from database import query  # noqa: E402

SECRET = appmod.ROSE_HUB_SSO["client_secret"]
AUD = appmod.ROSE_HUB_SSO["client_id"]
NOW = int(time.time())

claims = {
    "iss": "rose-hub",
    "aud": AUD,
    "sub": "hub-user-99",
    "email": "1639818146@rose.ir",
    "name": "پری ملکی گلندوز",
    "role": "THERAPIST",
    "nationalId": "1639818146",
    "mobile": "09147446047",
    "province": "اردبیل",
    "provinceCode": "009006",
    "clinic": "کلینیک رز اردبیل",
    "scope": "sso-launch",
    "iat": NOW,
    "exp": NOW + 300,
    "jti": "smoke-jti-1",
}
token = jwt.encode(claims, SECRET, algorithm="HS256")

client = appmod.app.test_client()
r = client.get(f"/sso/rose?sso_token={token}")
assert r.status_code == 302, (r.status_code, r.data[:300])

# صفحه پنل با نشست SSO باید باز شود و مشخصات را نشان دهد
p = client.get("/panel/", follow_redirects=True)
assert p.status_code == 200, p.status_code
html = p.get_data(as_text=True)
assert "پری ملکی گلندوز" in html, "full name missing"
assert "1639818146" in html, "national id missing"
assert "اردبیل" in html, "province missing"
assert "کلینیک رز اردبیل" in html, "clinic missing"

u = None
with appmod.app.app_context():
    u = query("SELECT * FROM users WHERE email=?", ("1639818146@rose.ir",), one=True)
    assert u["full_name"] == "پری ملکی گلندوز"
    assert u["phone"] == "09147446047"
    assert u["national_id"] == "1639818146"
    assert u["province"] == "اردبیل"
    assert u["province_code"] == "009006"
    assert u["clinic"] == "کلینیک رز اردبیل"

# ورود دوم با مقدار خالی clinic → مقدار محلی نباید پاک شود
claims2 = dict(claims, jti="smoke-jti-2", clinic="", mobile="09120000000")
r2 = client.get(f"/sso/rose?sso_token={jwt.encode(claims2, SECRET, algorithm='HS256')}")
assert r2.status_code == 302
with appmod.app.app_context():
    u2 = query("SELECT * FROM users WHERE email=?", ("1639818146@rose.ir",), one=True)
    assert u2["clinic"] == "کلینیک رز اردبیل", "local clinic wiped by empty claim!"
    assert u2["phone"] == "09120000000", "mobile not updated"

print("ROSECENTER SMOKE: ALL OK")
print("  user:", u2["full_name"], "| nid:", u2["national_id"], "| province:", u2["province"], "| clinic:", u2["clinic"], "| phone:", u2["phone"])
