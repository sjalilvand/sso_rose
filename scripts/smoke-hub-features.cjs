/* تست دود چرخهٔ کامل: ثبت‌نام → تأیید ادمین → ورود → فراموشی رمز → تغییر رمز */
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes, createHash } = require("crypto");
const db = new PrismaClient();
const BASE = "http://127.0.0.1:8123";

function hashPassword(p) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 64).toString("hex")}`;
}
function sha256(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [X ] ${name} ${extra}`); }
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}

(async () => {
  const NID = "1000000001";
  const PW1 = "test-pass-1", PW2 = "new-pass-2";

  // پاکسازی قبلی
  await db.registrationRequest.deleteMany({ where: { nationalId: NID } });
  await db.user.deleteMany({ where: { OR: [{ username: NID }, { email: `${NID}@rose.ir` }] } });
  await db.baleLink.deleteMany({ where: { chatId: "999777" } });

  // ۰) ادمین تستی
  let admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!admin) {
    admin = await db.user.create({
      data: {
        email: "smoke-admin@rose.ir", username: "9999999991",
        passwordHash: hashPassword("admin-pass-9"), name: "ادمین تست",
        role: "SUPER_ADMIN", status: "ACTIVE",
      },
    });
  }

  // ۱) ثبت‌نام
  let r = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName: "کاربر تستی", nationalId: NID, mobile: "09120000000", password: PW1, province: "اصفهان", clinic: "کلینیک رز" }),
  });
  check("register → 201", r.status === 201, JSON.stringify(r.data));

  // ۲) ثبت‌نام تکراری → 409
  r = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName: "کاربر تستی", nationalId: NID, mobile: "09120000000", password: PW1 }),
  });
  check("duplicate register → 409", r.status === 409, JSON.stringify(r.data));

  // ۳) ورود قبل از تأیید → 403 پیام دقیق
  r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: NID, password: PW1 }) });
  check("login before approval → 403 + pending message", r.status === 403 && /در انتظار/.test(r.data.error || ""), JSON.stringify(r.data));

  // ۴) ورود ادمین + فهرست
  const adminLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: admin.email, password: "admin-pass-9" }) });
  const cookie = (adminLogin.headers.get("set-cookie") || "").split(";")[0];
  check("admin login → 200", adminLogin.status === 200, JSON.stringify(adminLogin.data));
  r = await api("/api/admin/registrations", { headers: { cookie } });
  check("admin list → 200 with pending=1", r.status === 200 && r.data.counts && r.data.counts.pending >= 1, JSON.stringify(r.data.counts));
  const req = (r.data.requests || []).find((x) => x.nationalId === NID);
  check("request found", !!req);

  // ۵) غیرادمین → 403
  r = await api("/api/admin/registrations");
  check("list without auth → 401", r.status === 401, JSON.stringify(r.data));

  // ۶) تأیید
  r = await api("/api/admin/registrations", { method: "POST", headers: { cookie }, body: JSON.stringify({ id: req.id, action: "approve" }) });
  check("approve → 200", r.status === 200, JSON.stringify(r.data));
  const newUser = await db.user.findFirst({ where: { username: NID } });
  check("user created after approval", !!newUser && newUser.status === "ACTIVE" && newUser.phone === "09120000000");

  // ۷) تأیید مجدد → 409
  r = await api("/api/admin/registrations", { method: "POST", headers: { cookie }, body: JSON.stringify({ id: req.id, action: "approve" }) });
  check("re-approve → 409", r.status === 409, JSON.stringify(r.data));

  // ۸) ورود پس از تأیید → 200
  r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: NID, password: PW1 }) });
  check("login after approval → 200", r.status === 200, JSON.stringify(r.data));

  // ۹) فراموشی رمز بدون اتصال بات → 404 با راهنما
  r = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ nationalId: NID }) });
  check("forgot without bale link → 404 + guidance", r.status === 404 && /rosepro_bot/.test(r.data.error || ""), JSON.stringify(r.data));

  // ۱۰) اتصال بات (چت آزمایشی) → فراموشی → خطای ارسال بله (چت وجود ندارد) → 502
  await db.baleLink.create({ data: { chatId: "999777", userId: newUser.id } });
  r = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ nationalId: NID }) });
  check("forgot with fake chat → 502 send failure", r.status === 502, JSON.stringify(r.data));
  const rec = await db.passwordResetToken.findFirst({ where: { userId: newUser.id } });
  check("reset token stored (hashed)", !!rec && rec.usedAt === null && rec.tokenHash.length === 64);

  // ۱۱) تغییر رمز با توکن معتبر (ساخته‌شده مستقیم در DB)
  const rawToken = randomBytes(24).toString("hex");
  await db.passwordResetToken.deleteMany({ where: { userId: newUser.id } });
  await db.passwordResetToken.create({
    data: { tokenHash: sha256(rawToken), code: "123456", userId: newUser.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });
  r = await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: rawToken, password: PW2 }) });
  check("reset with valid token → 200", r.status === 200, JSON.stringify(r.data));
  r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: NID, password: PW2 }) });
  check("login with new password → 200", r.status === 200, JSON.stringify(r.data));

  // ۱۲) توکن مصرف‌شده دوباره → 400
  r = await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token: rawToken, password: PW2 }) });
  check("reused token → 400", r.status === 400, JSON.stringify(r.data));

  console.log(`\nنتایج: ${pass} پاس، ${fail} شکست`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error("FATAL", e);
  await db.$disconnect();
  process.exit(1);
});
