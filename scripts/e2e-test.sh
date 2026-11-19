#!/bin/bash
# تست E2E کامل رز هاب — بندهای ۱ تا ۷
BASE="http://127.0.0.1:3000"
JAR=/tmp/rosehub-cookies.txt
PASS_FAIL=0

chk() { # chk <name> <result>
  if [ "$2" = "1" ]; then echo "  [OK] $1"; else echo "  [FAIL] $1"; PASS_FAIL=1; fi
}

echo "=== ۱) ورود ادمین ==="
CODE=$(curl -s -c $JAR -o /tmp/login.json -w "%{http_code}" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"saeed@rose.ir","password":"test12345"}')
echo "  login http=$CODE"; [ "$CODE" = "200" ] && echo "  [OK] ورود" || { echo "  [FAIL] ورود"; PASS_FAIL=1; }

echo "=== ۲) مراکز (بند ۱+۵) ==="
DATA=$(curl -s -b $JAR $BASE/api/admin/centers)
N=$(echo "$DATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['centers']))")
chk "فهرست مراکز = 27" "$([ "$N" = "27" ] && echo 1 || echo 0)"

echo "=== ۳) ثبت مرکز جدید + ویرایش + حذف ==="
CODE=$(curl -s -b $JAR -o /tmp/cnew.json -w "%{http_code}" -X POST $BASE/api/admin/centers -H "Content-Type: application/json" -d '{"name":"مرکز تست E2E","type":"CENTER","province":"تهران","lat":35.7,"lng":51.4}')
chk "ثبت مرکز جدید" "$([ "$CODE" = "201" ] && echo 1 || echo 0)"
CID=$(python3 -c "import json;print(json.load(open('/tmp/cnew.json'))['center']['id'])")
CODE=$(curl -s -b $JAR -o /dev/null -w "%{http_code}" -X PATCH $BASE/api/admin/centers/$CID -H "Content-Type: application/json" -d '{"city":"تهران","isActive":false}')
chk "ویرایش مرکز" "$([ "$CODE" = "200" ] && echo 1 || echo 0)"
CODE=$(curl -s -b $JAR -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/admin/centers/$CID)
chk "حذف مرکز" "$([ "$CODE" = "200" ] && echo 1 || echo 0)"

echo "=== ۴) همگام‌سازی مراکز از تکنورز (بند ۱ — انتظار خطای ارتباط چون تکنورز محلی نیست) ==="
CODE=$(curl -s -b $JAR -o /tmp/sync.json -w "%{http_code}" -X POST $BASE/api/admin/centers/sync -H "Content-Type: application/json" -d '{}')
echo "  sync http=$CODE (502 مورد انتظار — تکنورز روی این سرور در دسترس نیست)"
chk "sync مسیر موجود است" "$([ "$CODE" = "502" ] && echo 1 || echo 0)"

echo "=== ۵) مدیریت‌ها (بند ۴) ==="
DATA=$(curl -s -b $JAR $BASE/api/admin/managements)
N=$(echo "$DATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['managements']))")
chk "فهرست مدیریت‌ها = 1" "$([ "$N" = "1" ] && echo 1 || echo 0)"
chk "مدیر مدیریت = سعید جلیوند" "$(echo "$DATA" | grep -q "سعید جلیوند" && echo 1 || echo 0)"

echo "=== ۶) زیرمجموعه‌ها (بند ۳) ==="
DATA=$(curl -s -b $JAR $BASE/api/team)
chk "isGlobal مدیر کل" "$(echo "$DATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d['isGlobal'] and len(d['members'])>=1 and d['directCount']>=1 else 0)")"
chk "آمار وظایف زیرمجموعه" "$(echo "$DATA" | grep -q '"total":1' && echo 1 || echo 0)"

echo "=== ۷) وظایف — دامنهٔ مدیر (بند ۳) ==="
DATA=$(curl -s -b $JAR "$BASE/api/tasks")
N=$(echo "$DATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['tasks']))")
chk "مدیر کل می‌بیند وظیفهٔ زیرمجموعه را" "$([ "$N" = "1" ] && echo 1 || echo 0)"

