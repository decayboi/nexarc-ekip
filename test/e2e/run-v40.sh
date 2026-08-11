#!/bin/bash
pkill -f '[n]ode server.js' 2>/dev/null
sleep 1
rm -f /home/user/nexarc-app/accounts.json
(cd /home/user/nexarc-app && nohup node server.js > /tmp/s.log 2>&1 &)
sleep 2
timeout 300 node v40-check.js 2>&1 | grep -E "✗|SONUÇ"
pkill -f '[n]ode server.js' 2>/dev/null
