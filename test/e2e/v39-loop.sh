#!/bin/bash
for i in 1 2 3 4 5; do
  echo "=== v39 KOŞU $i (temiz hesap) ==="
  pkill -f "node server.js" 2>/dev/null
  rm -f /home/user/nexarc-app/accounts.json
  sleep 1
  (cd /home/user/nexarc-app && nohup node server.js > /tmp/srv.log 2>&1 &)
  sleep 2
  timeout 300 node v39-check.js 2>&1 | grep -E "✗|SONUÇ"
done
