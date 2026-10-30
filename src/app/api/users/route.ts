import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, hashPassword, audit, ApiError, normalizeIdentifier } from "@/lib/auth";
import { apiError, json, readBody } from "@/lib/api";
import { hasPermission } from "@/lib/permissions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NID_RE = /^\d{10}$/;

/** اعتبارسنجی و نرمال‌سازی کد ملی ورودی — در صورت نامعتبر بودن خطا می‌دهد */
async function checkedUsername(raw: string | undefined): Promise<string | null | undefined> {
  if (raw === undefined) return undefined;
  const nid = normalizeIdentifier(raw).replace(/[^0-9]/g, "");
  if (!nid) return null; // پاک کردن نام کاربری
  const padded = nid.length >= 8 && nid.length < 10 ? nid.padStart(10, "0") : nid;
  if (!NID_RE.test(padded)) throw new ApiError("کد ملی باید ۱۰ رقم باشد", 400);
  return padded;
}

/** فهرست کاربران (برای مدیریت و انتخاب مخاطب) */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const withAccess = searchParams.get("withAccess");

    const users = await db.user.findMany({
      where: user.role === "EXTERNAL" ? { id: user.id } : {},
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        unit: true,
        jobTitle: true,
        phone: true,
        province: true,
        education: true,
        workLicense: true,
        profRank: true,
        contractNo: true,
        provinceCode: true,
        personalCode: true,
        bankSheba: true,
        avatarColor: true,
        status: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (withAccess === "1") {
      const access = await db.systemAccess.findMany();
      const accessMap: Record<string, string[]> = {};
      for (const a of access) {
        (accessMap[a.userId] ||= []).push(a.systemId);
      }
      return json({ users: users.map((u) => ({ ...u, systemIds: accessMap[u.id] || [] })) });
    }
    return json({ users });
  } catch (e) {
    return apiError(e);
  }
}

/** تعریف کاربر جدید */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!hasPermission(user.role, "users.manage"))
      throw new ApiError("شما مجوز مدیریت کاربران را ندارید", 403);

    const body = await readBody<{
      email?: string;
      username?: string;
      name?: string;
      password?: string;
      role?: string;
      unit?: string;
      jobTitle?: string;
      phone?: string;
      province?: string;
      education?: string;
      workLicense?: string;
      profRank?: string;
      contractNo?: string;
      provinceCode?: string;
      personalCode?: string;
      bankSheba?: string;
      avatarColor?: string;
      systemIds?: string[];
    }>(req);

    if (!body.email || !body.name || !body.password)
      throw new ApiError("نام، ایمیل و رمز عبور الزامی است", 400);
    if (body.password.length < 8) throw new ApiError("رمز عبور باید حداقل ۸ نویسه باشد", 400);

    const email = body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError("قالب ایمیل معتبر نیست", 400);
    const exists = await db.user.findUnique({ where: { email } });
    if (exists) throw new ApiError("این ایمیل قبلاً ثبت شده است", 409);

    const username = await checkedUsername(body.username);
    if (username) {
      const dup = await db.user.findUnique({ where: { username } });
      if (dup) throw new ApiError("این کد ملی قبلاً برای کاربر دیگری ثبت شده است", 409);
    }

    const newUser = await db.user.create({
      data: {
        email,
        username: username || null,
        name: body.name,
        passwordHash: hashPassword(body.password),
        role: (body.role as never) || "STAFF",
        unit: body.unit || "عمومی",
        jobTitle: body.jobTitle || "",
        phone: body.phone || "",
        province: body.province || "",
        education: body.education || "",
        workLicense: body.workLicense || "",
        profRank: body.profRank || "",
        contractNo: body.contractNo || "",
        provinceCode: body.provinceCode || "",
        personalCode: body.personalCode || "",
        bankSheba: body.bankSheba || "",
        avatarColor: body.avatarColor || "#c2185b",
      },
    });

    if (body.systemIds?.length) {
      await db.systemAccess.createMany({
        data: body.systemIds.map((systemId) => ({ userId: newUser.id, systemId })),
      });
    }

    await audit({
      userId: user.id,
      userName: user.name,
      action: "ایجاد کاربر جدید",
      entity: "user",
      details: `${body.name} (${email})`,
    });
    return json({ user: { id: newUser.id } }, 201);
  } catch (e) {
    return apiError(e);
  }
}
