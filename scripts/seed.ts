// داده‌های اولیه سامانه رز هاب
import { PrismaClient, UserRole, UserStatus } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number, hours = 9) => {
  const dt = new Date(Date.now() + d * DAY);
  dt.setHours(hours, 0, 0, 0);
  return dt;
};

async function main() {
  console.log("🌱 شروع داده‌ریزی رز هاب...");

  // پاک‌سازی
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.noteShare.deleteMany();
  await prisma.note.deleteMany();
  await prisma.eventAttendee.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.announcementAck.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.systemMetric.deleteMany();
  await prisma.systemAccess.deleteMany();
  await prisma.clinicSystem.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // ---------- کاربران ----------
  const password = hashPassword("rose1234");

  const admin = await prisma.user.create({
    data: {
      email: "admin@rose.ir",
      passwordHash: password,
      name: "دکتر سارا محمدی",
      role: "SUPER_ADMIN" as UserRole,
      unit: "مدیریت",
      jobTitle: "مدیر کل کلینیک",
      phone: "۰۲۱-۸۸۴۴۵۵۶۶",
      avatarColor: "#9c27b0",
      status: "ACTIVE" as UserStatus,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: "manager@rose.ir",
      passwordHash: password,
      name: "مهندس علی رضایی",
      role: "UNIT_MANAGER" as UserRole,
      unit: "درمان",
      jobTitle: "مدیر واحد درمان",
      phone: "۰۲۱-۸۸۴۴۵۵۶۷",
      avatarColor: "#0f766e",
    },
  });

  const therapist = await prisma.user.create({
    data: {
      email: "therapist@rose.ir",
      passwordHash: password,
      name: "دکتر مریم کریمی",
      role: "THERAPIST" as UserRole,
      unit: "درمان",
      jobTitle: "روان‌شناس بالینی",
      phone: "۰۲۱-۸۸۴۴۵۵۶۸",
      avatarColor: "#c2185b",
    },
  });

  const therapist2 = await prisma.user.create({
    data: {
      email: "h.ahmadi@rose.ir",
      passwordHash: password,
      name: "دکتر حسین احمدی",
      role: "THERAPIST" as UserRole,
      unit: "درمان",
      jobTitle: "مشاور خانواده",
      avatarColor: "#7c3aed",
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: "staff@rose.ir",
      passwordHash: password,
      name: "زهرا موسوی",
      role: "STAFF" as UserRole,
      unit: "پذیرش",
      jobTitle: "مسئول پذیرش",
      avatarColor: "#d97706",
    },
  });

  const teacher = await prisma.user.create({
    data: {
      email: "teacher@rose.ir",
      passwordHash: password,
      name: "امیر حسینی",
      role: "TEACHER" as UserRole,
      unit: "آموزش",
      jobTitle: "مدرس رز آکادمی",
      avatarColor: "#0369a1",
    },
  });

  const it = await prisma.user.create({
    data: {
      email: "it@rose.ir",
      passwordHash: password,
      name: "جعفر صالحی",
      role: "THERAPIST" as UserRole,
      unit: "فنی و توسعه",
      jobTitle: "کارشناس فنی",
      avatarColor: "#6366f1",
    },
  });

  // ---------- سامانه‌ها ----------
  const sysRaheZendegi = await prisma.clinicSystem.create({
    data: {
      name: "راه زندگی",
      clientId: "rose-rahe-zendegi-3f9a2c", clientSecret: "9f2c7b1e5d84a630c7e1f4b2d9a8c315e6d0f7a2b4c8e193d5f0a7c2e8b4d619",
      url: "https://testrahezendegi.ir/",
      description: "سامانه پیگیری مسیر درمان و برنامه زندگی مراجعان",
      icon: "HeartPulse",
      color: "#c2185b",
      connectionLevel: "BASIC",
      status: "متصل",
      sortOrder: 1,
    },
  });
  const sysAcademy = await prisma.clinicSystem.create({
    data: {
      name: "رز آکادمی",
      clientId: "rose-academy-7b1d4e", clientSecret: "3a7d9c1e5b8f2046d0c3e7a9b1f4d628c5e0a3d7f1b9c4e6d2a8f0b3c7e5d142",
      url: "https://roseacademy.ir/",
      description: "پلتفرم آموزشی، دوره‌ها و کلاس‌های مجموعه",
      icon: "GraduationCap",
      color: "#0369a1",
      connectionLevel: "BASIC",
      status: "متصل",
      sortOrder: 2,
    },
  });
  const sysCenter = await prisma.clinicSystem.create({
    data: {
      name: "رز سنتر",
      clientId: "rose-center-2e8a5c", clientSecret: "6e1b8d4f0a2c7e95b3d1f6a8c0e4d725f9a1c3e7b5d8f204a6c0e9d3b7f1a5c8",
      url: "https://rosecenter.ir/",
      description: "سامانه نوبت‌دهی و خدمات مرکز",
      icon: "Building2",
      color: "#0f766e",
      connectionLevel: "BASIC",
      status: "متصل",
      sortOrder: 3,
    },
  });
  const sysPsy = await prisma.clinicSystem.create({
    data: {
      name: "رز سای",
      clientId: "rose-psy-5c3f9b", clientSecret: "1d5f9b3e7a0c4e82f6b0d2a8c4e1f735a9d0c6e2b8f4a0d6c2e8b1f5a3d7c940",
      url: "https://rosepsy.ir/",
      description: "سامانه ارزیابی‌ها و آزمون‌های روان‌سنجی",
      icon: "Brain",
      color: "#7c3aed",
      connectionLevel: "BASIC",
      status: "در حال بررسی اتصال",
      sortOrder: 4,
    },
  });
  const sysTechno = await prisma.clinicSystem.create({
    data: {
      name: "تکنورز",
      clientId: "rose-techno-8a4e1f", clientSecret: "4b8e2f6a0d1c5e93a7f3b9d1c0e6f428b5a9d3e1c7f5a0b2d8e4c6f0a2b7d139",
      url: "https://technorose.ir/",
      description: "بخش فناوری و توسعه محصولات مجموعه",
      icon: "Cpu",
      color: "#d97706",
      connectionLevel: "BASIC",
      status: "متصل",
      sortOrder: 5,
    },
  });

  const systems = [sysRaheZendegi, sysAcademy, sysCenter, sysPsy, sysTechno];

  // دسترسی‌ها — یک‌بار ورود به معنای دسترسی به همه نیست
  const accessMap: Record<string, string[]> = {
    [admin.id]: systems.map((s) => s.id),
    [manager.id]: [sysRaheZendegi.id, sysCenter.id, sysPsy.id],
    [therapist.id]: [sysRaheZendegi.id, sysCenter.id, sysPsy.id],
    [therapist2.id]: [sysRaheZendegi.id, sysCenter.id],
    [staff.id]: [sysCenter.id],
    [teacher.id]: [sysAcademy.id],
    [it.id]: systems.map((s) => s.id),
  };
  for (const [userId, sysIds] of Object.entries(accessMap)) {
    for (const systemId of sysIds) {
      await prisma.systemAccess.create({ data: { userId, systemId } });
    }
  }

  // آمار نمونه سامانه‌ها (اتصال پیشرفته)
  await prisma.systemMetric.createMany({
    data: [
      { systemId: sysCenter.id, label: "نوبت‌های امروز", value: "۱۸" },
      { systemId: sysCenter.id, label: "مراجعان فعال", value: "۱۲۴" },
      { systemId: sysAcademy.id, label: "دوره‌های فعال", value: "۷" },
      { systemId: sysAcademy.id, label: "هنرجویان", value: "۳۱۲" },
      { systemId: sysRaheZendegi.id, label: "برنامه‌های در جریان", value: "۴۳" },
      { systemId: sysPsy.id, label: "ارزیابی‌های این ماه", value: "۸۹" },
    ],
  });

  // ---------- اطلاعیه‌ها ----------
  const ann1 = await prisma.announcement.create({
    data: {
      title: "جلسه هم‌اندیشی ماهانه مجموعه",
      content:
        "همکاران گرامی، جلسه هم‌اندیشی ماهانه کلینیک روز یکشنبه ساعت ۱۰ صبح در سالن اجتماعات برگزار می‌شود. حضور برای سرپرستان واحدها الزامی است. دستور جلسه: گزارش عملکرد ماه، برنامه‌های رز آکادمی و به‌روزرسانی پروژه رز هاب.",
      importance: "IMPORTANT",
      audience: "ALL",
      requiresAck: true,
      pinned: true,
      authorId: admin.id,
      publishAt: daysFromNow(-2),
    },
  });
  const ann2 = await prisma.announcement.create({
    data: {
      title: "به‌روزرسانی سامانه رز سای",
      content:
        "سامانه رز سای برای ارتقای زیرساخت، شنبه از ساعت ۲۲ تا ۲۴ در دسترس نخواهد بود. لطفاً در این بازه ارزیابی‌های در دست انجام را ذخیره کنید. در صورت بروز مشکل با واحد فنی تماس بگیرید.",
      importance: "URGENT",
      audience: "ALL",
      requiresAck: true,
      authorId: it.id,
      publishAt: daysFromNow(-1),
      expireAt: daysFromNow(7),
    },
  });
  const ann3 = await prisma.announcement.create({
    data: {
      title: "کارگاه آموزشی «مهارت‌های ارتباط مؤثر با مراجع»",
      content:
        "رز آکادمی کارگاه تخصصی مهارت‌های ارتباط مؤثر را ویژه همکاران واحد پذیرش و درمان برگزار می‌کند. ظرفیت محدود است و ثبت‌نام از طریق رز آکادمی انجام می‌شود.",
      importance: "NORMAL",
      audience: "ROLE",
      audienceRef: "STAFF,THERAPIST",
      authorId: teacher.id,
      publishAt: daysFromNow(-4),
      expireAt: daysFromNow(14),
    },
  });
  const ann4 = await prisma.announcement.create({
    data: {
      title: "به‌روزرسانی پروتکل حفاظت از داده‌ها",
      content:
        "مطابق الزامات محرمانگی، اطلاعات هویتی و بالینی مراجعان تنها در فضاهای مجاز و با ثبت دسترسی منتقل می‌شود. لطفاً راهنمای جدید حفاظت از داده را در پورتال مطالعه فرمایید.",
      importance: "IMPORTANT",
      audience: "UNIT",
      audienceRef: "درمان,پذیرش",
      authorId: admin.id,
      publishAt: daysFromNow(-6),
    },
  });

  // تأیید مطالعه‌های نمونه
  for (const u of [manager, therapist, staff]) {
    await prisma.announcementAck.create({
      data: { announcementId: ann1.id, userId: u.id, acknowledgedAt: daysFromNow(-1) },
    });
  }
  await prisma.announcementAck.create({
    data: { announcementId: ann2.id, userId: therapist.id, viewedAt: daysFromNow(0) },
  });

  // ---------- وظایف ----------
  const t1 = await prisma.task.create({
    data: {
      title: "تهیه گزارش عملکرد ماهانه واحد درمان",
      description: "گزارش شامل تعداد جلسات، نرخ حضور مراجعان و ساعات کارکرد درمانگران تهیه شود.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      startDate: daysFromNow(-5),
      dueDate: daysFromNow(2, 18),
      assigneeId: manager.id,
      creatorId: admin.id,
    },
  });
  const t2 = await prisma.task.create({
    data: {
      title: "به‌روزرسانی پرونده‌های ارزیابی رز سای",
      description: "بررسی و تکمیل ارزیابی‌های ناتمام باقی‌مانده از هفته گذشته.",
      priority: "MEDIUM",
      status: "NEW",
      startDate: daysFromNow(1),
      dueDate: daysFromNow(5, 17),
      assigneeId: therapist.id,
      creatorId: manager.id,
    },
  });
  const t3 = await prisma.task.create({
    data: {
      title: "برگزاری جلسه هماهنگی با تیم پذیرش",
      description: "هماهنگی شیفت‌های هفته آینده و پاسخ‌گویی به سؤالات جدید همکاران پذیرش.",
      priority: "MEDIUM",
      status: "IN_REVIEW",
      startDate: daysFromNow(-3),
      dueDate: daysFromNow(1, 14),
      assigneeId: staff.id,
      creatorId: manager.id,
    },
  });
  const t4 = await prisma.task.create({
    data: {
      title: "آماده‌سازی محتوای دوره جدید رز آکادمی",
      description: "تهیه سرفصل‌ها و جزوه‌های دوره «آشنایی با اختلالات اضطرابی».",
      priority: "URGENT",
      status: "IN_PROGRESS",
      startDate: daysFromNow(-7),
      dueDate: daysFromNow(1, 20),
      assigneeId: teacher.id,
      creatorId: admin.id,
    },
  });
  const t5 = await prisma.task.create({
    data: {
      title: "تست اتصال SSO با سامانه راه زندگی",
      description: "اجرای آزمون‌های ورود یکپارچه و ثبت نتایج در مستندات فنی پروژه.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      startDate: daysFromNow(-2),
      dueDate: daysFromNow(4, 16),
      assigneeId: it.id,
      creatorId: admin.id,
    },
  });
  const t6 = await prisma.task.create({
    data: {
      title: "بازبینی سیاست‌های امنیتی پورتال",
      description: "بررسی گزارش آخرین آزمون امنیت و پیگیری موارد نیازمند اصلاح.",
      priority: "HIGH",
      status: "DONE",
      startDate: daysFromNow(-15),
      dueDate: daysFromNow(-8, 17),
      completedAt: daysFromNow(-9, 15),
      assigneeId: it.id,
      creatorId: admin.id,
    },
  });
  const t7 = await prisma.task.create({
    data: {
      title: "سازمان‌دهی پرونده پذیرش هفته",
      description: "ثبت اطلاعات مراجعان جدید و هماهنگی نوبت‌ها با درمانگران.",
      priority: "LOW",
      status: "DONE",
      startDate: daysFromNow(-10),
      dueDate: daysFromNow(-6, 14),
      completedAt: daysFromNow(-7, 11),
      assigneeId: staff.id,
      creatorId: manager.id,
    },
  });
  const t8 = await prisma.task.create({
    data: {
      title: "پیگیری تمدید گواهی‌نامه‌های درمانگران",
      description: "بررسی مهلت اعتبار مدارک و هماهنگی برای تمدید موارد نزدیک به انقضا.",
      priority: "MEDIUM",
      status: "NEW",
      startDate: daysFromNow(-1),
      dueDate: daysFromNow(-1, 12),
      assigneeId: manager.id,
      creatorId: admin.id,
    },
  });

  await prisma.taskComment.createMany({
    data: [
      { taskId: t1.id, userId: admin.id, content: "لطفاً بخش مقایسه با ماه قبل هم اضافه شود.", createdAt: daysFromNow(-2) },
      { taskId: t1.id, userId: manager.id, content: "داده‌های ماه گذشته جمع‌آوری شد، در حال تهیه نمودارها هستم.", createdAt: daysFromNow(-1) },
      { taskId: t5.id, userId: it.id, content: "ورود با حساب آزمایشی موفق بود؛ مرحله بعد تست خروج یکپارچه است.", createdAt: daysFromNow(-1) },
    ],
  });

  // ---------- تقویم ----------
  const e1 = await prisma.calendarEvent.create({
    data: {
      title: "جلسه مدیریت — بررسی گزارش‌های ماهانه",
      description: "بررسی گزارش عملکرد ماهانه واحدها",
      type: "MEETING",
      start: daysFromNow(1, 10),
      end: daysFromNow(1, 12),
      location: "سالن جلسات",
      ownerId: admin.id,
    },
  });
  const e2 = await prisma.calendarEvent.create({
    data: {
      title: "کلاس کارگاه رز آکادمی",
      description: "دوره مهارت‌های ارتباط مؤثر",
      type: "CLASS",
      start: daysFromNow(2, 16),
      end: daysFromNow(2, 18),
      location: "کلاس ۲۰۱",
      ownerId: teacher.id,
    },
  });
  const e3 = await prisma.calendarEvent.create({
    data: {
      title: "مهلت ارسال گزارش عملکرد",
      description: "مهلت نهایی تحویل گزارش ماهانه واحدها",
      type: "DEADLINE",
      start: daysFromNow(3, 17),
      ownerId: admin.id,
    },
  });
  const e4 = await prisma.calendarEvent.create({
    data: {
      title: "جلسه تیم فنی — پیشرفت اتصال SSO",
      description: "بررسی وضعیت اتصال سامانه‌ها و مستندسازی",
      type: "MEETING",
      start: daysFromNow(0, 14),
      end: daysFromNow(0, 15),
      location: "اتاق فنی",
      ownerId: it.id,
    },
  });
  const e5 = await prisma.calendarEvent.create({
    data: {
      title: "ارزیابی علمی مراجعان جدید",
      type: "EVENT",
      start: daysFromNow(5, 9),
      end: daysFromNow(5, 13),
      location: "اتاق ارزیابی",
      ownerId: therapist.id,
    },
  });

  await prisma.eventAttendee.createMany({
    data: [
      { eventId: e1.id, userId: manager.id, response: "YES" },
      { eventId: e1.id, userId: therapist.id, response: "PENDING" },
      { eventId: e2.id, userId: staff.id, response: "YES" },
      { eventId: e4.id, userId: admin.id, response: "YES" },
    ],
  });

  // ---------- یادداشت‌ها ----------
  await prisma.note.create({
    data: {
      title: "چک‌لیست جلسه فردا",
      content: "بررسی صورت‌جلسه قبل، آماده‌سازی گزارش پیشرفت اتصال سامانه‌ها، هماهنگی با واحد پذیرش درباره نوبت‌های هفته بعد.",
      type: "PERSONAL",
      color: "#fde7ef",
      tags: "جلسه,برنامه",
      authorId: admin.id,
    },
  });
  await prisma.note.create({
    data: {
      title: "نکات همکاری با سامانه راه زندگی",
      content: "پیشنهاد شد فرم ثبت‌نام سامانه با شناسه یکتای پورتال هم‌راستا شود. تیم فنی راه زندگی تمایل به استفاده از OAuth 2.0 دارد.",
      type: "SHARED",
      color: "#e0f2f1",
      tags: "فنی,اتصال",
      authorId: it.id,
      shares: { create: [{ userId: admin.id }, { userId: manager.id }] },
    },
  });
  await prisma.note.create({
    data: {
      title: "ایده‌های محتوایی برای آکادمی",
      content: "سری محتوای «آرامش در محیط کار»، پادکست هفتگی ۱۰ دقیقه‌ای، پرسش و پاسخ ماهانه با درمانگران.",
      type: "SHARED",
      color: "#fff8e1",
      tags: "محتوا,آموزش",
      authorId: teacher.id,
      shares: { create: [{ userId: admin.id }, { userId: staff.id }, { userId: therapist.id }] },
    },
  });
  await prisma.note.create({
    data: {
      title: "برنامه مطالعه من",
      content: "فصل سوم کتاب رفتاردرمانی شناختی تا پایان هفته. مرور یادداشت‌های کارگاه شنبه.",
      type: "PERSONAL",
      color: "#e3f2fd",
      tags: "شخصی",
      authorId: therapist.id,
    },
  });

  // ---------- گفتگوها ----------
  const conv1 = await prisma.conversation.create({
    data: {
      type: "DIRECT",
      creatorId: admin.id,
      updatedAt: daysFromNow(-1, 11),
      members: {
        create: [
          { userId: admin.id },
          { userId: manager.id },
        ],
      },
    },
  });
  const conv2 = await prisma.conversation.create({
    data: {
      type: "GROUP",
      title: "تیم درمان",
      creatorId: manager.id,
      updatedAt: daysFromNow(-1, 13),
      members: {
        create: [
          { userId: manager.id },
          { userId: therapist.id },
          { userId: therapist2.id },
          { userId: staff.id },
          { userId: admin.id },
        ],
      },
    },
  });
  const conv3 = await prisma.conversation.create({
    data: {
      type: "CHANNEL",
      title: "اطلاع‌رسانی فنی",
      creatorId: it.id,
      updatedAt: daysFromNow(-2, 10),
      members: {
        create: [
          { userId: it.id },
          { userId: admin.id },
          { userId: manager.id },
          { userId: teacher.id },
          { userId: therapist.id },
          { userId: therapist2.id },
          { userId: staff.id },
        ],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: conv1.id, senderId: admin.id, content: "سلام علی آقا، گزارش اتصال سامانه راه زندگی آماده شد؟", createdAt: daysFromNow(-1, 10) },
      { conversationId: conv1.id, senderId: manager.id, content: "سلام، بله. تا پایان امروز نسخه نهایی را در رز هاب بارگذاری می‌کنم.", createdAt: daysFromNow(-1, 11) },
      { conversationId: conv2.id, senderId: staff.id, content: "همکاران عزیز، نوبت‌های فردا مرتب شد. لطفاً تأیید کنید.", createdAt: daysFromNow(-1, 12) },
      { conversationId: conv2.id, senderId: therapist.id, content: "ممنون زهرا خانم؛ ساعات ۱۰ تا ۱۲ من مشکلی ندارد.", createdAt: daysFromNow(-1, 12) },
      { conversationId: conv2.id, senderId: therapist2.id, content: "من ساعت ۱۴ جلسه دارم، بقیه زمان‌ها آزاد است.", createdAt: daysFromNow(-1, 13) },
      { conversationId: conv3.id, senderId: it.id, content: "یادآوری: شنبه شب سامانه رز سای بروزرسانی می‌شود و تا ساعت ۲۴ در دسترس نیست.", createdAt: daysFromNow(-2, 10) },
    ],
  });

  // ---------- اعلان‌ها ----------
  await prisma.notification.createMany({
    data: [
      { userId: admin.id, type: "task", title: "وظیفه جدید برای شما تعریف شد", body: "پیگیری تمدید گواهی‌نامه‌های درمانگران", link: "/tasks" },
      { userId: admin.id, type: "announcement", title: "اطلاعیه نیازمند تأیید مطالعه", body: "جلسه هم‌اندیشی ماهانه مجموعه", link: "/announcements" },
      { userId: admin.id, type: "event", title: "رویداد پیش‌رو", body: "جلسه مدیریت — بررسی گزارش‌های ماهانه", link: "/calendar" },
      { userId: manager.id, type: "message", title: "پیام جدید از دکتر سارا محمدی", body: "گزارش اتصال سامانه راه زندگی آماده شد؟", link: "/messages" },
      { userId: therapist.id, type: "task", title: "وظیفه جدید", body: "به‌روزرسانی پرونده‌های ارزیابی رز سای", link: "/tasks" },
      { userId: staff.id, type: "announcement", title: "اطلاعیه نیازمند تأیید مطالعه", body: "جلسه هم‌اندیشی ماهانه مجموعه", link: "/announcements" },
      { userId: it.id, type: "task", title: "یادآوری مهلت وظیفه", body: "تست اتصال SSO با سامانه راه زندگی — ۴ روز مانده", link: "/tasks" },
    ],
  });

  // ---------- گزارش فعالیت ----------
  await prisma.auditLog.createMany({
    data: [
      { userId: admin.id, userName: "دکتر سارا محمدی", action: "ورود موفق به سامانه", entity: "auth", ip: "۱۹۲.۱۶۸.۱.۱۰", createdAt: daysFromNow(-1, 8) },
      { userId: it.id, userName: "جعفر صالحی", action: "به‌روزرسانی وضعیت اتصال سامانه رز سای", entity: "system", details: "در حال بررسی اتصال", ip: "۱۹۲.۱۶۸.۱.۲۲", createdAt: daysFromNow(-1, 9) },
      { userId: admin.id, userName: "دکتر سارا محمدی", action: "انتشار اطلاعیه", entity: "announcement", details: "جلسه هم‌اندیشی ماهانه مجموعه", ip: "۱۹۲.۱۶۸.۱.۱۰", createdAt: daysFromNow(-2, 9) },
      { userId: manager.id, userName: "مهندس علی رضایی", action: "تعریف وظیفه جدید", entity: "task", details: "به‌روزرسانی پرونده‌های ارزیابی رز سای", ip: "۱۹۲.۱۶۸.۱.۳۱", createdAt: daysFromNow(-2, 10) },
      { userId: admin.id, userName: "دکتر سارا محمدی", action: "اعطای دسترسی سامانه", entity: "access", details: "رز آکادمی ← امیر حسینی", ip: "۱۹۲.۱۶۸.۱.۱۰", createdAt: daysFromNow(-3, 14) },
    ],
  });

  console.log("✅ داده‌ریزی کامل شد");
  console.log("👤 کاربران نمونه: admin@rose.ir / manager@rose.ir / therapist@rose.ir / staff@rose.ir / teacher@rose.ir — رمز: rose1234");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
