/* تست پارس فایل نمونهٔ گزارش خدمات — بند ۷ */
import { readFileSync } from "node:fs";
import { parseReportWorkbook, summarize } from "../src/lib/excel-report.ts";

const file = process.argv[2] || "/home/z/my-project/upload/خدمات آزاد شهریور 1405 کلی.xlsx";
const buf = readFileSync(file);
const parsed = parseReportWorkbook(buf, file.split("/").pop() || file);

console.log("=== نتیجهٔ پارس ===");
console.log("دوره:", parsed.year, "/", parsed.month, "| شیت:", parsed.sheet);
console.log("تعداد مشاوران:", parsed.nConsultants);
console.log("تعداد خدمت‌ها:", parsed.blocks.length);
console.log("تعداد جمع استان:", parsed.provinceTotals.length);
console.log("جمع کل:", parsed.grand ? JSON.stringify(parsed.grand) : "null");
console.log("خلاصه:", JSON.stringify(summarize(parsed)));
console.log("نمونهٔ خدمت‌ها:", parsed.blocks.slice(0, 5).map((b) => b.name + " (" + b.code + ")"));
const withMoney = parsed.consultants.filter((c) => c.totals.gross > 0);
console.log("مشاوران با مبلغ:", withMoney.length);
if (withMoney[0]) {
  const c = withMoney[0];
  console.log("نمونه:", c.province, "|", c.name, "| جلسات:", c.totals.count, "| ناخالص:", c.totals.grossPay, "| خالص:", c.totals.netPaid);
}
