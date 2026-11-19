#!/bin/bash
# e2e-test.sh — تست سرتاسری APIهای تغییرکرده روی سرور محلی
set -e
BASE=http://localhost:3777
JAR=/tmp/e2e-cookies.txt
rm -f $JAR

echo "=== 1) Login ==="
LOGIN=$(curl -s -c $JAR -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"1111111111","password":"Test!Pass123"}')
echo "$LOGIN" | head -c 300; echo

echo "=== 2) /api/auth/me — pageAccess ==="
curl -s -b $JAR $BASE/api/auth/me | python3 -c "
import json,sys
d = json.load(sys.stdin)
pa = d.get('pageAccess', {})
print('user:', d['user']['name'], d['user']['role'])
print('pageAccess keys:', len(pa), '— all true?', all(pa.values()) if pa else 'EMPTY')
"

echo "=== 3) /api/reports — THE USER-REPORTED ERROR ==="
curl -s -b $JAR -w "\nHTTP: %{http_code}\n" $BASE/api/reports | head -c 500; echo

echo "=== 4) /api/team — tree members ==="
curl -s -b $JAR $BASE/api/team | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('members:', len(d.get('members', [])), 'isGlobal:', d.get('isGlobal'))
if d.get('members'):
    m = d['members'][0]
    print('first member has managerId?', 'managerId' in m, '| manager:', m.get('manager'))
"

echo "=== 5) /api/admin/centers — county field ==="
curl -s -b $JAR $BASE/api/admin/centers | python3 -c "
import json,sys
d = json.load(sys.stdin)
cs = d.get('centers', [])
print('centers:', len(cs))
if cs:
    print('county field present?', 'county' in cs[0])
"

echo "=== 6) POST /api/reports/dataset — universal excel upload ==="
python3 - <<'PYEOF'
import openpyxl, random
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "فروش"
ws.append(["نام شعبه", "استان", "ماه", "درآمد (ریال)", "هزینه (ریال)", "تعداد مراجع", "امتیاز رضایت"])
rows = [
    ["شعبه مرکزی", "تهران", "1405/01", 125000000, 80000000, 340, 4.2],
    ["شعبه تبریز", "آذربایجان شرقی", "1405/01", 98000000, 62000000, 210, 4.5],
    ["شعبه اردبیل", "اردبیل", "1405/01", 54000000, 41000000, 120, 3.8],
    ["شعبه مرکزی", "تهران", "1405/02", 138000000, 85000000, 380, 4.1],
    ["شعبه تبریز", "آذربایجان شرقی", "1405/02", 104000000, 60000000, 230, 4.6],
    ["شعبه اردبیل", "اردبیل", "1405/02", 61000000, 44000000, 135, 4.0],
]
for r in rows:
    ws.append(r)
wb.save("/tmp/universal-test.xlsx")
print("xlsx created")
PYEOF
UP=$(curl -s -b $JAR -X POST $BASE/api/reports/dataset -F "files=@/tmp/universal-test.xlsx")
echo "$UP" | head -c 400; echo

echo "=== 7) GET dataset detail ==="
DS_ID=$(echo "$UP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
ok = [r for r in d['results'] if r.get('ok')]
print(ok[0]['id'] if ok else '')
")
if [ -n "$DS_ID" ]; then
curl -s -b $JAR $BASE/api/reports/dataset/$DS_ID | python3 -c "
import json,sys
d = json.load(sys.stdin)
ds = d['dataset']
print('sheets:', [s['name'] for s in ds['sheets']])
main = ds['sheets'][0]
print('columns:', [(c['name'], c['type']) for c in main['columns']])
print('rows:', len(main['rows']))
prof = main['profile']
incom = [p for p in prof if 'درآمد' in p['name']][0]
print('درآمد profile: sum=%.0f mean=%.0f min=%.0f max=%.0f' % (incom['sum'], incom['mean'], incom['min'], incom['max']))
"
fi

echo "=== 8) Custom indicator POST (AGG) ==="
curl -s -b $JAR -X POST $BASE/api/reports/indicators -H "Content-Type: application/json" \
  -d '{"name":"جمع درآمد","formula":"SUM([درآمد (ریال)])","kind":"AGG","description":"تست"}' | head -c 300; echo
echo "=== 9) Custom indicator POST (ROW) ==="
curl -s -b $JAR -X POST $BASE/api/reports/indicators -H "Content-Type: application/json" \
  -d '{"name":"حاشیه سود","formula":"[درآمد (ریال)] - [هزینه (ریال)]","kind":"ROW","description":"تست"}' | head -c 300; echo
echo "=== 10) Invalid formula rejected? ==="
curl -s -b $JAR -X POST $BASE/api/reports/indicators -H "Content-Type: application/json" \
  -d '{"name":"بد","formula":"SUM([موجود نیست])","kind":"AGG"}' | head -c 200; echo

echo "=== 11) Page permission PATCH on test user ==="
ME_ID=$(curl -s -b $JAR $BASE/api/auth/me | python3 -c "import json,sys; print(json.load(sys.stdin)['user']['id'])")
curl -s -b $JAR -X PATCH $BASE/api/users/$ME_ID -H "Content-Type: application/json" \
  -d '{"pageAccess":{"notes":false}}' | head -c 150; echo
curl -s -b $JAR $BASE/api/auth/me | python3 -c "
import json,sys
d = json.load(sys.stdin)
print('notes pageAccess now:', d['pageAccess'].get('notes'))
"
curl -s -b $JAR -X PATCH $BASE/api/users/$ME_ID -H "Content-Type: application/json" \
  -d '{"pageAccess":{"notes":true}}' > /dev/null && echo "notes access restored"

echo "=== DONE ==="
