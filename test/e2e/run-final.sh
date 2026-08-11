#!/bin/bash
echo "=== SES GARANTİSİ ==="
pkill -f '[n]ode server.js' 2>/dev/null
sleep 1
rm -f /home/user/nexarc-app/accounts.json
(cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
sleep 2
timeout 300 node v41-sound-test.js 2>&1 | grep -E "✗|SONUÇ"
echo "=== MASAÜSTÜ ==="
pkill -f '[n]ode server.js' 2>/dev/null
sleep 1
rm -f /home/user/nexarc-app/accounts.json
(cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
sleep 2
timeout 300 node browser-test.js 2>&1 | grep -E "✗|SONUÇ"
pkill -f '[n]ode server.js' 2>/dev/null
