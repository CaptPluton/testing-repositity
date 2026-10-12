#!/usr/bin/env bash
# Unattended deploy of Vdvoem to Railway using the Railway CLI.
# Needs: RAILWAY_API_TOKEN (account token), BOT_TOKEN. Optional: GOOGLE_CLIENT_ID,
# GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY, RAILWAY_WORKSPACE, PROJECT_NAME.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${RAILWAY_API_TOKEN:?RAILWAY_API_TOKEN is required (railway.com/account/tokens)}"
: "${BOT_TOKEN:?BOT_TOKEN is required}"
PROJECT_NAME="${PROJECT_NAME:-vdvoem}"
command -v railway >/dev/null || npm i -g @railway/cli

echo "==> Railway account: $(railway whoami 2>/dev/null || echo unknown)"

# 1. Project + service (idempotent: reuse the link if this directory is already linked)
if railway status --json >/dev/null 2>&1; then
  echo "==> Already linked: $(railway status --json | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("name") or d)' 2>/dev/null)"
else
  echo "==> Creating project '$PROJECT_NAME' and first deploy"
  if [ -n "${RAILWAY_WORKSPACE:-}" ]; then
    railway up -y --new --name "$PROJECT_NAME" -w "$RAILWAY_WORKSPACE" -d
  else
    railway up -y --new --name "$PROJECT_NAME" -d
  fi
fi

SERVICE="$(railway service list --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); s=d if isinstance(d,list) else d.get("services",[]); print(s[0]["name"] if s else "")' 2>/dev/null || true)"
SERVICE="${SERVICE:-$PROJECT_NAME}"
echo "==> Service: $SERVICE"

# 2. Public domain
DOMAIN="$(railway domain --service "$SERVICE" --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("domain") or d.get("serviceDomain") or (d.get("domains") or [{}])[0].get("domain",""))' 2>/dev/null || true)"
if [ -z "$DOMAIN" ]; then
  DOMAIN="$(railway domain list --service "$SERVICE" --json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); l=d if isinstance(d,list) else d.get("serviceDomains") or d.get("domains") or []; print(l[0]["domain"] if l else "")' 2>/dev/null || true)"
fi
: "${DOMAIN:?Could not determine the Railway domain; run: railway domain --service $SERVICE}"
echo "==> Domain: https://$DOMAIN"

# 3. Variables (secrets are read from the environment, never echoed)
railway variable set --service "$SERVICE" --skip-deploys \
  "PUBLIC_URL=https://$DOMAIN" "DATA_DIR=/data" "MINI_APP_SHORT_NAME=${MINI_APP_SHORT_NAME:-app}" \
  "GOOGLE_CALENDAR_ID=${GOOGLE_CALENDAR_ID:-primary}" "TZ_NAME=Asia/Bangkok" >/dev/null
printf '%s' "$BOT_TOKEN" | railway variable set BOT_TOKEN --stdin --service "$SERVICE" --skip-deploys >/dev/null
for v in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ANTHROPIC_API_KEY; do
  if [ -n "${!v:-}" ]; then printf '%s' "${!v}" | railway variable set "$v" --stdin --service "$SERVICE" --skip-deploys >/dev/null; echo "==> set $v"; fi
done

# 4. Persistent volume for SQLite
if ! railway volume list --json 2>/dev/null | grep -q '"/data"'; then
  echo "==> Adding volume at /data"
  railway volume add --service "$SERVICE" --mount-path /data --json >/dev/null
fi

# 5. Deploy with the final configuration
echo "==> Deploying"
railway up --service "$SERVICE" -c
railway service status 2>/dev/null || true
echo
echo "Done. Mini App URL: https://$DOMAIN"
echo "Health: $(curl -s --max-time 20 "https://$DOMAIN/healthz" || echo 'not reachable from here')"
echo "Next: BotFather /newapp with URL https://$DOMAIN and short name ${MINI_APP_SHORT_NAME:-app}; /setprivacy Disable; add the bot to your group and send /start."
