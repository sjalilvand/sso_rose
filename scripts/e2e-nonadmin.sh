#!/bin/bash
# e2e-nonadmin.sh — بررسی فیلتر pageAccess برای کاربر غیرمدیر
BASE=http://localhost:3777
JAR=/tmp/e2e-staff.txt
rm -f $JAR
node - <<'EOF'
const { resolveDatabaseUrl } = require("/home/z/my-project/scripts/lib-env.cjs");
resolveDatabaseUrl();
const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");
const db = new PrismaClient();
function hashPassword(p) { const s = randomBytes(16).toString("hex"); return `${s}:${scryptSync(p, s, 64).toString("hex")}`; }
(async () => {
  const email = "e2e-staff@rose.local";
  const u = await db.user.upsert({
    where: { email },
    update: { passwordHash: hashPassword("Staff!Pass123"), role: "STAFF", status: "ACTIVE", name: "تست کارمند" },
    create: { email, username: "1111111112", passwordHash: hashPassword("Staff!Pass123"), role: "STAFF", status: "ACTIVE", name: "تست کارمند" },
  });
  console.log("staff user:", u.id);
  await db.$disconnect();
})();
EOF
echo "=== login staff ==="
curl -s -c $JAR -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"e2e-staff@rose.local","password":"Staff!Pass123"}' | head -c 120; echo
echo "=== before deny: pageAccess ==="
curl -s -b $JAR $BASE/api/auth/me | python3 -c "
import json,sys
d = json.load(sys.stdin)
pa = d.get('pageAccess', {})
print('notes:', pa.get('notes'), '| reports:', pa.get('reports'), '| admin.users:', pa.get('admin.users'))
"
echo "=== admin denies notes + reports ==="
ADMIN_JAR=/tmp/e2e-cookies.txt
rm -f $ADMIN_JAR
curl -s -c $ADMIN_JAR -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"e2e-admin@rose.local","password":"Test!Pass123"}' > /dev/null
STAFF_ID=$(curl -s -b $JAR $BASE/api/auth/me | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['id'])")
curl -s -b $ADMIN_JAR -X PATCH $BASE/api/users/$STAFF_ID -H "Content-Type: application/json" \
  -d '{"pageAccess":{"notes":false,"reports":false}}' | head -c 60; echo
echo "=== after deny: staff pageAccess ==="
curl -s -b $JAR $BASE/api/auth/me | python3 -c "
import json,sys
d = json.load(sys.stdin)
pa = d.get('pageAccess', {})
print('notes:', pa.get('notes'), '| reports:', pa.get('reports'), '| others still true?', pa.get('tasks'), pa.get('team'))
"
echo "=== staff cannot patch others ==="
curl -s -b $JAR -X PATCH $BASE/api/users/$STAFF_ID -H "Content-Type: application/json" -d '{"pageAccess":{"tasks":false}}' | head -c 120; echo
echo "=== cleanup: restore ==="
curl -s -b $ADMIN_JAR -X PATCH $BASE/api/users/$STAFF_ID -H "Content-Type: application/json" -d '{"pageAccess":{"notes":true,"reports":true}}' > /dev/null && echo restored
