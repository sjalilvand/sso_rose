/** شبیه‌سازی کامل جریان‌های بات بله با fetch ساختگی + دیتابیس آزمایشی (node scripts/bot-sim.cjs) */
const { scryptSync, timingSafeEqual } = require("crypto");
const path = "/home/z/my-project/scripts/bale-bot.cjs";

process.env.DATABASE_URL = process.env.SIM_DB_URL || "file:/tmp/testdb/test.db";
process.env.BALE_BOT_TOKEN = "1:test";
process.env.APP_PUBLIC_URL = "http://130.185.73.157:8082";

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

const sent = [];
const updates = [];
let updateId = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function push(msg, chatId = 555) { updates.push({ update_id: updateId++, message: { message_id: updateId, chat: { id: chatId }, from: { first_name: "هادی", last_name: "پرگیر" }, ...msg } }); }
function pushCb(data, cbId, chatId = 555) { updates.push({ update_id: updateId++, callback_query: { id: cbId, from: { first_name: "هادی" }, message: { chat: { id: chatId } }, data } }); }

function json(o) { return { ok: true, json: async () => o }; }

global.fetch = async (url, opts) => {
  const m = String(url).match(/\/bot[^/]+\/(\w+)/);
  const method = m && m[1];
  if (method === "getMe") return json({ ok: true, result: { id: 1, username: "rosepro_bot" } });
  if (method === "setMyCommands") return json({ ok: true, result: true });
  if (method === "getUpdates") {
    if (updates.length) return json({ ok: true, result: [updates.shift()] });
    await sleep(120);
    return json({ ok: true, result: [] });
  }
  if (method === "sendMessage" || method === "sendPhoto" || method === "answerCallbackQuery") {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    sent.push({ method, ts: Date.now(), ...body });
    return json({ ok: true, result: { message_id: sent.length } });
  }
  console.log("UNSUPPORTED METHOD:", method);
  return json({ ok: false, error_code: 400, description: "unsupported " + method });
};

// ---------- سناریو (ترتیب مهم است: state-polluting پیام‌ها بعد از جریان رمز) ----------
push({ text: "/start" });
push({ text: "🔑 فراموشی رمز عبور" });   // حساب متصل نیست → پرسیدن کد ملی
push({ text: "0057375437" });             // کد ملی هادی پرگیر → پرسیدن ۴ رقم
push({ text: "9999" });                   // اشتباه
push({ text: "9752" });                   // درست → اتصال + کد
pushCb("reset:inchat", "cb1");            // تغییر رمز داخل چت → پرسیدن کد
push({ text: "000000" });                 // کد اشتباه
// کد واقعی بعداً از DB خوانده و push می‌شود
// بعد از جریان رمز: وضعیت، پشتیبانی، انصراف، کد ملی نایافته

setTimeout(() => { console.log("TIMEOUT — سناریو کامل نشد"); process.exit(1); }, 90000).unref();

async function waitFor(pred, label, tries = 200) {
  for (let i = 0; i < tries; i++) {
    if (pred()) return true;
    await sleep(150);
  }
  console.log("FAIL (منتظر مانده):", label);
  return false;
}

