#!/usr/bin/env node
/**
 * rose-bale-bot.cjs (نسخهٔ گرافیکی ۲) — بات پشتیبانی و بازیابی رمز رز هاب در پیام‌رسان بله
 *
 * نام بات : @rosepro_bot   (ble.ir/rosepro_bot)
 * روش کار : long-polling روی getUpdates (نیازی به وب‌هوک/HTTPS ندارد)
 *
 * ویژگی‌های نسخهٔ گرافیکی:
 *   🖼 بنر خوش‌آمد گرافیکی در /start
 *   ⌨️ منوی دکمه‌ای + دکمه‌های شیشه‌ای (inline keyboard) در همهٔ مراحل
 *   🔑 فراموشی رمز کاملاً داخل چت — بدون نیاز به بازکردن مرورگر:
 *        کد ملی → ۴ رقم آخر موبایل → کد ۶ رقمی → رمز جدید (یا دکمهٔ رمز تصادفی)
 *   🌐 به‌علاوهٔ دکمهٔ صفحهٔ گرافیکی تغییر رمز برای کسانی که مرورگر را ترجیح می‌دهند
 *   👤 وضعیت حساب | 🔗 اتصال حساب | 💬 پشتیبانی | ℹ️ راهنما | ❌ انصراف در هر مرحله
 *
 * اجرا (روی سرور):  pm2 restart rose-bale-bot   (اپ داخل ecosystem.config.js)
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ---------- env (.env رز هاب را هم می‌خواند) ----------
function loadDotEnv() {
  const candidates = [path.join(__dirname, "..", ".env"), path.join(__dirname, ".env")];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        const val = m[2].replace(/^["']|["']$/g, "");
        if (!(key in process.env)) process.env[key] = val;
      }
    } catch (_) { /* بی‌صدا */ }
  }
}
loadDotEnv();

const BALE_API = "https://tapi.bale.ai";
const BOT_TOKEN = (process.env.BALE_BOT_TOKEN || "").trim();
const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL || "http://130.185.73.157:8082").replace(/\/$/, "");
const RESET_TTL_MINUTES = 15;
const BANNER_URL = `${APP_PUBLIC_URL}/bale-banner.png`;

if (!BOT_TOKEN) {
  console.error("[bale-bot] BALE_BOT_TOKEN تنظیم نشده است — خروج.");
  process.exit(1);
}

// ---------- Prisma ----------
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

