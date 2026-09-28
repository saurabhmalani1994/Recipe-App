#!/usr/bin/env bash
# Device smoke gate (S21, ORCHESTRATION.md section 8: "the packaged build launches with its
# assets"). Run against a booted emulator or device: installs the debug APK, launches it cold, and
# polls logcat until the app prints `[corpus] ready <n> recipes` (src/db/corpusDb.ts).
#
# Fails on: a `could not be opened` or `[corpus] missing` line, a crash of the app process, a
# ready line with 0 recipes, or no ready line within the timeout (default 600 s).
# Prints one line per poll (rule 21: no silent long command) and a SUMMARY line at the end. When
# GITHUB_STEP_SUMMARY is set, the result, including the first-launch copy time, is added to it.
#
# Usage: device-smoke.sh <app-debug.apk> [timeout-seconds]
set -uo pipefail

apk="${1:?usage: device-smoke.sh <app-debug.apk> [timeout-seconds]}"
limit="${2:-600}"
pkg="app.recipeapp.mobile"
poll=5

summary() {
  echo "SUMMARY: $1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '### Device smoke\n\n%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  fi
}

adb wait-for-device
adb install -r -g "$apk" || { summary "FAILED: adb install"; exit 1; }
adb shell pm clear "$pkg" > /dev/null
# A larger ring buffer, so a slow first launch does not rotate the corpus lines out before a poll.
adb logcat -G 16M > /dev/null 2>&1 || true
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity" || { summary "FAILED: am start"; exit 1; }

start=$(date +%s)
while true; do
  elapsed=$(( $(date +%s) - start ))
  dump="$(adb logcat -d -v time 2>/dev/null)"
  corpus_lines="$(printf '%s\n' "$dump" | grep -F '[corpus]' || true)"
  failed="$(printf '%s\n' "$dump" | grep -E 'could not be opened|\[corpus\] missing' || true)"
  crash="$(printf '%s\n' "$dump" | grep -A20 'FATAL EXCEPTION' | grep -F "$pkg" || true)"
  ready="$(printf '%s\n' "$corpus_lines" | grep -Eo '\[corpus\] ready [0-9]+ recipes' | head -1)"
  copied="$(printf '%s\n' "$corpus_lines" | grep -Eo '\[corpus\] copied in [0-9]+ ms' | head -1)"

  if [ -n "$failed" ] || [ -n "$crash" ]; then
    printf '%s\n' "$corpus_lines" "$failed" "$crash"
    summary "FAILED after ${elapsed}s: ${failed:-app crashed}"
    exit 1
  fi
  if [ -n "$ready" ]; then
    printf '%s\n' "$corpus_lines"
    count="$(echo "$ready" | grep -Eo '[0-9]+')"
    if [ "$count" -eq 0 ]; then
      summary "FAILED after ${elapsed}s: the corpus opened with 0 recipes"
      exit 1
    fi
    summary "PASSED: ${ready} after ${elapsed}s from launch; first-launch copy: ${copied:-no copy line}"
    exit 0
  fi
  if [ "$elapsed" -ge "$limit" ]; then
    printf '%s\n' "$corpus_lines"
    printf '%s\n' "$dump" | grep -E 'Capacitor|chromium|AndroidRuntime' | tail -40
    summary "FAILED: no '[corpus] ready' line within ${limit}s"
    exit 1
  fi
  if [ -z "$(adb shell pidof "$pkg" 2>/dev/null)" ] && [ "$elapsed" -ge 30 ]; then
    printf '%s\n' "$dump" | tail -40
    summary "FAILED after ${elapsed}s: the app process is not running"
    exit 1
  fi
  echo "waiting ${elapsed}s: ${copied:-no copy line yet}"
  sleep "$poll"
done
