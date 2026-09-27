# Brief S2: app scaffold
From the orchestrator, release v0.1. Owner decisions: D1 "PWA + APK wrapper", D2 on-phone and file
backup, D11 servings, rulings R1-R3 in docs/DECISIONS.md (read that file, and read docs/PRODUCT.md
sections Platform, Features, and Servings rule).
Base: claude/funny-thompson-jcmpox. Scope: `app/`, `.github/workflows/`, `scripts/`, `.githooks/`,
root `package.json` if needed.
Model: mid. Effort: medium.

Deliverable:
1 `app/` is Vite + React + TypeScript (strict), with vitest, eslint and prettier. It is mobile-first
  (design for a 412x915 viewport) with a light/dark theme following the system.
  The shell has a bottom nav (Home, Cook, Plan, List, My Recipes) and placeholder screens. It also
  has a header Diet quick switch with the presets Everything / Vegetarian / No red meat
  (fish + poultry OK). The choice persists.
2 Data layer: a `Db` interface with a native implementation (@capacitor-community/sqlite) and a
  web implementation (sqlite-wasm, or jeep-sqlite if parity is easier; pick one and justify it
  in one line). There are two databases. `user.db` gets migrations v1: settings (people default
  2, servings_per_person 1.5, units metric, diet_preset), favorites, my_recipes, recipe_forks
  (parent id and diff), kitchen_items, plans, plan_entries, grocery_lists and grocery_items.
  `corpus.db` is read-only. `ingest` owns its schema and it has not landed yet, so mirror a
  minimal local draft in `app/src/corpus/draft.ts`, with a 20-recipe hand-written fixture for
  dev and tests. Mark it DRAFT.
3 Backup: export user.db tables to JSON and import JSON back, with a round-trip unit test. It
  uses the Share API on native and a download in the browser.
4 Capacitor Android project (`app/android`). Add a GitHub Actions workflow, `.github/workflows/app.yml`,
  that runs on push: typecheck, lint, unit tests, web build, then a debug APK uploaded as an
  artifact (setup-java 17 and the Android SDK). You cannot run the APK job here, so keep it
  standard and say so in the report.
5 `scripts/check.sh` runs typecheck, lint and unit tests and prints one summary line of counts.
  Also add `.githooks/pre-commit` that calls it, and document `git config core.hooksPath .githooks`.
6 Playwright smoke test (use /opt/pw-browsers/chromium and do not install browsers): it loads the
  app, walks the 5 tabs, checks that the diet switch persists across a reload, and saves a
  screenshot of Home at 412x915 to `app/e2e/screens/`.
Out of scope: real features, the matching engine, and ingest.
Checks: typecheck 0, lint 0, unit and e2e counts. The full suite runs once, at the end,
streamed and under a timeout.
Report per ORCHESTRATION §6.
