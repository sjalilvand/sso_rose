#!/bin/bash
# تست واقعی HTTP برای APIهای گزارش رز هاب — بازتولید و تأیید فیکس ۵۰۰
cd /home/z/my-project
PORT=3210
LOG=/tmp/rose-test-server.log

# اجرای سرور
(PORT=3210 npx next start -p $PORT > $LOG 2>&1 &) 
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null http://127.0.0.1:$PORT/login; then break; fi
done
echo "== server up =="

# 1) ورود — گرفتن کوکی سشن
COOKIE=/tmp/rose-cookie.txt
LOGIN=$(curl -s -c $COOKIE -X POST http://127.0.0.1:$PORT/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e-admin@rose.local","password":"test12345"}')
echo "LOGIN: $(echo $LOGIN | head -c 200)"

echo ""
echo "== 1) GET /api/reports/excel =="
curl -s -o /tmp/t1.json -w "HTTP %{http_code}\n" -b $COOKIE http://127.0.0.1:$PORT/api/reports/excel
head -c 150 /tmp/t1.json; echo

echo ""
echo "== 2) GET /api/reports/dataset =="
curl -s -o /tmp/t2.json -w "HTTP %{http_code}\n" -b $COOKIE http://127.0.0.1:$PORT/api/reports/dataset
head -c 150 /tmp/t2.json; echo

echo ""
echo "== 3) POST multipart /api/reports/excel (فایل واقعی) =="
curl -s -o /tmp/t3.json -w "HTTP %{http_code}\n" -b $COOKIE \
  -F "files=@/tmp/test-report.xlsx" \
  http://127.0.0.1:$PORT/api/reports/excel
head -c 300 /tmp/t3.json; echo

echo ""
echo "== 4) POST multipart /api/reports/dataset (فایل واقعی) =="
curl -s -o /tmp/t4.json -w "HTTP %{http_code}\n" -b $COOKIE \
  -F "files=@/tmp/test-report.xlsx" \
  http://127.0.0.1:$PORT/api/reports/dataset
head -c 300 /tmp/t4.json; echo

echo ""
echo "== 5) POST با Content-Type اشتباه (رفتار قدیمی کلاینت) → باید ۴۰۰ باشد نه ۵۰۰ =="
curl -s -o /tmp/t5.json -w "HTTP %{http_code}\n" -b $COOKIE \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:$PORT/api/reports/excel
cat /tmp/t5.json; echo

curl -s -o /tmp/t6.json -w "HTTP %{http_code}\n" -b $COOKIE \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  http://127.0.0.1:$PORT/api/reports/dataset
cat /tmp/t6.json; echo

echo ""
echo "== لاگ سرور (stderr) =="
tail -8 $LOG
