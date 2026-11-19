# -*- coding: utf-8 -*-
"""ساخت بنر گرافیکی بات بله (public/bale-banner.png) با HTML + فونت وزیرمتن"""
from playwright.sync_api import sync_playwright
import pathlib

ROOT = pathlib.Path("/home/z/my-project")
FONT_BOLD = (ROOT / "scripts/assets/Vazirmatn-Bold.ttf").as_uri()
FONT_REG = (ROOT / "scripts/assets/Vazirmatn-Regular.ttf").as_uri()

HTML = f"""<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head><meta charset="utf-8">
<style>
  @font-face {{ font-family: 'Vazirmatn'; src: url('{FONT_REG}'); font-weight: 400; }}
  @font-face {{ font-family: 'Vazirmatn'; src: url('{FONT_BOLD}'); font-weight: 700; }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Vazirmatn'; }}
  .banner {{
    width: 1200px; height: 630px; position: relative; overflow: hidden;
    background: linear-gradient(135deg, #9f1239 0%, #be123c 45%, #e11d48 100%);
    color: #fff; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
  }}
  .ring {{ position: absolute; border-radius: 9999px; border: 3px solid rgba(255,255,255,.14); }}
  .r1 {{ width: 520px; height: 520px; top: -220px; left: -160px; }}
  .r2 {{ width: 380px; height: 380px; top: -140px; left: -60px; }}
  .r3 {{ width: 640px; height: 640px; bottom: -330px; right: -200px; border-width: 4px; }}
  .r4 {{ width: 420px; height: 420px; bottom: -200px; right: -80px; }}
  .petal {{ position: absolute; font-size: 150px; opacity: .16; }}
  .p1 {{ top: 48px; left: 90px; transform: rotate(-15deg); }}
  .p2 {{ bottom: 40px; right: 110px; transform: rotate(12deg); }}
  .logo {{
    width: 108px; height: 108px; border-radius: 30px; background: rgba(255,255,255,.15);
    display: flex; align-items: center; justify-content: center; margin-bottom: 22px;
    border: 2px solid rgba(255,255,255,.35); backdrop-filter: blur(4px);
  }}
  h1 {{ font-size: 84px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; }}
  .sub {{ font-size: 36px; font-weight: 700; margin-top: 14px; color: #ffe4e6; }}
  .desc {{ font-size: 24px; margin-top: 16px; color: rgba(255,255,255,.85); max-width: 860px; line-height: 1.9; }}
  .chips {{ display: flex; gap: 16px; margin-top: 34px; }}
  .chip {{
    background: rgba(255,255,255,.14); border: 1.5px solid rgba(255,255,255,.4);
    border-radius: 9999px; padding: 12px 30px; font-size: 23px; font-weight: 700;
  }}
  .url {{ direction: ltr; font-weight: 700; }}
</style></head>
<body>
  <div class="banner" id="banner">
    <div class="ring r1"></div><div class="ring r2"></div>
    <div class="ring r3"></div><div class="ring r4"></div>
    <div class="petal p1">&#127803;</div><div class="petal p2">&#127803;</div>
    <div class="logo">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
        <path d="M12 21s-7.5-4.6-10-9.3C.5 8 2.6 4.5 6.2 4.5c2.2 0 3.9 1.2 4.8 3 1-1.8 2.6-3 4.8-3 3.6 0 5.7 3.5 4.2 7.2C17.5 16.4 12 21 12 21z" fill="#fff" opacity=".95"/>
        <path d="M12 8.2c1.4 1.5 2.1 3.2 2.1 5.1 0 1.9-.7 3.6-2.1 5.1-1.4-1.5-2.1-3.2-2.1-5.1 0-1.9.7-3.6 2.1-5.1z" fill="#be123c"/>
      </svg>
    </div>
    <h1>رز هاب</h1>
    <div class="sub">بات پشتیبانی و بازیابی رمز عبور</div>
    <div class="desc">فراموشی رمز؟ همین‌جا با چند دکمه، رمزتان را تغییر دهید — بدون مرورگر و بدون معطلی</div>
    <div class="chips">
      <div class="chip">@rosepro_bot</div>
      <div class="chip url">130.185.73.157:8082</div>
    </div>
  </div>
</body></html>"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1240, "height": 670})
    page.set_content(HTML)
    page.wait_for_timeout(400)
    el = page.locator("#banner")
    out = ROOT / "public/bale-banner.png"
    el.screenshot(path=str(out))
    browser.close()
    print("banner saved:", out, out.stat().st_size, "bytes")