function sha256(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
function digits(raw) {
  const map = { "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
  return String(raw).replace(/[۰-۹٠-٩]/g, (d) => map[d]).replace(/[^0-9]/g, "");
}
function log(...args) {
  console.log(`[bale-bot ${new Date().toISOString()}]`, ...args);
}

// رمز تصادفی قابل‌خواندن — بدون حروف گنگ (0/O و 1/l/I)
function randomPassword() {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const numerals = "23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += letters[crypto.randomInt(letters.length)];
  for (let i = 0; i < 3; i++) out += numerals[crypto.randomInt(numerals.length)];
  return out;
}

const ROLE_LABELS = {
  SUPER_ADMIN: "مدیر کل",
  UNIT_MANAGER: "مدیر واحد",
  THERAPIST: "درمانگر / کارشناس",
  STAFF: "پذیرش و پشتیبانی",
  TEACHER: "مدرس / همکار آموزشی",
  EXTERNAL: "کاربر بیرونی",
};

// ---------- Bale API ----------
async function bale(method, payload, timeoutMs = 35000) {
  const res = await fetch(`${BALE_API}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`${method} failed: ${JSON.stringify(data).slice(0, 300)}`);
  return data.result;
}

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "🔑 فراموشی رمز عبور" }, { text: "🔗 اتصال حساب" }],
      [{ text: "👤 وضعیت حساب" }, { text: "💬 پشتیبانی" }],
      [{ text: "ℹ️ راهنما" }],
    ],
    resize_keyboard: true,
  };
}

// دکمهٔ انصراف شیشه‌ای — در همهٔ مراحل ورود اطلاعات
function cancelInline() {
  return { inline_keyboard: [[{ text: "❌ انصراف", callback_data: "reset:cancel" }]] };
}

async function send(chatId, text, replyMarkup) {
  try {
    await bale("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  } catch (e) {
    log("sendMessage error:", e.message);
  }
}

/** بنر گرافیکی با کپشن — اگر ارسال عکس ممکن نشد، پیام متنی جایگزین می‌شود */
async function sendWelcome(chatId, text, replyMarkup) {
  try {
    await bale("sendPhoto", {
      chat_id: chatId,
      photo: BANNER_URL,
      caption: text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  } catch (e) {
    log("sendPhoto skipped:", e.message);
    await send(chatId, text, replyMarkup);
  }
}

async function toast(chatId, queryId, text) {
  await bale("answerCallbackQuery", { callback_query_id: queryId, text: text || undefined }).catch(() => {});
}

// ---------- وضعیت گفتگو (در حافظه) ----------
// chatState: Map<chatId, { flow, temp }>
// flowها: reset-nid, reset-mob, reset-code, reset-pass, support, link-nid, link-mob
const chatState = new Map();

const WELCOME_TEXT = [
  "سلام و خوش آمدید 🌹",
  "",
  "من بات پشتیبانی <b>رز هاب</b> هستم.",
  "",
  "🔑 <b>فراموشی رمز عبور</b> — بدون مرورگر، همین‌جا با چند دکمه",
  "🔗 <b>اتصال حساب</b> — پیوند حساب رز هاب به این چت",
  "👤 <b>وضعیت حساب</b> — مشخصات حساب متصل‌شده",
  "💬 <b>پشتیبانی</b> — پیام مستقیم به مدیر مجموعه",
  "",
  "یکی از دکمه‌های زیر را بزنید:",
].join("\n");

const HELP_TEXT = [
  "🤖 <b>راهنمای بات پشتیبانی رز هاب</b> (@rosepro_bot)",
  "",
  "🔑 <b>فراموشی رمز عبور</b>",
  "مرحلهٔ ۱ — اگر حساب‌تان متصل نیست: کد ملی و بعد ۴ رقم آخر موبایل را می‌فرستید.",
  "مرحلهٔ ۲ — کد ۶ رقمی همین‌جا برای شما ارسال می‌شود.",
  "مرحلهٔ ۳ — دکمهٔ «تغییر رمز در همین چت» را می‌زنید، کد را می‌فرستید و رمز جدید را انتخاب می‌کنید.",
  "اگر دکمهٔ «رمز تصادفی» را بزنید، خود بات یک رمز مطمئن می‌سازد و برای شما نشان می‌دهد.",
  "🌐 دکمهٔ «صفحهٔ گرافیکی تغییر رمز» هم برای علاقه‌مندان به مرورگر موجود است.",
  "",
  "🔗 <b>اتصال حساب</b> — کد ملی + ۴ رقم آخر موبایل (یک‌بار برای همیشه)",
  "👤 <b>وضعیت حساب</b> — نام، نقش و استان حساب متصل‌شده",
  "💬 <b>پشتیبانی</b> — پیام شما برای مدیر مجموعه ثبت و اعلان می‌شود",
  "",
  "آدرس ورود رز هاب:",
  `<code>${APP_PUBLIC_URL}</code>`,
  "",
  "اگر حساب ندارید، از مدیر مجموعه بخواهید حساب شما را بسازد یا از صفحهٔ ورود رز هاب «ثبت‌نام» بزنید — ورود پس از تأیید مدیر فعال می‌شود.",
  "در هر مرحله با دکمهٔ «انصراف» یا دستور /cancel می‌توانید برگردید.",
].join("\n");

// ---------- جریان‌ها ----------
async function findUserByNid(nid) {
  return db.user.findFirst({
    where: { OR: [{ username: nid }, { email: `${nid}@rose.ir` }] },
  });
}

async function upsertBaleLink(chatId, userId) {
  const byChat = await db.baleLink.findUnique({ where: { chatId } });
  const byUser = await db.baleLink.findUnique({ where: { userId } });
  if (byChat && byUser && byChat.id === byUser.id) return;
  if (byChat) {
    await db.baleLink.update({ where: { id: byChat.id }, data: { userId } });
  } else if (byUser) {
    await db.baleLink.update({ where: { id: byUser.id }, data: { chatId } });
  } else {
    await db.baleLink.create({ data: { chatId, userId } });
  }
}

async function createPasswordReset(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const code = String(crypto.randomInt(100000, 1000000));
  await db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await db.passwordResetToken.create({
    data: {
      tokenHash: sha256(token),
      code,
      userId,
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    },
  });
  return { token, code };
}

/** ارسال کد + منوی گرافیکی ادامهٔ کار (داخل چت یا صفحهٔ وب) */
async function issueReset(chatId, user) {
  const { token, code } = await createPasswordReset(user.id);
  const resetUrl = `${APP_PUBLIC_URL}/reset-password?token=${token}`;
  await send(
    chatId,
    [
      "🔑 <b>بازیابی رمز عبور رز هاب</b>",
      "",
      `سلام ${user.name}،`,
      `کد تأیید شما: <b><code>${code}</code></b>`,
      "",
      `این کد ${RESET_TTL_MINUTES} دقیقه اعتبار دارد.`,
      "برای ادامه یکی از دکمه‌های زیر را بزنید:",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "✏️ تغییر رمز در همین چت", callback_data: "reset:inchat" }],
        [{ text: "🌐 صفحهٔ گرافیکی تغییر رمز", url: resetUrl }],
        [
          { text: "🔄 ارسال دوبارهٔ کد", callback_data: "reset:newcode" },
          { text: "❌ انصراف", callback_data: "reset:cancel" },
        ],
      ],
    },
  );
  log(`reset token issued for user ${user.id}`);
}

async function startResetFlow(chatId) {
  const link = await db.baleLink.findUnique({
    where: { chatId },
    include: { user: { select: { id: true, name: true, status: true } } },
  });
  if (!link) {
    chatState.set(chatId, { flow: "reset-nid", temp: {} });
    await send(
      chatId,
      [
        "🔑 <b>بازیابی رمز عبور</b> — مرحلهٔ ۱ از ۳",
        "",
        "برای بازیابی رمز، اول باید هویت شما تأیید شود.",
        "<b>کد ملی حساب رز هاب خود را ارسال کنید:</b>",
      ].join("\n"),
      cancelInline(),
    );
    return;
  }
  if (link.user.status !== "ACTIVE") {
    await send(chatId, "حساب شما فعال نیست؛ با مدیر سامانه تماس بگیرید.", mainKeyboard());
    return;
  }
  await issueReset(chatId, link.user);
}

async function handleResetNid(chatId, text) {
  const nid = digits(text);
  if (nid.length !== 10) {
    await send(chatId, "کد ملی باید دقیقاً ۱۰ رقم باشد. لطفاً دوباره ارسال کنید:", cancelInline());
    return;
  }
  const user = await findUserByNid(nid);
  if (!user) {
    chatState.delete(chatId);
    await send(
      chatId,
      [
        "حسابی با این کد ملی در رز هاب یافت نشد.",
        "",
        "اگر حساب ندارید، از مدیر مجموعه بخواهید حساب شما را بسازد، یا از صفحهٔ ورود رز هاب روی «ثبت‌نام» بزنید:",
        `<code>${APP_PUBLIC_URL}/register</code>`,
      ].join("\n"),
      { inline_keyboard: [[{ text: "🏠 منوی اصلی", callback_data: "home:main" }]] },
    );
    return;
  }
  if (!user.phone || digits(user.phone).length < 4) {
    chatState.delete(chatId);
    await send(
      chatId,
      "برای حساب شما شماره موبایلی ثبت نشده است؛ برای امنیتِ تأیید هویت، ۴ رقم آخر موبایل لازم است. با مدیر مجموعه تماس بگیرید تا موبایل شما در پروفایل ثبت شود.",
      { inline_keyboard: [[{ text: "🏠 منوی اصلی", callback_data: "home:main" }]] },
    );
    return;
  }
  chatState.set(chatId, { flow: "reset-mob", temp: { nid, name: user.name } });
  await send(
    chatId,
    [
      `سلام ${user.name} 👋 — مرحلهٔ ۲ از ۳`,
      "",
      "برای تأیید هویت، <b>۴ رقم آخر شماره موبایل</b> حساب خود را ارسال کنید:",
    ].join("\n"),
    cancelInline(),
  );
}

async function handleResetMob(chatId, text) {
  const state = chatState.get(chatId);
  const last4 = digits(text);
  if (last4.length !== 4) {
    await send(chatId, "فقط ۴ رقم آخر موبایل را بفرستید (مثلاً ۳۶۸۰):", cancelInline());
    return;
  }
  const user = await findUserByNid(state.temp.nid);
  if (!user || !user.phone.endsWith(last4)) {
    await send(chatId, "۴ رقم آخر با موبایل ثبت‌شده در پروفایل شما هم‌خوانی ندارد. دوباره ارسال کنید:", cancelInline());
    return;
  }
  await upsertBaleLink(chatId, user.id);
  chatState.delete(chatId);
  await send(
    chatId,
    ["✅ <b>هویت شما تأیید شد</b>", "", "از این به بعد کدهای بازیابی رمز همین‌جا برای شما ارسال می‌شود."].join("\n"),
  );
  await issueReset(chatId, user);
}

async function pendingResetToken(userId) {
  return db.passwordResetToken.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

async function applyNewPassword(chatId, user, record, newPassword, showPassword) {
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: hashPasswordForBot(newPassword) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
  ]);
  await db.auditLog
    .create({
      data: {
        userId: user.id,
        userName: user.name,
        action: "تغییر رمز عبور از طریق بات بله (داخل چت)",
        entity: "auth",
      },
    })
    .catch(() => {});

  chatState.delete(chatId);
  const lines = [
    "✅ <b>رمز عبور شما با موفقیت تغییر کرد</b>",
    "",
    `نام کاربری (کد ملی): <code>${user.username || ""}</code>`,
  ];
  if (showPassword) {
    lines.push(`رمز جدید: <b><code>${newPassword}</code></b>`);
    lines.push("", "این پیام رمز شما را نشان می‌دهد؛ بهتر است پس از یادداشت، آن را حذف کنید.");
  }
  lines.push("", "همهٔ نشست‌های قبلی شما بسته شد؛ حالا با رمز جدید وارد شوید:");
  await send(chatId, lines.join("\n"), {
    inline_keyboard: [
      [{ text: "🌐 ورود به رز هاب", url: `${APP_PUBLIC_URL}/login` }],
      [{ text: "🏠 منوی اصلی", callback_data: "home:main" }],
    ],
  });
  log(`password changed in-chat for user ${user.id}`);
}

// هش رمز — دقیقاً همان قالب src/lib/auth.ts (scrypt با کلید ۶۴ بایتی، قالب salt:hash)
function hashPasswordForBot(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function handleResetCode(chatId, text) {
  const state = chatState.get(chatId);
  const user = await db.user.findUnique({ where: { id: state.temp.userId } });
  if (!user) {
    chatState.delete(chatId);
    await send(chatId, "خطای وضعیت؛ از «🔑 فراموشی رمز عبور» دوباره شروع کنید.", mainKeyboard());
    return;
  }
  const record = await pendingResetToken(user.id);
  const code = digits(text);
  if (!record || record.code !== code) {
    await send(
      chatId,
      ["کد وارد‌شده درست نیست یا منقضی شده است.", "", "کد ۶ رقمی جدید را بفرستید یا «🔄 ارسال دوبارهٔ کد» را بزنید:"].join("\n"),
      {
        inline_keyboard: [
          [{ text: "🔄 ارسال دوبارهٔ کد", callback_data: "reset:newcode" }],
          [{ text: "❌ انصراف", callback_data: "reset:cancel" }],
        ],
      },
    );
    return;
  }
  chatState.set(chatId, { flow: "reset-pass", temp: { userId: user.id, tokenId: record.id } });
  await send(
    chatId,
    [
      "🔐 <b>مرحلهٔ آخر</b>",
      "",
      "<b>رمز عبور جدید را ارسال کنید</b> (حداقل ۶ نویسه)",
      "",
      "یا دکمهٔ زیر را بزنید تا بات یک رمز مطمئن برایتان بسازد:",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "🎲 ساخت رمز تصادفی مطمئن", callback_data: "reset:random" }],
        [{ text: "❌ انصراف", callback_data: "reset:cancel" }],
      ],
    },
  );
}

async function handleResetPass(chatId, text) {
  const state = chatState.get(chatId);
  const pw = text.trim();
  if (pw.length < 6) {
    await send(chatId, "رمز عبور باید حداقل ۶ نویسه باشد. دوباره بفرستید یا «🎲 ساخت رمز تصادفی» را بزنید:", {
      inline_keyboard: [
        [{ text: "🎲 ساخت رمز تصادفی مطمئن", callback_data: "reset:random" }],
        [{ text: "❌ انصراف", callback_data: "reset:cancel" }],
      ],
    });
    return;
  }
  const user = await db.user.findUnique({ where: { id: state.temp.userId } });
  const record = await pendingResetToken(user.id);
  if (!record || record.id !== state.temp.tokenId) {
    chatState.delete(chatId);
    await send(chatId, "مهلت کد به پایان رسیده است؛ از «🔑 فراموشی رمز عبور» دوباره شروع کنید.", mainKeyboard());
    return;
  }
  await applyNewPassword(chatId, user, record, pw, false);
}

async function applyRandomPassword(chatId) {
  const state = chatState.get(chatId);
  if (!state || state.flow !== "reset-pass") {
    await send(chatId, "برای ساخت رمز تصادفی، اول از «🔑 فراموشی رمز عبور» شروع کنید.", mainKeyboard());
    return;
  }
  const user = await db.user.findUnique({ where: { id: state.temp.userId } });
  const record = await pendingResetToken(user.id);
  if (!record || record.id !== state.temp.tokenId) {
    chatState.delete(chatId);
    await send(chatId, "مهلت کد به پایان رسیده است؛ از «🔑 فراموشی رمز عبور» دوباره شروع کنید.", mainKeyboard());
    return;
  }
  await applyNewPassword(chatId, user, record, randomPassword(), true);
}

async function handleStatus(chatId) {
  const link = await db.baleLink.findUnique({
    where: { chatId },
    include: {
      user: {
        select: { username: true, name: true, role: true, unit: true, province: true, jobTitle: true, status: true },
      },
    },
  });
  if (!link) {
    await send(
      chatId,
      ["👤 <b>وضعیت حساب</b>", "", "هنوز هیچ حسابی به این چت متصل نشده است.", "با «🔗 اتصال حساب» حساب رز هاب خود را وصل کنید."].join("\n"),
      {
        inline_keyboard: [
          [{ text: "🔗 اتصال حساب", callback_data: "menu:link" }],
          [{ text: "🏠 منوی اصلی", callback_data: "home:main" }],
        ],
      },
    );
    return;
  }
  const u = link.user;
  await send(
    chatId,
    [
      "👤 <b>وضعیت حساب رز هاب</b>",
      "",
      `نام: <b>${u.name}</b>`,
      `نام کاربری: <code>${u.username || "-"}</code>`,
      `نقش: ${ROLE_LABELS[u.role] || u.role}`,
      `واحد: ${u.unit || "-"}`,
      `استان: ${u.province || "-"}`,
      `وضعیت: ${u.status === "ACTIVE" ? "فعال" : "غیرفعال"}`,
      "",
      "این چت به حساب شما متصل است؛ کدهای بازیابی رمز همین‌جا ارسال می‌شود.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "🔑 فراموشی رمز عبور", callback_data: "menu:reset" }],
        [{ text: "🌐 باز کردن رز هاب", url: APP_PUBLIC_URL }],
      ],
    },
  );
}

async function handleSupport(chatId, text, fromName) {
  await db.supportTicket.create({
    data: {
      chatId: String(chatId),
      sender: fromName || "کاربر بات بله",
      subject: "پشتیبانی بات بله",
      content: text.slice(0, 4000),
    },
  });
  // اعلان درون‌برنامه‌ای + بات برای مدیرکل‌ها
  try {
    const admins = await db.user.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
    if (admins.length) {
      await db.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "support",
          title: "پیام پشتیبانی از بات بله",
          body: (fromName ? `${fromName}: ` : "") + text.slice(0, 180),
          link: "",
        })),
      });
    }
    const links = await db.baleLink.findMany({
      where: { user: { role: "SUPER_ADMIN", status: "ACTIVE" } },
      select: { chatId: true },
    });
    for (const l of links) {
      await send(
        l.chatId,
        `💬 <b>پیام پشتیبانی جدید</b>\n\nاز: ${fromName || "نامشخص"}\n\n${text.slice(0, 1500)}`,
      );
    }
  } catch (e) {
    log("support notify error:", e.message);
  }
  chatState.delete(chatId);
  await send(
    chatId,
    "✅ پیام شما ثبت شد و برای مدیر مجموعه ارسال گردید.\nبه‌زودی پیگیری می‌شود.",
    mainKeyboard(),
  );
}

async function startLinkFlow(chatId, afterLink) {
  chatState.set(chatId, { flow: "link-nid", temp: { afterLink: afterLink || "" } });
  await send(
    chatId,
    [
      "🔗 <b>اتصال حساب رز هاب به این چت</b>",
      "",
      "با اتصال حساب، کدهای بازیابی رمز بدون تأیید هویتِ دوباره همین‌جا ارسال می‌شود.",
      "",
      "<b>کد ملی حساب خود را ارسال کنید:</b>",
    ].join("\n"),
    cancelInline(),
  );
}

async function handleLinkNid(chatId, text) {
  const state = chatState.get(chatId);
  const nid = digits(text);
  if (nid.length !== 10) {
    await send(chatId, "کد ملی باید دقیقاً ۱۰ رقم باشد. لطفاً دوباره ارسال کنید:", cancelInline());
    return;
  }
  const user = await findUserByNid(nid);
  if (!user) {
    chatState.delete(chatId);
    await send(
      chatId,
      [
        "حسابی با این کد ملی در رز هاب یافت نشد.",
        "",
        "اگر حساب ندارید، از مدیر مجموعه بخواهید حساب شما را بسازد، یا از صفحهٔ ورود رز هاب روی «ثبت‌نام» بزنید:",
        `<code>${APP_PUBLIC_URL}/register</code>`,
      ].join("\n"),
      { inline_keyboard: [[{ text: "🏠 منوی اصلی", callback_data: "home:main" }]] },
    );
    return;
  }
  if (!user.phone || digits(user.phone).length < 4) {
    chatState.delete(chatId);
    await send(
      chatId,
      "برای حساب شما شماره موبایلی ثبت نشده است؛ برای امنیتِ اتصال، ۴ رقم آخر موبایل لازم است. با مدیر مجموعه تماس بگیرید تا موبایل شما در پروفایل ثبت شود.",
      { inline_keyboard: [[{ text: "🏠 منوی اصلی", callback_data: "home:main" }]] },
    );
    return;
  }
  chatState.set(chatId, { flow: "link-mob", temp: { ...(state.temp || {}), nid, name: user.name } });
  await send(chatId, `سلام ${user.name} 👋\n\nبرای تأیید هویت، <b>۴ رقم آخر شماره موبایل</b> حساب خود را ارسال کنید:`, cancelInline());
}

async function handleLinkMob(chatId, text) {
  const state = chatState.get(chatId);
  const last4 = digits(text);
  if (last4.length !== 4) {
    await send(chatId, "فقط ۴ رقم آخر موبایل را بفرستید (مثلاً ۳۶۸۰):", cancelInline());
    return;
  }
  const user = await findUserByNid(state.temp.nid);
  if (!user || !user.phone.endsWith(last4)) {
    await send(chatId, "۴ رقم آخر با موبایل ثبت‌شده در پروفایل شما هم‌خوانی ندارد. دوباره ارسال کنید:", cancelInline());
    return;
  }
  await upsertBaleLink(chatId, user.id);
  chatState.delete(chatId);
  await send(
    chatId,
    [
      "✅ <b>اتصال انجام شد</b>",
      "",
      `حساب «${user.name}» به این چت متصل شد.`,
      "از این به بعد کدهای بازیابی رمز همین‌جا برای شما ارسال می‌شود.",
    ].join("\n"),
    mainKeyboard(),
  );
  if (state.temp && state.temp.afterLink === "status") {
    await handleStatus(chatId);
  }
}

async function sendMenu(chatId) {
  await send(chatId, "منوی اصلی رز هاب — یکی از دکمه‌ها را بزنید:", mainKeyboard());
}

// ---------- مسیریابی پیام ----------
async function handleMessage(msg) {
  if (!msg.chat || msg.chat.id === undefined || msg.chat.id === null) return;
  const chatId = String(msg.chat.id);
  const text = (msg.text || "").trim();
  if (!text) return;
  const fromName = [msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(" ") || "";

  try {
    if (text === "/start") {
      chatState.delete(chatId);
      await sendWelcome(chatId, WELCOME_TEXT, mainKeyboard());
      return;
    }
    if (text === "/cancel" || text === "انصراف" || text === "❌ انصراف") {
      chatState.delete(chatId);
      await send(chatId, "عملیات لغو شد.", mainKeyboard());
      return;
    }
    if (text === "/help" || text === "ℹ️ راهنما") {
      chatState.delete(chatId);
      await send(chatId, HELP_TEXT, {
        inline_keyboard: [
          [{ text: "🔑 فراموشی رمز عبور", callback_data: "menu:reset" }],
          [{ text: "🌐 باز کردن رز هاب", url: APP_PUBLIC_URL }],
        ],
      });
      return;
    }
    if (text === "🔑 فراموشی رمز عبور") {
      await startResetFlow(chatId);
      return;
    }
    if (text === "🔗 اتصال حساب") {
      await startLinkFlow(chatId, "");
      return;
    }
    if (text === "👤 وضعیت حساب") {
      await handleStatus(chatId);
      return;
    }
    if (text === "💬 پشتیبانی") {
      chatState.set(chatId, { flow: "support", temp: {} });
      await send(
        chatId,
        ["💬 <b>پشتیبانی</b>", "", "پیام، سؤال یا مشکل خود را بنویسید — مستقیم برای مدیر مجموعه ارسال می‌شود:"].join("\n"),
        cancelInline(),
      );
      return;
    }

    const state = chatState.get(chatId);
    if (state && state.flow === "reset-nid") return void (await handleResetNid(chatId, text));
    if (state && state.flow === "reset-mob") return void (await handleResetMob(chatId, text));
    if (state && state.flow === "reset-code") return void (await handleResetCode(chatId, text));
    if (state && state.flow === "reset-pass") return void (await handleResetPass(chatId, text));
    if (state && state.flow === "link-nid") return void (await handleLinkNid(chatId, text));
    if (state && state.flow === "link-mob") return void (await handleLinkMob(chatId, text));
    if (state && state.flow === "support") return void (await handleSupport(chatId, text, fromName));

    await sendMenu(chatId);
  } catch (e) {
    log("handleMessage error:", e.message);
    chatState.delete(chatId);
    await send(chatId, "خطای غیرمنتظره پیش آمد؛ لطفاً دوباره تلاش کنید («/start» را بزنید).", mainKeyboard());
  }
}

async function handleCallback(q) {
  const rawChatId = q.message && q.message.chat && q.message.chat.id;
  const chatId = rawChatId === undefined || rawChatId === null ? "" : String(rawChatId);
  const data = q.data || "";
  try {
    if (!chatId) {
      await bale("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
      return;
    }
    switch (data) {
      case "home:main":
        chatState.delete(chatId);
        await sendMenu(chatId);
        await toast(chatId, q.id);
        break;
      case "menu:reset":
        chatState.delete(chatId);
        await startResetFlow(chatId);
        await toast(chatId, q.id);
        break;
      case "menu:link":
        chatState.delete(chatId);
        await startLinkFlow(chatId, "");
        await toast(chatId, q.id);
        break;
      case "menu:status":
        await handleStatus(chatId);
        await toast(chatId, q.id);
        break;
      case "menu:support":
        chatState.delete(chatId);
        await handleMessage({ chat: { id: chatId }, from: q.from, text: "💬 پشتیبانی" });
        await toast(chatId, q.id);
        break;
      case "menu:help":
        chatState.delete(chatId);
        await handleMessage({ chat: { id: chatId }, from: q.from, text: "/help" });
        await toast(chatId, q.id);
        break;
      case "reset:inchat": {
        const link = await db.baleLink.findUnique({
          where: { chatId },
          include: { user: { select: { id: true, name: true, username: true } } },
        });
        if (!link) {
          await send(chatId, "ابتدا حساب خود را متصل کنید — «🔗 اتصال حساب» را بزنید.", mainKeyboard());
          await toast(chatId, q.id, "حساب متصل نیست");
          break;
        }
        chatState.set(chatId, { flow: "reset-code", temp: { userId: link.user.id } });
        await send(
          chatId,
          [
            "✏️ <b>تغییر رمز در همین چت</b>",
            "",
            "<b>کد ۶ رقمی</b> که چند لحظه پیش برای شما ارسال شد را بفرستید:",
          ].join("\n"),
          {
            inline_keyboard: [
              [{ text: "🔄 ارسال دوبارهٔ کد", callback_data: "reset:newcode" }],
              [{ text: "❌ انصراف", callback_data: "reset:cancel" }],
            ],
          },
        );
        await toast(chatId, q.id);
        break;
      }
      case "reset:newcode": {
        const link = await db.baleLink.findUnique({
          where: { chatId },
          include: { user: { select: { id: true, name: true, username: true, status: true } } },
        });
        if (!link) {
          await send(chatId, "ابتدا حساب خود را متصل کنید — «🔗 اتصال حساب» را بزنید.", mainKeyboard());
          await toast(chatId, q.id, "حساب متصل نیست");
          break;
        }
        if (link.user.status !== "ACTIVE") {
          await send(chatId, "حساب شما فعال نیست؛ با مدیر سامانه تماس بگیرید.", mainKeyboard());
          await toast(chatId, q.id);
          break;
        }
        await issueReset(chatId, link.user);
        await toast(chatId, q.id, "کد جدید ارسال شد");
        break;
      }
      case "reset:random":
        await applyRandomPassword(chatId);
        await toast(chatId, q.id);
        break;
      case "reset:cancel":
        chatState.delete(chatId);
        await send(chatId, "عملیات بازیابی رمز لغو شد.", mainKeyboard());
        await toast(chatId, q.id, "لغو شد");
        break;
      default:
        await toast(chatId, q.id);
    }
  } catch (e) {
    log("handleCallback error:", e.message);
    await bale("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  }
}

// ---------- حلقهٔ polling ----------
let offset = 0;

async function poll() {
  const res = await fetch(`${BALE_API}/bot${BOT_TOKEN}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset, timeout: 25, allowed_updates: ["message", "callback_query"] }),
    signal: AbortSignal.timeout(40000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`getUpdates: ${JSON.stringify(data).slice(0, 200)}`);
  for (const update of data.result || []) {
    offset = Math.max(offset, update.update_id + 1);
    try {
      if (update.message) await handleMessage(update.message);
      else if (update.callback_query) await handleCallback(update.callback_query);
    } catch (e) {
      log("update error:", e.message);
    }
  }
}

async function main() {
  const me = await bale("getMe", {}, 15000);
  log(`bot @${me.username} (id=${me.id}) started — graphical edition, polling…`);
  try {
    await bale("setMyCommands", {
      commands: [
        { command: "start", description: "شروع و منوی اصلی" },
        { command: "help", description: "راهنمای بات" },
        { command: "cancel", description: "لغو عملیات جاری" },
      ],
    });
  } catch (e) {
    log("setMyCommands skipped:", e.message);
  }
  for (;;) {
    try {
      await poll();
    } catch (e) {
      log("poll error:", e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main()
  .then(() => log("main exited"))
  .catch((e) => {
    console.error("[bale-bot] fatal:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect().catch(() => {}));
