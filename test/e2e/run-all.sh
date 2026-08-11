#!/bin/bash
# 2 kez v42-layout + 1 kez ses garantisi
for i in 1 2; do
  echo "=== LAYOUT KOŞU $i ==="
  pkill -f '[n]ode server.js' 2>/dev/null
  sleep 1
  rm -f /home/user/nexarc-app/accounts.json
  (cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
  sleep 2
  timeout 260 node v42-layout-check.js 2>&1 | grep -E "✗|SONUÇ"
done
echo "=== SES GARANTİSİ ==="
pkill -f '[n]ode server.js' 2>/dev/null
sleep 1
rm -f /home/user/nexarc-app/accounts.json
(cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
sleep 2
timeout 300 node v41-sound-test.js 2>&1 | grep -E "✗|SONUÇ"
pkill -f '[n]ode server.js' 2>/dev/null
