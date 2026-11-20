/**
 * check-db-health.cjs — اسکن سلامت دیتابیس رز هاب (تشخیص و تعمیر خطای ۵۰۰ گزارش‌ها)
 *
 * روش کار:
 *   هرگز مقدار خام ستون‌ها را مستقیم select نمی‌کند (خودِ این کار روی ردیف خراب
 *   خطای «Conversion failed» می‌دهد — همان علت ۵۰۰ سرور). به‌جای آن از
 *   typeof() و quote() استفاده می‌کند که روی هر مقداری کار می‌کنند.
 *
 *   ۱) برای همهٔ مدل‌ها/ستون‌ها نوع ذخیره‌شدهٔ SQLite را با نوع Prisma مقایسه می‌کند
 *   ۲) مقادیر DateTime را از نظر معتبر بودن بررسی می‌کند
 *   ۳) کوئری‌های واقعی صفحات گزارش را تست می‌کند و اگر شکست بخورند، ردیف و
 *      ستون سمّی را دقیقاً مشخص می‌کند
 *
 * اجرا:
 *   node scripts\check-db-health.cjs            — فقط تشخیص
 *   node scripts\check-db-health.cjs --fix      — تشخیص + تعمیر خودکار
 *                                                 (مقدار تاریخ خراب → NULL،
 *                                                 فقط ستون‌های nullable)
 */
const { resolveDatabaseUrl } = require("./lib-env.cjs");
resolveDatabaseUrl();
const { PrismaClient, Prisma } = require("@prisma/client");
const db = new PrismaClient();
const FIX = process.argv.includes("--fix");

const EXPECTED_TYPEOF = {
  // Prisma 5/6 تاریخ‌ها را INTEGER (میلی‌ثانیه) ذخیره می‌کند؛ نسخه‌های قدیمی TEXT (ISO) — هر دو معتبر
  DateTime: ["integer", "text"],
  String: ["text"],
  Int: ["integer"],
  BigInt: ["integer"],
  Float: ["real", "integer"],
  Decimal: ["real", "integer"],
  Boolean: ["integer"],
  Json: ["text"],
};
const MAX_MS = 4102444800000; // سال ۲۱۰۰

function tableOf(m) { return m.dbName || m.name; }
function colOf(f) { return f.dbName || f.name; }

/** خروجی quote() را به مقدار تقریبی JS برمی‌گرداند — بدون materialize کردن خود ستون */
function decodeQuote(q, t) {
  if (q === null || q === "NULL") return null;
  if (t === "integer" || t === "real") { const n = Number(q); return isNaN(n) ? q : n; }
  if (t === "text") {
    if (q.length >= 2 && q.startsWith("'") && q.endsWith("'")) return q.slice(1, -1).replace(/''/g, "'");
    return q;
  }
  return `BLOB(${String(q).length} bytes)`;
}

/** null = سالم؛ رشته = توضیح خرابی */
function checkDateValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v > 0 && v < MAX_MS ? null : `عدد خارج از بازهٔ تاریخ: ${v}`;
  if (typeof v === "string") {
    const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
    return isNaN(d.getTime()) ? `متن غیرتاریخی: "${v.slice(0, 40)}"` : null;
  }
  return `نوع غیرمنتظره: ${typeof v}`;
}

