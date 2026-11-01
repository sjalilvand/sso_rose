#!/usr/bin/env node
/**
 * rose-bale-bot.cjs — بات پشتیبانی و بازیابی رمز عبور رز هاب در پیام‌رسان بله
 *
 * نام بات : @rosepro_bot   (ble.ir/rosepro_bot)
 * روش کار : long-polling روی getUpdates (نیازی به وب‌هوک/HTTPS ندارد)
 *
 * قابلیت‌ها:
 *   🔗 اتصال حساب          — کد ملی + ۴ رقم آخر موبایل → اتصال چت به حساب رز هاب
 *   🔑 فراموشی رمز عبور    — کد ۶ رقمی + پیوند یک‌بارمصرف تغییر رمز در همین چت
 *   💬 پشتیبانی            — پیام کاربر در رز هاب ثبت و به مدیرکل‌ها اعلان می‌شود
 *   ℹ️ راهنما
 *
 * اجرا (روی سرور):  pm2 start ecosystem.config.js  (اپِ rose-bale-bot داخل همان فایل)
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
      [{ text: "🔗 اتصال حساب" }, { text: "🔑 فراموشی رمز عبور" }],
      [{ text: "💬 پشتیبانی" }, { text: "ℹ️ راهنما" }],
    ],
    resize_keyboard: true,
  };
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

// ---------- وضعیت گفتگو (در حافظه) ----------
// chatState: Map<chatId, { flow: 'link-nid' | 'link-mob' | 'support', temp: object }>
const chatState = new Map();

const HELP_TEXT = [
  "🤖 <b>بات پشتیبانی رز هاب</b> (@rosepro_bot)",
  "",
  "با این بات می‌توانید:",
  "🔗 <b>اتصال حساب</b> — حساب رز هاب خود را به این چت وصل کنید (کد ملی + ۴ رقم آخر موبایل)",
  "🔑 <b>فراموشی رمز عبور</b> — کد یک‌بارمصرف و پیوند تغییر رمز همین‌جا دریافت می‌کنید",
  "💬 <b>پشتیبانی</b> — پیام شما برای مدیر مجموعه ثبت می‌شود",
  "",
  "آدرس ورود رز هاب:",
  `<code>${APP_PUBLIC_URL}</code>`,
  "",
  "اگر حساب ندارید، از صفحهٔ ورود رز هاب روی «ثبت‌نام» بزنید — ورود پس از تأیید مدیر فعال می‌شود.",
].join("\n");

function menuText() {
  return "یکی از گزینه‌های زیر را انتخاب کنید:";
}

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
  const code = String(Math.floor(100000 + Math.random() * 900000));
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

async function startResetFlow(chatId, afterLink) {
  const link = await db.baleLink.findUnique({
    where: { chatId },
    include: { user: { select: { id: true, name: true, status: true } } },
  });
  if (!link) {
    chatState.set(chatId, { flow: "link-nid", temp: { afterLink: afterLink || "reset" } });
    await send(chatId, "اول باید حساب رز هاب خود را به این چت متصل کنیم.\n\n<b>کد ملی حساب خود را ارسال کنید:</b>");
    return;
  }
  if (link.user.status !== "ACTIVE") {
    await send(chatId, "حساب شما فعال نیست؛ با مدیر سامانه تماس بگیرید.");
    return;
  }
  const { token, code } = await createPasswordReset(link.user.id);
  await send(
    chatId,
    [
      `🔑 <b>بازیابی رمز عبور رز هاب</b>`,
      "",
      `سلام ${link.user.name}،`,
      `کد تأیید شما: <code>${code}</code>`,
      "",
      `این درخواست ${RESET_TTL_MINUTES} دقیقه اعتبار دارد.`,
      "برای انتخاب رمز جدید روی دکمهٔ زیر بزنید:",
    ].join("\n"),
    { inline_keyboard: [[{ text: "🔐 انتخاب رمز جدید", url: `${APP_PUBLIC_URL}/reset-password?token=${token}` }]] },
  );
  log(`reset token issued for user ${link.user.id}`);
}

async function handleLinkNid(chatId, text) {
  const nid = digits(text);
  if (nid.length !== 10) {
    await send(chatId, "کد ملی باید دقیقاً ۱۰ رقم باشد. لطفاً دوباره ارسال کنید:");
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
        "اگر حساب ندارید، از صفحهٔ ورود رز هاب روی «ثبت‌نام» بزنید:",
        `<code>${APP_PUBLIC_URL}/register</code>`,
        "",
        "اگر حساب دارید و کد ملی دیگری برایتان ثبت شده، با مدیر مجموعه تماس بگیرید.",
      ].join("\n"),
      mainKeyboard(),
    );
    return;
  }
  if (!user.phone || digits(user.phone).length < 4) {
    chatState.delete(chatId);
    await send(
      chatId,
      "برای حساب شما شماره موبایلی ثبت نشده است؛ برای امنیتِ اتصال، ۴ رقم آخر موبایل لازم است. با مدیر مجموعه تماس بگیرید تا موبایل شما در پروفایل ثبت شود.",
      mainKeyboard(),
    );
    return;
  }
  const state = chatState.get(chatId) || { flow: "link-nid", temp: {} };
  chatState.set(chatId, { flow: "link-mob", temp: { ...state.temp, nid, name: user.name } });
  await send(chatId, `سلام ${user.name} 👋\n\nبرای تأیید هویت، <b>۴ رقم آخر شماره موبایل</b> حساب خود را ارسال کنید:`);
}

async function handleLinkMob(chatId, text) {
  const state = chatState.get(chatId);
  const last4 = digits(text);
  if (last4.length !== 4) {
    await send(chatId, "فقط ۴ رقم آخر موبایل را بفرستید (مثلاً ۳۶۸۰):");
    return;
  }
  const user = await findUserByNid(state.temp.nid);
  if (!user || !user.phone.endsWith(last4)) {
    await send(chatId, "۴ رقم آخر با موبایل ثبت‌شده در پروفایل شما هم‌خوانی ندارد. دوباره ارسال کنید یا «/start» بزنید:");
    return;
  }
  await upsertBaleLink(chatId, user.id);
  chatState.delete(chatId);
  await send(
    chatId,
    [
      `✅ <b>اتصال انجام شد</b>`,
      "",
      `حساب «${user.name}» به این چت متصل شد.`,
      "از این به بعد کدهای بازیابی رمز همین‌جا برای شما ارسال می‌شود.",
    ].join("\n"),
    mainKeyboard(),
  );
  if (state.temp && state.temp.afterLink === "reset") {
    await startResetFlow(chatId);
  }
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
  await send(chatId, "✅ پیام شما ثبت شد و برای مدیر مجموعه ارسال گردید.\nبه‌زودی پیگیری می‌شود.", mainKeyboard());
}

// ---------- مسیریابی پیام ----------
async function handleMessage(msg) {
  const chatId = msg.chat && msg.chat.id;
  if (!chatId) return;
  const text = (msg.text || "").trim();
  if (!text) return;
  const fromName = [msg.from && msg.from.first_name, msg.from && msg.from.last_name].filter(Boolean).join(" ") || "";

  try {
    if (text === "/start") {
      chatState.delete(chatId);
      await send(
        chatId,
        [
          "سلام و خوش آمدید 🌹",
          "",
          "من بات پشتیبانی <b>رز هاب</b> هستم.",
          "می‌توانید حساب خود را متصل کنید، رمز فراموش‌شده را بازیابی کنید یا پیام پشتیبانی بفرستید.",
          "",
          menuText(),
        ].join("\n"),
        mainKeyboard(),
      );
      return;
    }
    if (text === "/help" || text === "ℹ️ راهنما") {
      chatState.delete(chatId);
      await send(chatId, HELP_TEXT, mainKeyboard());
      return;
    }
    if (text === "🔗 اتصال حساب") {
      chatState.set(chatId, { flow: "link-nid", temp: { afterLink: "" } });
      await send(chatId, "<b>کد ملی حساب رز هاب خود را ارسال کنید:</b>");
      return;
    }
    if (text === "🔑 فراموشی رمز عبور") {
      await startResetFlow(chatId);
      return;
    }
    if (text === "💬 پشتیبانی") {
      chatState.set(chatId, { flow: "support", temp: {} });
      await send(chatId, "پیام، سؤال یا مشکل خود را بنویسید — مستقیم برای مدیر مجموعه ارسال می‌شود:");
      return;
    }

    const state = chatState.get(chatId);
    if (state && state.flow === "link-nid") return void (await handleLinkNid(chatId, text));
    if (state && state.flow === "link-mob") return void (await handleLinkMob(chatId, text));
    if (state && state.flow === "support") return void (await handleSupport(chatId, text, fromName));

    await send(chatId, HELP_TEXT, mainKeyboard());
  } catch (e) {
    log("handleMessage error:", e.message);
    chatState.delete(chatId);
    await send(chatId, "خطای غیرمنتظره پیش آمد؛ لطفاً دوباره تلاش کنید («/start» را بزنید).");
  }
}

async function handleCallback(q) {
  try {
    const chatId = q.message && q.message.chat && q.message.chat.id;
    const data = q.data || "";
    if (chatId) {
      if (data === "menu:start") {
        await bale("sendMessage", { chat_id: chatId, text: menuText(), parse_mode: "HTML", reply_markup: mainKeyboard() });
      } else if (data === "menu:link") {
        await handleMessage({ chat: { id: chatId }, from: q.from, text: "🔗 اتصال حساب" });
      } else if (data === "menu:reset") {
        await handleMessage({ chat: { id: chatId }, from: q.from, text: "🔑 فراموشی رمز عبور" });
      } else if (data === "menu:support") {
        await handleMessage({ chat: { id: chatId }, from: q.from, text: "💬 پشتیبانی" });
      } else if (data === "menu:help") {
        await handleMessage({ chat: { id: chatId }, from: q.from, text: "/help" });
      }
    }
    await bale("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  } catch (e) {
    log("handleCallback error:", e.message);
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
  log(`bot @${me.username} (id=${me.id}) started — polling…`);
  try {
    await bale("setMyCommands", {
      commands: [
        { command: "start", description: "شروع و منوی اصلی" },
        { command: "help", description: "راهنمای بات" },
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
