# -*- coding: utf-8 -*-
"""استخراج دقیق ردیف‌های فایل مدیران کلینیک و مسئولین اجرایی + اعتبارسنجی کد ملی"""
import json, openpyxl

SRC = "/home/z/my-project/upload/مدیران کلینیک و مسئولین اجرایی.xlsx"

def to_latin(s):
    if s is None:
        return ""
    s = str(s)
    fa = "۰۱۲۳۴۵۶۷۸۹"; ar = "٠١٢٣٤٥٦٧٨٩"
    out = ""
    for ch in s:
        if ch in fa: out += str(fa.index(ch))
        elif ch in ar: out += str(ar.index(ch))
        else: out += ch
    return out

def digits(v):
    return "".join(c for c in to_latin(v) if c.isdigit())

def fa_text(v):
    if v is None: return ""
    s = str(v).replace("ي", "ی").replace("ك", "ک").replace("\u200c", " ")
    return " ".join(s.split())

def nid_ok(nid):
    if not (len(nid) == 10 and nid.isdigit()): return False
    if len(set(nid)) == 1: return False
    s = sum(int(nid[i]) * (10 - i) for i in range(9))
    r = s % 11
    c = int(nid[9])
    return c == r if r < 2 else c == 11 - r

def norm_nid(v):
    d = digits(v)
    if 8 <= len(d) < 10: return d.zfill(10)
    return d

wb = openpyxl.load_workbook(SRC, data_only=True)
records = []
for sheet in wb.sheetnames:
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    if not rows: continue
    hdr = [fa_text(c) for c in rows[0]]
    idx = {name: i for i, name in enumerate(hdr)}
    col_prov = next((idx[k] for k in idx if k.startswith("استان")), None)
    col_name = next((idx[k] for k in idx if "نام" in k), None)
    col_nid  = next((idx[k] for k in idx if "کد ملی" in k), None)
    col_mob  = next((idx[k] for k in idx if ("همراه" in k or "تماس" in k or "موبایل" in k)), None)
    for r in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in r): continue
        name = fa_text(r[col_name]) if col_name is not None else ""
        nid = norm_nid(r[col_nid]) if col_nid is not None else ""
        mob = digits(r[col_mob]) if col_mob is not None else ""
        prov = fa_text(r[col_prov]) if col_prov is not None else ""
        if not name and not nid: continue
        records.append({
            "sheet": sheet, "province": prov, "name": name,
            "nationalId": nid, "phone": mob, "nidValid": nid_ok(nid),
        })

import sys
with open(sys.argv[1] if len(sys.argv) > 1 else "/dev/stdout", "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=1)
print("TOTAL:", len(records))