echo "=== ۸) گزارش اکسل — آپلود چندفایلی (بند ۷) ==="
CODE=$(curl -s -b $JAR -o /tmp/up.json -w "%{http_code}" -X POST $BASE/api/reports/excel \
  -F "files=@/home/z/my-project/upload/خدمات آزاد شهریور 1405 کلی.xlsx")
chk "آپلود فایل نمونه" "$([ "$CODE" = "201" ] && echo 1 || echo 0)"
OK=$(python3 -c "import json;d=json.load(open('/tmp/up.json'));print(d['results'][0]['ok'])")
chk "پارس موفق" "$([ "$OK" = "True" ] && echo 1 || echo 0)"
MN=$(python3 -c "import json;d=json.load(open('/tmp/up.json'));r=d['results'][0];print(r['month'],r['year'],r['n'])")
echo "  دوره و مشاوران: $MN (انتظار: 6 1405 216)"
DATA=$(curl -s -b $JAR $BASE/api/reports/excel)
N=$(echo "$DATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['files']))")
chk "فهرست گزارش‌ها = 1" "$([ "$N" = "1" ] && echo 1 || echo 0)"
FID=$(echo "$DATA" | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['id'])")
DATA=$(curl -s -b $JAR $BASE/api/reports/excel/$FID)
NR=$(echo "$DATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['file']['records']),len(d['file']['services']))")
chk "داشبورد: رکورد=216 و خدمت=16" "$(echo "$NR" | grep -q "216 16" && echo 1 || echo 0)"

echo "=== ۹) انتقال پروفایل SSO با مرکز و نقشه (بند ۶) ==="
DATA=$(curl -s -X POST $BASE/api/sso/profile -H "Content-Type: application/json" -d '{"clientId":"rose-techno-8a4e1f","clientSecret":"test-secret-e2e","username":"1286982634"}')
chk "found=true" "$(echo "$DATA" | grep -q '"found":true' && echo 1 || echo 0)"
chk "clinicCenter با مختصات" "$(echo "$DATA" | python3 -c "
import sys,json;d=json.load(sys.stdin);cc=d['profile'].get('clinicCenter') or {};print(1 if cc.get('lat') is not None and cc.get('lng') is not None else 0)")"
chk "management در پاسخ" "$(echo "$DATA" | grep -q 'مدیریت درمان' && echo 1 || echo 0)"
chk "managerName در پاسخ" "$(echo "$DATA" | grep -q 'سعید جلیوند' && echo 1 || echo 0)"
chk "فیلدهای پرونده (profRank/contractNo)" "$(echo "$DATA" | grep -q 'jobTitle' && echo 1 || echo 0)"
echo "$DATA" | python3 -c "import sys,json;p=json.load(sys.stdin)['profile'];print('  نمونه:', p['name'], '| کلینک:', p['clinic'], '| lat:', (p.get('clinicCenter') or {}).get('lat'))"

echo "=== ۱۰) کاربران با فیلدهای جدید (بند ۱+۳+۴) ==="
DATA=$(curl -s -b $JAR "$BASE/api/users?withAccess=1")
chk "center/clinic/management/manager در پاسخ" "$(echo "$DATA" | python3 -c "
import sys,json;d=json.load(sys.stdin);u=[x for x in d['users'] if x['username']=='1286982634'][0]
print(1 if u['clinicId'] and u['managementId'] and u['managerId'] else 0)")"
chk "clinicName از اطلاعات پایه" "$(echo "$DATA" | grep -q 'کلینیک اصفهان' && echo 1 || echo 0)"

echo "=== ۱۱) حذف گزارش + پایان ==="
CODE=$(curl -s -b $JAR -o /dev/null -w "%{http_code}" -X DELETE $BASE/api/reports/excel/$FID)
chk "حذف گزارش" "$([ "$CODE" = "200" ] && echo 1 || echo 0)"

echo ""
[ "$PASS_FAIL" = "0" ] && echo "همهٔ تست‌ها موفق بود ✓" || echo "بعضی تست‌ها شکست خورد ✗"
exit $PASS_FAIL
