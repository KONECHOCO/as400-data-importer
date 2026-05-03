#!/bin/bash
# Login e ottieni token
TOKEN=$(curl -s -X POST http://127.0.0.1:8003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"konechoco@gmail.com","password":"Kone2026"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')

if [ -n "$TOKEN" ]; then
  curl -s -X GET http://127.0.0.1:8003/api/admin/send-trial-reminders \
    -H "Authorization: Bearer $TOKEN"
  echo "$(date): Promemoria inviati" >> /var/log/as400_cron.log
else
  echo "$(date): Errore login admin" >> /var/log/as400_cron.log
fi
