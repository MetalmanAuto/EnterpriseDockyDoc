#!/usr/bin/env bash
# Load test: fires N requests at C at a time and prints the timing spread.
# Uses only curl, so it runs anywhere. Run against the sandbox first;
# against production keep N small (the per-IP throttle is 100 a minute).
#
#   ./scripts/load-test.sh http://localhost:8081 200 20
#
set -u
API="${1:-http://localhost:8081}"
N="${2:-200}"
C="${3:-20}"
DIR=$(mktemp -d)
echo "Firing $N requests, $C at a time, at $API/api/v1/billing/plans"
start=$(date +%s.%N)
seq 1 "$N" | xargs -P "$C" -I{} sh -c "curl -s -o /dev/null -w '%{http_code} %{time_total}\n' -m 30 '$API/api/v1/billing/plans' >> '$DIR/out.txt'"
end=$(date +%s.%N)
sort -k2 -n "$DIR/out.txt" | awk -v n="$N" -v s="$start" -v e="$end" '
  { code[$1]++; t[NR]=$2 }
  END {
    printf "wall time    %.2fs  (%.0f req/s)\n", e-s, n/(e-s);
    printf "p50 %.0f ms   p95 %.0f ms   max %.0f ms\n", t[int(NR*0.5)]*1000, t[int(NR*0.95)]*1000, t[NR]*1000;
    for (c in code) printf "HTTP %s: %d\n", c, code[c];
  }'
rm -rf "$DIR"
