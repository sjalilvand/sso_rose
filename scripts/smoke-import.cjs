/* تست پایان‌به‌پایان: ورود گروهی کاربران از فایل اکسل مشاورین + لاگین با کد ملی */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const BASE = process.env.BASE || "http://127.0.0.1:3210";
const EXCEL = "/home/z/my-project/upload/اسامی مشاورین شرکت رز.xlsx";

let cookie = "";
let pass = 0, fail = 0;
function ok(cond, label, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label} ${extra}`); }
}

async function req(method, url, body, isForm) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  // پاک‌سازی: کاربران واردشدهٔ اجراهای قبلی حذف شوند تا تست تکرارپذیر باشد
  const prisma = new PrismaClient();
  const cleaned = await prisma.user.deleteMany({ where: { username: { not: null } } });
  await prisma.$disconnect();
  if (cleaned.count) console.log(`(setup: ${cleaned.count} previously imported users removed)`);

  console.log("— ورود مدیر —");
  let r = await req("POST", "/api/auth/login", { email: "admin@rose.ir", password: "rose1234" });
  ok(r.status === 200, "login admin");

  console.log("— دانلود قالب اکسل —");
  const tRes = await fetch(BASE + "/api/users/import", { headers: { cookie } });
  ok(tRes.status === 200, "template GET 200");
  const tBuf = Buffer.from(await tRes.arrayBuffer());
  ok(tBuf.length > 2000 && tBuf[0] === 0x50, `template valid xlsx (${tBuf.length} bytes)`);
  const twb = XLSX.read(tBuf);
  const tHead = XLSX.utils.sheet_to_json(twb.Sheets[twb.SheetNames[0]], { header: 1 })[0];
  ok(tHead.length === 11 && tHead[9] === "کد ملی" && tHead[10] === "شماره تماس", "template headers", JSON.stringify(tHead));

  console.log("— پیش‌نمایش فایل واقعی مشاورین —");
  const form1 = new FormData();
  form1.append("file", new Blob([fs.readFileSync(EXCEL)]), "consultants.xlsx");
  form1.append("mode", "preview");
  r = await req("POST", "/api/users/import", form1, true);
  ok(r.status === 200, "preview 200");
  const rows = r.data.rows || [];
  ok(r.data.summary.total === 216, `216 rows parsed (got ${r.data.summary.total})`);
  ok(r.data.summary.error === 4, `4 error rows (missing phone) (got ${r.data.summary.error})`);
  ok(r.data.summary.create === 212, `212 creatable (got ${r.data.summary.create})`);
  const persianDigitRow = rows.find((x) => x.row === 30);
  ok(persianDigitRow && persianDigitRow.phone === "09120592906", "Persian-digit phone normalized", JSON.stringify(persianDigitRow));
  const zeroNid = rows.find((x) => x.nationalId === "0492985340");
  ok(!!zeroNid, "leading-zero national id kept (0492985340)");
  ok(zeroNid && zeroNid.error === undefined, "leading-zero nid row valid", JSON.stringify(zeroNid));
  const errRow = rows.find((x) => x.error);
  ok(errRow && /شماره تماس/.test(errRow.error), "error reason mentions phone", errRow && errRow.error);
  ok(rows.every((x) => /^\d{10}$/.test(x.nationalId)), "all national ids are 10 digits");

  console.log("— ثبت نهایی —");
  const sysRes = await req("GET", "/api/systems");
  const attendance = (sysRes.data.systems || []).find((s) => s.url.includes(":8085")) || (sysRes.data.systems || [])[0];
  const form2 = new FormData();
  form2.append("file", new Blob([fs.readFileSync(EXCEL)]), "consultants.xlsx");
  form2.append("mode", "commit");
  form2.append("role", "THERAPIST");
  form2.append("unit", "درمان");
  form2.append("jobTitle", "مشاور");
  form2.append("resetPassword", "1");
  form2.append("systemIds", JSON.stringify(attendance ? [attendance.id] : []));
  r = await req("POST", "/api/users/import", form2, true);
  ok(r.status === 200, "commit 200");
  ok(r.data.created === 212 && r.data.updated === 0, `created 212 (got ${r.data.created}, updated ${r.data.updated})`);
  ok(r.data.failed.length === 0, "no failed rows", JSON.stringify(r.data.failed && r.data.failed.slice(0, 3)));

  console.log("— بررسی کاربر ساخته‌شده —");
  const list = await req("GET", "/api/users?withAccess=1");
  const c1 = list.data.users.find((u) => u.username === "1639818146");
  ok(!!c1, "consultant created with username=1639818146");
  ok(c1 && c1.phone === "09147446047" && c1.name === "پری ملکی گلندوز", "consultant fields", JSON.stringify(c1));
  ok(c1 && c1.email === "1639818146@rose.ir", "auto email", c1 && c1.email);
  ok(c1 && c1.province === "اردبیل" && c1.education === "کارشناسی ارشد" && c1.profRank === "متخصص", "profile fields");
  ok(c1 && c1.contractNo === "1056" && c1.provinceCode === "009006", "leading zeros kept (contract/province code)", c1 && `${c1.contractNo}/${c1.provinceCode}`);
  ok(c1 && c1.bankSheba === "230170000000339957765004", "sheba kept");
  ok(c1 && attendance && (c1.systemIds || []).includes(attendance.id), "attendance system granted");
  ok(c1 && c1.role === "THERAPIST" && c1.unit === "درمان" && c1.jobTitle === "مشاور", "role/unit/jobTitle");

  console.log("— لاگین با کد ملی و رمز موبایل —");
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: "1639818146", password: "09147446047" });
  ok(r.status === 200, "login with national id + mobile password", JSON.stringify(r.data));
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: "۱۶۳۹۸۱۸۱۴۶", password: "09147446047" });
  ok(r.status === 200, "login with PERSIAN-digit national id");
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: "1639818146", password: "wrong-pass-123" });
  ok(r.status === 401, "wrong password rejected");
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: "admin@rose.ir", password: "rose1234" });
  ok(r.status === 200, "admin email login still works");

  console.log("— SSO توکن شامل کد ملی —");
  cookie = "";
  await req("POST", "/api/auth/login", { email: "1639818146", password: "09147446047" });
  const ssoRes = await fetch(BASE + `/api/systems/${attendance.id}/sso`, { method: "POST", headers: { cookie } });
  const ssoData = await ssoRes.json();
  if (ssoRes.status === 200 && ssoData.token) {
    const payload = JSON.parse(Buffer.from(ssoData.token.split(".")[1], "base64url").toString());
    ok(payload.nationalId === "1639818146", "SSO token has nationalId claim", JSON.stringify(payload.nationalId));
    ok(payload.email === "1639818146@rose.ir", "SSO token email");
  } else {
    ok(false, "SSO launch", JSON.stringify(ssoData));
  }

  console.log("— ورود مجدد همان فایل (بروزرسانی) —");
  cookie = "";
  await req("POST", "/api/auth/login", { email: "admin@rose.ir", password: "rose1234" });
  const form3 = new FormData();
  form3.append("file", new Blob([fs.readFileSync(EXCEL)]), "consultants.xlsx");
  form3.append("mode", "commit");
  form3.append("resetPassword", "1");
  r = await req("POST", "/api/users/import", form3, true);
  ok(r.status === 200, "re-commit 200");
  ok(r.data.created === 0 && r.data.updated === 212, `0 created / 212 updated (got ${r.data.created}/${r.data.updated})`);

  console.log("— ویرایش دستی کد ملی و جلوگیری از تکرار —");
  cookie = "";
  await req("POST", "/api/auth/login", { email: "admin@rose.ir", password: "rose1234" });
  const c2 = list.data.users.find((u) => u.username === "0492985340");
  r = await req("PATCH", `/api/users/${c1.id}`, { username: "0492985340" });
  ok(r.status === 409, "duplicate national id → 409", JSON.stringify(r.data));
  r = await req("PATCH", `/api/users/${c1.id}`, { username: "۱۶۳۹۸۱۸۱۴۶", education: "دکتری", bankSheba: "IR230170000000339957765004" });
  ok(r.status === 200, "patch persian-digits nid + fields ok");
  const list2 = await req("GET", "/api/users?withAccess=1");
  const c1b = list2.data.users.find((u) => u.id === c1.id);
  ok(c1b && c1b.username === "1639818146", "nid normalized back to same value");
  ok(c1b && c1b.education === "دکتری" && c1b.bankSheba === "230170000000339957765004", "education + sheba IR-prefix stripped", c1b && `${c1b.education}/${c1b.bankSheba}`);

  console.log(`\nنتیجه: ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(1);
});
