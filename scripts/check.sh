#!/usr/bin/env bash
# Runs the app's cheap gates (typecheck, lint, unit tests) and prints one summary line.
# ORCHESTRATION.md rule 21: streamed output, no silent long command.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$repo_root/app"
cd "$app_dir" || exit 1

typecheck_status="pass"
lint_status="pass"
unit_passed=0
unit_failed=0

echo "== typecheck =="
if ! npx tsc -b --noEmit; then
  typecheck_status="fail"
fi

echo "== lint =="
if ! npx eslint . --max-warnings=-1; then
  lint_status="fail"
fi

echo "== unit tests =="
unit_output="$(npx vitest run 2>&1)"
echo "$unit_output"
# vitest prints a line like "Tests  7 passed (7)" or "Tests  6 passed | 1 failed (7)".
unit_passed="$(echo "$unit_output" | grep -Eo '[0-9]+ passed' | grep -Eo '[0-9]+' | tail -1)"
unit_failed="$(echo "$unit_output" | grep -Eo '[0-9]+ failed' | grep -Eo '[0-9]+' | tail -1)"
unit_passed="${unit_passed:-0}"
unit_failed="${unit_failed:-0}"

echo "SUMMARY: typecheck=$typecheck_status lint=$lint_status unit_passed=$unit_passed unit_failed=$unit_failed"

if [ "$typecheck_status" = "fail" ] || [ "$lint_status" = "fail" ] || [ "$unit_failed" -gt 0 ]; then
  exit 1
fi
