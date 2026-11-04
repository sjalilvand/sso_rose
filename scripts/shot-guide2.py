#!/usr/bin/env python3
"""Screenshot the admin guide HTML with instant scrolling."""
from playwright.sync_api import sync_playwright

DOC = "file:///home/z/my-project/download/rose-hub-admin-guide.html"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1100, "height": 900})
    page.goto(DOC, wait_until="networkidle")
    page.wait_for_timeout(500)

    def snap(anchor, path, extra=0):
        y = page.evaluate(f"document.getElementById('{anchor}').getBoundingClientRect().top + window.scrollY")
        page.evaluate(f"window.scrollTo({{top: {y} - 70 + {extra}, behavior: 'instant'}})")
        page.wait_for_timeout(250)
        page.screenshot(path=path)

    snap("s2", "/tmp/render/guide-s2.png")
    snap("s3", "/tmp/render/guide-s3.png")
    snap("s4", "/tmp/render/guide-s4.png")
    snap("s4", "/tmp/render/guide-s4b.png", extra=1200)
    b.close()
print("done")