(async () => {
  console.log("=================================================================");
  console.log("  اسکن سلامت دیتابیس — رز هاب" + (FIX ? "  (حالت تعمیر)" : ""));
  console.log("=================================================================");

  const models = Prisma.dmmf.datamodel.models;
  const poisoned = []; // {model, table, col, rowid, reason, nullable}
  let scanErrors = 0;

  // ---------- ۱) اسکن همهٔ ستون‌ها ----------
  for (const m of models) {
    const t = tableOf(m);
    for (const f of m.fields) {
      if (f.kind !== "scalar") continue;
      const allowed = EXPECTED_TYPEOF[f.type];
      if (!allowed) continue;
      const c = colOf(f);
      try {
        // نوع‌های موجود در ستون (به‌همراه تعداد) — ایمن حتی روی مقدار خراب
        const groups = await db.$queryRawUnsafe(
          `SELECT typeof("${c}") AS tv, COUNT(*) AS n FROM "${t}" WHERE "${c}" IS NOT NULL GROUP BY typeof("${c}")`
        );
        for (const g of groups) {
          const tv = String(g.tv);
          const n = Number(g.n);
          if (!allowed.includes(tv)) {
            console.log(`  [خراب] ${m.name}.${c} — نوع SQLite: ${tv} (انتظار: ${allowed.join("/")}) — ${n} ردیف`);
            const samples = await db.$queryRawUnsafe(
              `SELECT rowid AS rid, quote("${c}") AS q FROM "${t}" WHERE typeof("${c}") = '${tv}' LIMIT 5`
            );
            for (const s of samples) console.log(`         ردیف rowid=${s.rid} مقدار=${String(s.q).slice(0, 60)}`);
            poisoned.push({ model: m.name, table: t, col: c, typeIssue: tv, nullable: !f.isRequired, count: n });
          }
        }
        // بررسی مقادیر DateTime (هر دو فرمت integer و text)
        if (f.type === "DateTime") {
          const vals = await db.$queryRawUnsafe(
            `SELECT rowid AS rid, typeof("${c}") AS tv, quote("${c}") AS q FROM "${t}" WHERE "${c}" IS NOT NULL LIMIT 200000`
          );
          let shown = 0;
          for (const r of vals) {
            const reason = checkDateValue(decodeQuote(String(r.q), String(r.tv)));
            if (reason) {
              poisoned.push({ model: m.name, table: t, col: c, rowid: r.rid, reason, nullable: !f.isRequired });
              if (shown < 10) { console.log(`  [تاریخ نامعتبر] ${m.name}.${c} — rowid=${r.rid} — ${reason}`); shown++; }
              else if (shown === 10) { console.log("  ... (موارد بیشتر قطع شد)"); shown++; }
            }
          }
        }
      } catch (e) {
        scanErrors++;
        console.log(`  [خطا] اسکن ${m.name}.${c}: ${String(e.message).replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
  }
  if (poisoned.length === 0 && scanErrors === 0) console.log("  [OK] همهٔ ستون‌ها از نظر نوع و تاریخ سالم هستند");

  // ---------- ۲) تعمیر خودکار ----------
  if (FIX && poisoned.length > 0) {
    console.log("");
    console.log("  ---------- تعمیر خودکار ----------");
    let fixed = 0, skipped = 0;
    const seen = new Set();
    for (const p of poisoned) {
      if (!p.nullable) { skipped++; console.log(`  [رد شد] ${p.model}.${p.col} غیر-nullable است — تعمیر خودکار نمی‌شود (فقط گزارش)`); continue; }
      const key = `${p.table}.${p.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        // هر مقداری که با typeof/quote قابل اعتبارسنجی نبود → NULL
        const rows = await db.$queryRawUnsafe(`SELECT rowid AS rid, typeof("${p.col}") AS tv, quote("${p.col}") AS q FROM "${p.table}" WHERE "${p.col}" IS NOT NULL LIMIT 200000`);
        let n = 0;
        for (const r of rows) {
          const v = decodeQuote(String(r.q), String(r.tv));
          const bad = p.typeIssue ? true : !!checkDateValue(v);
          if (bad) {
            await db.$executeRawUnsafe(`UPDATE "${p.table}" SET "${p.col}" = NULL WHERE rowid = ${Number(r.rid)}`);
            n++;
          }
        }
        fixed += n;
        console.log(`  [تعمیر شد] ${p.table}.${p.col} — ${n} ردیف → NULL`);
      } catch (e) {
        console.log(`  [خطا] تعمیر ${p.table}.${p.col}: ${String(e.message).replace(/\s+/g, " ").slice(0, 100)}`);
      }
    }
    console.log(`  نتیجهٔ تعمیر: ${fixed} ستون-ردیف تعمیر شد، ${skipped} مورد غیر-nullable فقط گزارش شد`);
  }

  // ---------- ۳) تست کوئری‌های واقعی صفحات گزارش ----------
  console.log("");
  console.log("  ---------- تست کوئری‌های صفحات گزارش ----------");
  const pageQueries = [
    { label: "GET /api/reports (dashboard)", model: "Task", q: () => db.task.findMany({ select: { status: true, priority: true, dueDate: true, completedAt: true, createdAt: true } }) },
    { label: "  - کاربران", model: "User", q: () => db.user.findMany({ select: { status: true, role: true, unit: true, lastLoginAt: true } }) },
    { label: "  - اطلاعیه‌ها", model: "Announcement", q: () => db.announcement.findMany({ include: { acks: true } }) },
    { label: "  - رویدادهای تقویم", model: "CalendarEvent", q: () => db.calendarEvent.findMany({ take: 50 }) },
    { label: "GET /api/reports/excel", model: "ReportFile", q: () => db.reportFile.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }] }) },
    { label: "GET /api/reports/dataset", model: "ExcelDataset", q: () => db.excelDataset.findMany({ orderBy: { createdAt: "desc" } }) },
    { label: "GET /api/reports/indicators", model: "CustomIndicator", q: () => db.customIndicator.findMany() },
  ];
  let failing = 0;
  for (const t of pageQueries) {
    try {
      const rows = await t.q();
      console.log(`  [OK] ${t.label} — ${rows.length} ردیف`);
    } catch (e) {
      failing++;
      console.log(`  [۵۰۰!] ${t.label} — این کوئری در سرور خطا می‌دهد`);
      console.log(`         خطا: ${String(e.message).replace(/\s+/g, " ").slice(0, 140)}`);
      // پیدا کردن ردیف/ستون سمّی با روش ایمن (quote/typeof)
      const m = models.find((x) => x.name === t.model);
      if (m) {
        const tbl = tableOf(m);
        try {
          for (const f of m.fields) {
            if (f.kind !== "scalar") continue;
            const allowed = EXPECTED_TYPEOF[f.type];
            if (!allowed) continue;
            const c = colOf(f);
            const vals = await db.$queryRawUnsafe(
              `SELECT rowid AS rid, typeof("${c}") AS tv, quote("${c}") AS q FROM "${tbl}" WHERE "${c}" IS NOT NULL LIMIT 200000`
            );
            for (const r of vals) {
              const tv = String(r.tv);
              const bad = tv === "text" && f.type === "DateTime" ? checkDateValue(decodeQuote(String(r.q), tv))
                : !allowed.includes(tv) ? `نوع SQLite: ${tv}` : null;
              if (bad) console.log(`         ردیف سمّی: ${tbl} rowid=${r.rid} ستون «${c}» — ${bad} — مقدار=${String(r.q).slice(0, 50)}`);
            }
          }
        } catch (e2) {
          console.log(`         اسکن دستی ${tbl}: ${String(e2.message).replace(/\s+/g, " ").slice(0, 100)}`);
        }
      }
    }
  }

  console.log("");
  console.log("=================================================================");
  const total = poisoned.length + scanErrors + failing;
  console.log(total === 0
    ? "  نتیجه: دیتابیس کاملاً سالم است — مشکل جای دیگری است (لاگ سرور را بفرستید)"
    : `  نتیجه: ${total} مشکل پیدا شد${FIX ? "" : " — برای تعمیر خودکار: node scripts\\check-db-health.cjs --fix"}`);
  console.log("  این خروجی را کامل برای دستیار بفرستید.");
  console.log("=================================================================");
  await db.$disconnect();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
