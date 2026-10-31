import { SignJWT } from "jose";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";
import { signSessionToken, verifySessionToken, SESSION_COOKIE, type SessionPayload } from "@/lib/auth-edge";

export { signSessionToken, verifySessionToken, SESSION_COOKIE };
export type { SessionPayload };

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "rose-hub-dev-secret-change-in-production-2024"
);

/** شناسه ورود را نرمال می‌کند: ارقام فارسی → لاتین و حذف فاصله */
export function normalizeIdentifier(raw: string): string {
  let out = "";
  for (const ch of raw.trim().toLowerCase()) {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    out += ar >= 0 ? String(ar) : ch;
  }
  return out.replace(/[\s\u200c]/g, "");
}

// ---------- رمز عبور ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");
  return candidate.length === original.length && timingSafeEqual(candidate, original);
}

// ---------- توکن ----------

// ---------- توکن SSO (توکن دسترسی موقت برای سامانه مقصد) ----------

export const SSO_ISSUER = "rose-hub";
export const SSO_TTL_SECONDS = 5 * 60; // ۵ دقیقه

/** ساخت شناسه و رمز اختصاصی اتصال برای یک سامانه (مثل client_id / client_secret در OAuth2) */
export function generateSystemCredentials(name: string): { clientId: string; clientSecret: string } {
  const slug = name
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => /[a-z0-9]/.test(w))
    .join("-");
  const suffix = randomBytes(3).toString("hex");
  return {
    clientId: `rose-${slug || randomBytes(4).toString("hex")}-${suffix}`,
    clientSecret: randomBytes(24).toString("hex"),
  };
}

/** تضمین وجود مشخصات اتصال برای سامانه — در صورت نبود، تولید و ذخیره می‌کند */
export async function ensureSystemCredentials(systemId: string) {
  const system = await db.clinicSystem.findUnique({ where: { id: systemId } });
  if (!system) throw new Error("سامانه یافت نشد");
  if (system.clientId && system.clientSecret) {
    return { clientId: system.clientId, clientSecret: system.clientSecret };
  }
  const creds = generateSystemCredentials(system.name);
  await db.clinicSystem.update({
    where: { id: systemId },
    data: { clientId: creds.clientId, clientSecret: creds.clientSecret },
  });
  return creds;
}

/**
 * صدور توکن موقت SSO (JWT امضاشده با رمز اختصاصی سامانه مقصد).
 * سامانه مقصد با clientSecret خودش توکن را اعتبارسنجی می‌کند (HS256).
 */
export async function signSSOToken(params: {
  userId: string;
  email: string;
  name: string;
  role: string;
  systemId: string;
  systemName: string;
  clientId: string;
  clientSecret: string;
  username?: string | null; // کد ملی — شناسه پایدار برای سامانه مقصد
  mobile?: string | null; // شماره موبایل
  province?: string | null; // استان
  provinceCode?: string | null; // کد استان
  clinic?: string | null; // کلینک محل خدمت
}): Promise<{ token: string; expiresAt: Date }> {
  const token = await new SignJWT({
    email: params.email,
    name: params.name,
    role: params.role,
    nationalId: params.username || null,
    mobile: params.mobile || null,
    province: params.province || null,
    provinceCode: params.provinceCode || null,
    clinic: params.clinic || null,
    systemId: params.systemId,
    systemName: params.systemName,
    scope: "sso-launch",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(params.userId)
    .setAudience(params.clientId)
    .setJti(randomBytes(12).toString("hex"))
    .setIssuedAt()
    .setIssuer(SSO_ISSUER)
    .setExpirationTime(`${SSO_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(params.clientSecret));
  const expiresAt = new Date(Date.now() + SSO_TTL_SECONDS * 1000);
  return { token, expiresAt };
}

// ---------- جلسه سمت سرور ----------

export interface AuthUser {
  id: string;
  email: string;
  username: string | null; // کد ملی
  name: string;
  role: User["role"];
  unit: string;
  jobTitle: string;
  avatarColor: string;
  status: User["status"];
  twoFactorEnabled: boolean;
  phone: string;
}

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const cookieHeader = req.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const session = await db.session.findUnique({ where: { id: payload.jti } });
  if (!session || session.revoked) return null;
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== "ACTIVE") return null;
  // به‌روزرسانی آخرین فعالیت (بدون انتظار)
  db.session
    .update({ where: { id: session.id }, data: { lastSeen: new Date() } })
    .catch(() => {});
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    role: user.role,
    unit: user.unit,
    jobTitle: user.jobTitle,
    avatarColor: user.avatarColor,
    status: user.status,
    twoFactorEnabled: user.twoFactorEnabled,
    phone: user.phone,
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** تضمین ورود کاربر؛ در غیر این صورت خطای ۴۰۱ */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const user = await getAuthUser(req);
  if (!user) throw new ApiError("ابتدا وارد شوید", 401);
  return user;
}

export function deviceFromRequest(req: Request): string {
  const ua = req.headers.get("user-agent") || "";
  if (/mobile/i.test(ua)) return "تلفن همراه";
  if (/tablet|ipad/i.test(ua)) return "تبلت";
  if (!ua) return "نامشخص";
  return "رایانه";
}

export function ipFromRequest(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "داخلی"
  );
}

// ---------- ثبت رویداد حساس ----------

export async function audit(params: {
  userId?: string | null;
  userName?: string;
  action: string;
  entity?: string;
  details?: string;
  ip?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        userName: params.userName || "",
        action: params.action,
        entity: params.entity || "",
        details: params.details || "",
        ip: params.ip || "",
      },
    });
  } catch {
    // ثبت گزارش نباید جریان اصلی را متوقف کند
  }
}

export function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

// ---------- رمز یکبار مصرف دومرحله‌ای (نمایشی) ----------

const otpStore = new Map<string, { code: string; expiresAt: number }>();

export function generateOTP(userId: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(userId, { code, expiresAt: Date.now() + 3 * 60 * 1000 });
  return code;
}

export function verifyOTP(userId: string, code: string): boolean {
  const rec = otpStore.get(userId);
  if (!rec) return false;
  if (Date.now() > rec.expiresAt) {
    otpStore.delete(userId);
    return false;
  }
  if (rec.code !== code) return false;
  otpStore.delete(userId);
  return true;
}
