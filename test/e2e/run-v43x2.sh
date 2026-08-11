#!/bin/bash
for i in 1 2; do
  echo "=== v43 KOŞU $i ==="
  pkill -f '[n]ode server.js' 2>/dev/null
  sleep 1
  rm -f /home/user/nexarc-app/accounts.json
  (cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
  sleep 2
  timeout 300 node v43-cam-layout-test.js 2>&1 | grep -E "✗|SONUÇ"
done
pkill -f '[n]ode server.js' 2>/dev/null
