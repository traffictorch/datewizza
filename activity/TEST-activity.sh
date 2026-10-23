#!/bin/bash
API="https://traffic-torch-auth.traffictorch.workers.dev"
[ -z "$TOKEN" ] && { echo -n "JWT: "; read -r TOKEN; }

echo ""; echo "── /api/activity/me ─────────────────"
curl -sS "$API/api/activity/me?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── /api/activity/network (scope=network) ──"
curl -sS "$API/api/activity/network?scope=network&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── /api/activity/network (scope=everyone) ─"
curl -sS "$API/api/activity/network?scope=everyone&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── /api/activity/user/bicommunications2 ──"
curl -sS "$API/api/activity/user/bicommunications2?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""; echo "── unauth → 401 ─────────────────────"
curl -sS "$API/api/activity/me" | python3 -m json.tool
