#!/usr/bin/env python3
"""Screenshot the admin guide HTML (top, sections, console errors)."""
from playwright.sync_api import sync_playwright

DOC = "file:///home/z/my-project/download/rose-hub-admin-guide.html"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1100, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(DOC, wait_until="networkidle")
    page.wait_for_timeout(800)

    # full height
    h = page.evaluate("document.body.scrollHeight")
    print("page height:", h)

    page.screenshot(path="/tmp/render/guide-top.png")
    page.evaluate("document.getElementById('s2').scrollIntoView()")
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/render/guide-s2.png")
    page.evaluate("document.getElementById('s3').scrollIntoView()")
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/render/guide-s3.png")
    page.evaluate("document.getElementById('s4').scrollIntoView()")
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/render/guide-s4.png")

    # test copy button
    page.evaluate("window.scrollTo(0,0)")
    btn = page.locator("figure.cmd .copy").first
    btn.click()
    page.wait_for_timeout(400)
    print("copy button text after click:", btn.inner_text())

    # check placeholder leftovers
    body = page.content()
    for bad in ["@@RESET_JS@@", "TODO", "undefined", "NaN", "XXX"]:
        if bad in body:
            print("LEFTOVER FOUND:", bad)
    print("console/page errors:", errors if errors else "none")
    b.close()
print("done")
