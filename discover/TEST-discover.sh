#!/bin/bash
# Smoke test for GET /api/users/discover
# Usage:  TOKEN="eyJ..." bash TEST-discover.sh
#    or:  bash TEST-discover.sh        (will prompt for token)

API="https://traffic-torch-auth.traffictorch.workers.dev"

if [ -z "$TOKEN" ]; then
  echo -n "Paste JWT: "
  read -r TOKEN
fi

echo ""
echo "── today (stable, 24) ─────────────────────────"
curl -sS "$API/api/users/discover?seed=today&limit=24&offset=0" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "── fresh (randomised, 24) ─────────────────────"
curl -sS "$API/api/users/discover?seed=fresh&limit=24&offset=0" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

echo ""
echo "── unauth (should 401) ────────────────────────"
curl -sS "$API/api/users/discover" | python3 -m json.tool
