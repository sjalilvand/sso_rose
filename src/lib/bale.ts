/**
 * اتصال به بات بله (Bale Messenger) — @rosepro_bot
 *
 * بله یک Bot API سازگار با تلگرام دارد: https://tapi.bale.ai/bot<token>/<method>
 * این ماژول فقط ارسال پیام خروجی را برای routeهای رز هاب فراهم می‌کند
 * (گوارش پیام‌های ورودی در scripts/bale-bot.cjs با long-polling انجام می‌شود).
 */

const BALE_API_BASE = "https://tapi.bale.ai";
export const BALE_BOT_LINK = "https://ble.ir/rosepro_bot";
export const BALE_BOT_USERNAME = "@rosepro_bot";

export function baleBotToken(): string {
  return (process.env.BALE_BOT_TOKEN || "").trim();
}

export interface BaleInlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

/** ارسال پیام متنی به یک chat_id — در صورت هر خطایی بی‌صدا false برمی‌گرداند تا مسیر اصلی API خراب نشود */
export async function sendBaleMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: { inline_keyboard?: BaleInlineButton[][]; keyboard?: string[][]; resize_keyboard?: boolean },
): Promise<boolean> {
  const token = baleBotToken();
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`${BALE_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** ارسال پیام به همهٔ مدیرکل‌هایی که حسابشان به بات وصل است — تعداد ارسال‌های موفق برمی‌گردد */
export async function notifySuperAdminsViaBale(text: string): Promise<number> {
  let sent = 0;
  try {
    const { db } = await import("@/lib/db");
    const links = await db.baleLink.findMany({
      where: { user: { role: "SUPER_ADMIN", status: "ACTIVE" } },
      select: { chatId: true },
    });
    for (const l of links) {
      if (await sendBaleMessage(l.chatId, text)) sent++;
    }
  } catch {
    // بی‌صدا — اعلان درون‌برنامه‌ای همچنان ارسال شده است
  }
  return sent;
}