(async () => {
  require(path); // بات شروع می‌شود

  const has = (needle) =>
    sent.some(
      (s) =>
        s.method !== "answerCallbackQuery" &&
        ((s.caption || "") + (s.text || "")).includes(needle),
    );

  let ok = true;
  ok = (await waitFor(() => has("سلام و خوش آمدید"), "welcome")) && ok;
  ok = (await waitFor(() => has("کد ملی حساب رز هاب خود را ارسال کنید"), "ask nid")) && ok;
  ok = (await waitFor(() => has("۴ رقم آخر"), "ask last4")) && ok;
  ok = (await waitFor(() => has("هم‌خوانی ندارد"), "wrong last4 error")) && ok;
  ok = (await waitFor(() => has("کد تأیید شما"), "code issued")) && ok;

  const user = await db.user.findFirst({ where: { username: "0057375437" } });
  const link = await db.baleLink.findUnique({ where: { chatId: "555" } });
  console.log("baleLink created:", !!link, link && link.userId === user.id ? "(user match)" : "");
  if (!link) ok = false;

  const token = await db.passwordResetToken.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } });
  console.log("reset token code:", token && token.code);
  if (!token) ok = false;

  ok = (await waitFor(() => has("کد ۶ رقمی"), "ask code inchat")) && ok;
  ok = (await waitFor(() => has("درست نیست یا منقضی شده"), "wrong code error")) && ok;

  push({ text: token ? token.code : "000000" });
  ok = (await waitFor(() => has("رمز عبور جدید را ارسال کنید"), "ask new password")) && ok;

  pushCb("reset:random", "cb2");
  ok = (await waitFor(() => has("رمز عبور شما با موفقیت تغییر کرد"), "success message")) && ok;

  // رمز نمایش‌داده‌شده باید واقعاً روی حساب ثبت شده باشد
  const successMsg = sent.map((s) => s.text || "").find((t) => t.includes("رمز جدید"));
  const shownPw = successMsg && (successMsg.match(/رمز جدید: <b><code>([^<]+)<\/code><\/b>/) || [])[1];
  const fresh = await db.user.findUnique({ where: { id: user.id } });
  const verify = (pw, stored) => {
    const [salt, hash] = stored.split(":");
    const c = scryptSync(pw, salt, 64);
    const o = Buffer.from(hash, "hex");
    return c.length === o.length && timingSafeEqual(c, o);
  };
  console.log("shown random password:", shownPw, "| login works:", shownPw ? verify(shownPw, fresh.passwordHash) : false);
  if (!shownPw || !verify(shownPw, fresh.passwordHash)) ok = false;

  const used = await db.passwordResetToken.findFirst({ where: { id: token.id } });
  console.log("token marked used:", !!used.usedAt, "| audit rows:", await db.auditLog.count());
  if (!used.usedAt) ok = false;

  console.log("");
  console.log("--- جریان‌های تکمیلی: وضعیت / پشتیبانی / انصراف / کد نایافته ---");
  push({ text: "👤 وضعیت حساب" });
  ok = (await waitFor(() => has("وضعیت حساب رز هاب") && has("هادی پرگیر"), "status card")) && ok;

  push({ text: "💬 پشتیبانی" });
  ok = (await waitFor(() => has("پیام، سؤال یا مشکل خود را بنویسید"), "support prompt")) && ok;
  push({ text: "سلام، در ورود به سامانه مشکل دارم" });
  ok = (await waitFor(() => has("پیام شما ثبت شد"), "support saved")) && ok;
  const tickets = await db.supportTicket.count({ where: { chatId: "555" } });
  console.log("support tickets (this chat):", tickets);
  if (tickets !== 1) ok = false;

  push({ text: "/cancel" });
  ok = (await waitFor(() => has("عملیات لغو شد"), "cancel")) && ok;

  // تست کد ملی نایافته — با یک چت جدید که حساب متصل ندارد
  push({ text: "🔑 فراموشی رمز عبور" }, 777);
  push({ text: "9999999999" }, 777);
  ok = (await waitFor(() => has("حسابی با این کد ملی در رز هاب یافت نشد"), "unknown nid")) && ok;

  const photos = sent.filter((s) => s.method === "sendPhoto").length;
  console.log("welcome photo sent:", photos > 0);

  console.log("");
  console.log("=================================================");
  console.log(ok ? ">>> ALL BOT FLOW TESTS PASSED" : ">>> SOME TESTS FAILED");
  console.log("=================================================");
  setTimeout(() => process.exit(ok ? 0 : 1), 400);
})().catch((e) => { console.error("SIM ERROR:", e); process.exit(1); });
