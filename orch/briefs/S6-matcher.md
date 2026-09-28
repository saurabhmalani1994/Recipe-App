# Brief S6: "What can I cook?" engine and Cook screen (app)
From the orchestrator, release v0.1. Owner, verbatim: "put in the ingredients I have, choose a cuisine
style (e.g. indian, mediterranean, chinese, italian, etc. etc.) and it can recommend recipes".
Also D8 equipment and one pot, D15 diet, R9 (the one-pot filter ANDs with course=main), and
PRODUCT.md Features 1-4. Read schema/README.md, ingest/build/match.sql, and orch/reports/S9a.md.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only.
Model: strong. Effort: high.

Deliverable:
1 Open corpus.db on both platforms, read-only. On web, fetch the asset and open it with
  sqlite-wasm; if the OPFS worker needs a per-db id, add one (S7b open item 1). On native, copy
  the bundled asset on first run. Use app/src/corpus/fixture.db now. The real corpus.db
  (about 200 MB) arrives later from a release asset, so its location must be a single config
  value, and the app must handle "corpus missing or downloading".
2 Engine, a pure TS module over the Db, with unit tests on fixture.db:
  - Inputs: the have-slugs (the kitchen list plus pantry staples; is_staple slugs are always
    assumed), cuisine (or any), diet preset, equipment constraints ("my kitchen has" plus an
    optional "use only"), one-pot, and max time.
  - Output: ranked recipes, each with coverage, missing[], missing-but-substitutable[] (a
    substitution of quality >= 2 whose components you have, in a fitting context), and the
    diet status and swaps.
  - Ranking: coverage first, then fewest truly missing, then the corpus quality score. A
    missing parent/child slug counts as covered (having tomato covers roma_tomato).
3 Cook screen:
  - Chips for what you have, prefilled from the kitchen and editable for this search only.
  - A cuisine picker and filter chips (one-pot, under 30 min, equipment).
  - A result list showing "missing 1: fish sauce, swap: soy sauce + lime", with a tap through
    to the recipe detail.
  - The recipe detail renders corpus recipes: ingredients with per-line swaps, steps, equipment
    and time. Scaling (D11) must work on corpus quantities.
4 Units: metric/US conversion using the corpus `units` table and ingredient densities. Tests
  cover cup of flour to g and oz to g.
5 Tests: engine unit tests, including planted kitchens with known answers (write the expected
  results before running), and a Playwright walk: kitchen, then Cook, then a filter, then a
  result, then detail with the swap shown, at 412x915. The no-horizontal-scroll check stays
  green.
Out of scope: home page rows, planner, and grocery.
Checks: scripts/check.sh, the e2e count, and the engine latency on fixture.db (p50 and p95).
Report per §6.
