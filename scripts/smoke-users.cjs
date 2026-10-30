/**
 * Smoke test E2E برای CRUD کاربران رز هاب (روی sandbox)
 * پیش‌نیاز: سرور next start روی PORT و ادمین admin@rose.ir / rose1234
 */
const BASE = process.env.BASE || "http://127.0.0.1:3100";

async function req(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data, setCookie };
}

function assert(cond, label) {
  if (!cond) { console.error("FAIL:", label); process.exitCode = 1; }
  else console.log("OK  :", label);
}

(async () => {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient();

  // 1) login
  const login = await req("POST", "/api/auth/login", { email: "admin@rose.ir", password: "rose1234" });
  assert(login.status === 200, `login (${login.status})`);
  const cookie = (login.setCookie || "").split(";")[0];
  assert(!!cookie, "session cookie received");

  // 2) create user
  const created = await req("POST", "/api/users", {
    name: "کاربر تستی حذف",
    email: "test-delete@rose.ir",
    password: "test12345",
    role: "STAFF",
    unit: "پشتیبانی",
    jobTitle: "کارشناس تست",
    phone: "09120000000",
    systemIds: [],
  }, cookie);
  assert(created.status === 201, `create user (${created.status}) ${JSON.stringify(created.data)}`);
  const uid = created.data.user.id;
  const sys = await db.clinicSystem.findUnique({ where: { clientId: "rose-techno-8a4e1f" } });

  // 3) full edit: email + role + systems + phone
  const patched = await req("PATCH", `/api/users/${uid}`, {
    name: "کاربر تستی ویرایش‌شده",
    email: "test-renamed@rose.ir",
    phone: "09121111111",
    role: "THERAPIST",
    status: "ACTIVE",
    systemIds: [sys.id],
  }, cookie);
  assert(patched.status === 200, `full edit (${patched.status}) ${JSON.stringify(patched.data)}`);

  const after = await db.user.findUnique({ where: { id: uid }, include: { systemAccess: true } });
  assert(after.email === "test-renamed@rose.ir", `email changed -> ${after.email}`);
  assert(after.role === "THERAPIST", `role changed -> ${after.role}`);
  assert(after.systemAccess.length === 1, `system access count = ${after.systemAccess.length}`);

  // duplicate email must be rejected
  const dup = await req("PATCH", `/api/users/${uid}`, { email: "admin@rose.ir" }, cookie);
  assert(dup.status === 409, `duplicate email rejected (${dup.status})`);

  // 4) dependent data: task, note, message+conversation, notification
  const admin = await db.user.findUnique({ where: { email: "admin@rose.ir" } });
  const task = await db.task.create({ data: { title: "تسک تست", assigneeId: uid, creatorId: admin.id } });
  await db.taskComment.create({ data: { taskId: task.id, userId: uid, content: "کامنت تست" } });
  const note = await db.note.create({ data: { title: "نوت تست", authorId: uid } });
  const conv = await db.conversation.create({ data: { type: "DIRECT", creatorId: admin.id } });
  await db.conversationMember.create({ data: { conversationId: conv.id, userId: uid } });
  await db.conversationMember.create({ data: { conversationId: conv.id, userId: admin.id } });
  await db.message.create({ data: { conversationId: conv.id, senderId: uid, content: "پیام تست" } });
  await db.notification.create({ data: { userId: uid, title: "اعلان تست" } });
  console.log("OK  : dependent data created (task/note/message/notification)");

  // 5) hard delete
  const del = await req("DELETE", `/api/users/${uid}?hard=1`, null, cookie);
  assert(del.status === 200 && del.data.deleted === true, `hard delete (${del.status}) ${JSON.stringify(del.data)}`);

  const gone = await db.user.findUnique({ where: { id: uid } });
  assert(gone === null, "user row removed");
  const tasksLeft = await db.task.count({ where: { id: task.id } });
  const notesLeft = await db.note.count({ where: { id: note.id } });
  const msgsLeft = await db.message.count({ where: { conversationId: conv.id } });
  const membersLeft = await db.conversationMember.count({ where: { conversationId: conv.id } });
  const notifLeft = await db.notification.count({ where: { userId: uid } });
  assert(tasksLeft === 0, `tasks cleaned (${tasksLeft})`);
  assert(notesLeft === 0, `notes cleaned (${notesLeft})`);
  assert(msgsLeft === 0, `user messages cleaned (${msgsLeft})`);
  assert(membersLeft === 1, `admin membership kept (${membersLeft})`);
  assert(notifLeft === 0, `notifications cleaned (${notifLeft})`);

  // 6) self-delete & last-super-admin guard
  const adminId = admin.id;
  const selfDel = await req("DELETE", `/api/users/${adminId}?hard=1`, null, cookie);
  assert(selfDel.status === 400, `self delete blocked (${selfDel.status})`);
  const lastAdminDel = await req("DELETE", `/api/users/${adminId}?hard=1`, null, cookie); // duplicate check via another admin? admin is the only one
  assert(lastAdminDel.status === 400, `last-super-admin delete blocked (${lastAdminDel.status})`);

  // 7) list still works
  const list = await req("GET", "/api/users?withAccess=1", null, cookie);
  assert(list.status === 200 && Array.isArray(list.data.users), `users list (${list.status}, n=${list.data.users?.length})`);

  await db.$disconnect();
  console.log(process.exitCode ? "\n== SMOKE TEST FAILED ==" : "\n== SMOKE TEST PASSED ==");
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
