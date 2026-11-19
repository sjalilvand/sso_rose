#!/usr/bin/env python3
"""patch-schema.py — افزودن فیلد شهرستان + مدل‌های داشبورد عمومی اکسل و دسترسی صفحات"""
import re, sys

P = "/home/z/my-project/prisma/schema.prisma"
s = open(P, encoding="utf-8").read()
orig = s

# ۱) فیلد شهرستان در Center
if "county" not in s:
    s = s.replace(
        '  province  String   @default("")\n  city      String   @default("")\n',
        '  province  String   @default("")\n'
        '  county    String   @default("") // شهرستان — سطح بین استان و شهر برای سلسله‌مراتب\n'
        '  city      String   @default("")\n',
        1,
    )

# ۲) روابط جدید روی User (بعد از reportFiles)
if "excelDatasets" not in s:
    s = s.replace(
        "  reportFiles       ReportFile[]\n",
        "  reportFiles       ReportFile[]\n"
        "  excelDatasets     ExcelDataset[]\n"
        "  customIndicators CustomIndicator[]\n"
        "  pagePermissions  PagePermission[]\n",
        1,
    )

# ۳) مدل‌های جدید در انتهای فایل
NEW = '''
// ---------- داشبورد عمومی اکسل (هر ساختاری) — فاز ۷۳ ----------

// فایل اکسل بارگذاری‌شده با ساختار دلخواه — ستون‌ها خودکار تشخیص داده می‌شوند
model ExcelDataset {
  id           String   @id @default(cuid())
  name         String // نام فایل
  sheetNames   String   @default("[]") // نام شیت‌ها (JSON)
  activeSheet  String   @default("") // شیت پیش‌فرض
  columns      String   @default("[]") // [{name,type}] — type: number/text/date
  rows         String   @default("[]") // رکوردها (JSON — تا سقف مجاز)
  profile      String   @default("{}") // پروفایل آماری ستون‌ها (JSON)
  nRows        Int      @default(0) // تعداد رکوردهای ذخیره‌شده
  nRowsTotal   Int      @default(0) // تعداد کل رکوردهای فایل اصلی
  uploadedById String?
  createdAt    DateTime @default(now())

  uploadedBy User? @relation(fields: [uploadedById], references: [id], onDelete: SetNull)

  @@index([createdAt])
}

// شاخص سفارشی — فرمول محاسبه‌شده روی ستون‌های داده (سطح ردیف یا کل داده)
model CustomIndicator {
  id          String   @id @default(cuid())
  name        String
  formula     String
  kind        String   @default("ROW") // ROW = ستون محاسباتی، AGG = شاخص کل
  description String   @default("")
  createdById String?
  createdAt   DateTime @default(now())

  createdBy User? @relation(fields: [createdById], references: [id], onDelete: SetNull)
}

// دسترسی صفحات در سطح کاربر — کدام فرم/صفحه دیده شود یا نشود (فاز ۷۳)
model PagePermission {
  id      String  @id @default(cuid())
  userId  String
  pageKey String // کلید صفحه — src/lib/pages.ts
  allowed Boolean @default(true)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, pageKey])
  @@index([userId])
}
'''
if "model ExcelDataset" not in s:
    s = s.rstrip() + "\n" + NEW

if s == orig:
    print("NOTHING CHANGED — anchors missing!")
    sys.exit(1)
open(P, "w", encoding="utf-8").write(s)
print("schema patched: county + ExcelDataset + CustomIndicator + PagePermission")
