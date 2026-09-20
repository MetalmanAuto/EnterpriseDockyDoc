#!/usr/bin/env bash
# Release check: run this after every deploy, against production or the sandbox.
#
#   ./scripts/release-check.sh                                   # production
#   ./scripts/release-check.sh http://localhost:8081 http://localhost:3000
#
# Every line prints PASS or FAIL. Exit code is 1 if anything failed.
set -u
API="${1:-https://dockydoc-api-staging.onrender.com}"   # the Render service (named staging, it is production)
WEB="${2:-https://dockydoc.app}"
fail=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s  (%s)\n' "$1" "$2"; fail=1; }
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }

echo "API $API"
echo "Web $WEB"
echo

# --- API is up and its dependencies answer ---------------------------------
c=$(code "$API/api/v1/health");      [ "$c" = 200 ] && pass "API health" || fail "API health" "HTTP $c"
c=$(code "$API/api/v1/health/deep"); [ "$c" = 200 ] && pass "API deep health (database, storage)" || fail "API deep health" "HTTP $c"
body=$(curl -s -m 20 "$API/api/v1/billing/plans")
echo "$body" | grep -q '"BUSINESS"' && pass "Plans endpoint lists plans" || fail "Plans endpoint" "no BUSINESS plan in body"

# --- Protected routes refuse anonymous callers -----------------------------
# The sandbox signs every request in as the seeded user, so these only mean
# something against a real deployment.
if [ "$(code "$API/api/v1/auth/me")" = 200 ] && echo "$API" | grep -qE 'localhost|127\.0\.0\.1'; then
  printf 'SKIP  Anonymous checks (sandbox dev sign-in is on)\n'
else
  for p in auth/me workspaces "documents?workspaceId=x" admin/overview account/export; do
    c=$(code "$API/api/v1/$p"); [ "$c" = 401 ] && pass "Anonymous $p refused" || fail "Anonymous $p" "HTTP $c, expected 401"
  done
fi
c=$(code -H "Authorization: Bearer dd_live_0000000000000000000000000000000000000000" "$API/api/v1/workspaces")
[ "$c" = 401 ] || [ "$c" = 429 ] && pass "Bad API key refused" || fail "Bad API key" "HTTP $c"

# --- Security headers -------------------------------------------------------
h=$(curl -s -I -m 20 "$API/api/v1/health")
echo "$h" | grep -qi "x-content-type-options: nosniff" && pass "API nosniff header" || fail "API nosniff header" "missing"
echo "$h" | grep -qi "strict-transport-security" && pass "API HSTS header" || fail "API HSTS header" "missing"
h=$(curl -s -I -m 20 -L "$WEB/")
echo "$h" | grep -qi "x-frame-options" && pass "Web frame header" || fail "Web frame header" "missing"

# --- Public pages -----------------------------------------------------------
for p in / /pricing /security /terms /privacy /refunds /acceptable-use /contact /login /register; do
  c=$(code -L "$WEB$p"); [ "$c" = 200 ] && pass "Web $p" || fail "Web $p" "HTTP $c"
done
# Clerk answers a plain curl with 404 and only redirects browser page loads, so ask like a browser.
c=$(code "$WEB/documents" -H 'Accept: text/html' -H 'Sec-Fetch-Dest: document' -H 'Sec-Fetch-Mode: navigate')
[ "$c" = 307 ] || [ "$c" = 302 ] || [ "$c" = 200 ] && pass "Web /documents sends anonymous visitors to sign in" || fail "Web /documents" "HTTP $c"

# --- CORS: the web origin is allowed ---------------------------------------
origin=$(echo "$WEB" | sed 's|/$||')
acao=$(curl -s -I -m 20 -H "Origin: $origin" "$API/api/v1/health" | grep -i "access-control-allow-origin" | tr -d '\r')
[ -n "$acao" ] && pass "CORS allows $origin" || fail "CORS" "no Access-Control-Allow-Origin for $origin"

# --- Response time ----------------------------------------------------------
t=$(curl -s -o /dev/null -m 20 -w '%{time_total}' "$API/api/v1/health")
awk -v t="$t" 'BEGIN { exit !(t < 2.0) }' && pass "Health answers in ${t}s" || fail "Health slow" "${t}s"

echo
if [ "$fail" = 0 ]; then echo "All checks passed."; else echo "Some checks FAILED."; fi
exit $fail
