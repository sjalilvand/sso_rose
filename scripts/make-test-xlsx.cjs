/**
 * make-test-xlsx.cjs — ساخت فایل اکسل آزمایشی برای تست آپلود
 */
const XLSX = require("xlsx");

const rows = [
  ["نام", "مرکز", "ماه", "تعداد جلسات", "مبلغ"],
  ["مشاور الف", "کلینیک تهران", "خرداد", 42, 1200000],
  ["مشاور ب", "کلینیک تهران", "خرداد", 31, 900000],
  ["مشاور ج", "کلینیک شیراز", "خرداد", 55, 1500000],
  ["مشاور د", "کلینیک شیراز", "تیر", 27, 700000],
  ["مشاور ه", "کلینیک اصفهان", "تیر", 60, 1800000],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "گزارش");
XLSX.writeFile(wb, "/tmp/test-report.xlsx");
console.log("written /tmp/test-report.xlsx");
