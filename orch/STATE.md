# State (what is true now)

Updated: 2026-09-28
Branch: `claude/funny-thompson-jcmpox` (the only branch). Commit identity: saurabhmalani1994 noreply (D10).

## Phase
v0.2 feature-complete candidate. corpus/corpus.db (LFS, oid 891349ec..., 68,966 recipes, schema 4) ships in the APK.
CI run 20 (d06aed5) is GREEN, including "Check the APK assets hold the real corpus". APK artifact 92.6 MB zipped.
S22a redesign (opus, 4331) is running. S21 is merged; waiting on its first device-smoke CI run.

## Waiting on owner
- Install the APK and try it on the phone. This is the FIRST device run: the native corpus copy (228 MB copyFromAssets) is unverified.
- Size choice: 69k at 228 MB is the default; raising the cap is the alternative.

## Known open items (not queued)
- Dish-marker cuisine mislabels (chutney, FuFu, Tacos Arabes). Nutrition fill 36%; giallozafferano 0%.
- The browser demo (https://claude.ai/artifact/FH5WscMtqy8de1y7ogSfxR) still runs the fixture at the old build.
- The Kaggle token and the seasonality location were never answered; defaults are applied.

## Demo
Rebuild with VITE_CORPUS_DB_URL=assets/databases/corpus-db.bin.wasm --base=./ and inline the CSS (the host does not serve .db).

## Mapping (§4)
strong=opus, mid=sonnet, cheap=haiku, top=fable. The orchestrator runs on strong.

## Done
- S21 merged. 230 unit, e2e 35. The native readonly fix is proven with the exact error. The device-smoke CI job has NOT run yet (first on this push).
- S19 merged. 501 pytest, 220 unit, e2e 35. 68,966 recipes, schema 4. CI builds the APK with the real corpus from LFS.
- S20 merged. 218 unit, e2e 35.
- S10b merged. 495 pytest; course blind2 93.3%. title_cuisine exists but is NOT wired into the build (S19, R20).
- S18 merged. Fixture refreshed (Food Wishes video + site rows). 212 unit, e2e 35. Video method UI in.
- S10 merged. 492 pytest, 209 unit. corpus.db 64,225 recipes, 227.8 MB, schema 3 (video_url). The size cap binds (3.5 KB/recipe).
  Veg ok+adaptable 92% (D16 makes nearly all adaptable; mention to owner). Nutrition 37.8%. Rebuild commands in
  ingest/build/CURATED_BUILD.md. git-lfs 3.4.1 installed in this container (apt).
- S16 merged (user.db v7 avoid_ingredients). 209 unit, e2e 34.
- S17b merged. 472 pytest. New sites: justonecookbook (browser), persianpot, thespicespoon, cookingwithsamira, greedygirlgourmet.
  9 big sites are bot-challenged even in a browser, so they are dropped. French stays at 2.
- S17 merged (test conflict with S1c resolved). 469 pytest. 27 sites kept (list in ingest/fetch/sites.yaml); the smoke test wrote 770.
- S8b merged. 462 pytest. Tuning set rho 0.325 -> 0.491. The new 80k: american+southern 8.8%, style markers 5,911 -> 191,
  median lines 12. Sheet 2 is at ingest/curate/eval/owner_grade_2.md. R18 floor cap goes into S10.
- S1c merged. Food Wishes has 1,084 recipes (was 300). 1,349 posts have no recipe; 587 are Allrecipes-only (blocked). Gold 29/30.
- S1b merged. 435 pytest. The BBC TypeError (int recipeYield) and double-counted drops are fixed. Capped retry: 199/200 recovered.
- S15 merged. 432 pytest, 164 unit, e2e 31. Schema v2 (servings_source). Sample fill: servings 100%, nutrition 47.7%. Eval 61.9% (bar 70) shipped per R14.
- S12 merged (Cook/css conflicts with S11, both kept). 163 unit, e2e 31. Found a favorite-source bug for Mine results, so S12b.
- S14 merged (conflict with S8 in build_corpus.py; both kept). 382 pytest. USDA mapping 97.4% of occurrences;
  gold 13/15. BUT servings is known for only 1,034/80,000 corpus recipes, so nutrition and D11 scaling fail. So S15.
- S11 merged (migration conflict: S13=v5, S11=v6). 152 unit, e2e 28.
- S8 merged. Re-run: 361 pytest. corpus.db 80,000 recipes, 188.2 MB at /home/user/recipe-data/out (NOT durable).
  Proxy bar FAILED (rho -0.038 vs food.com ratings; ratings are compressed at 4.6). The owner grade is the real test.
  Ratings mirror: HF peterpeeterspeter/recipe-interactions (699k reviews). Cuisine unknown 33.8%.
- S13 merged. Re-run: 121 unit, e2e 27. TS parser parity 100% on gold 372 and sample 3003. Bump PARSER_VERSION on parser/slugs changes.
- S7c merged. Re-run: 322 pytest, 112 unit, e2e 26. The list is now in shop units. The "¾" came from the foodcom HF mirror
  having no unit column, so R11 drops foodcom; S10 rebuilds after S8.
- S7 merged (screenshot conflicts resolved by rerun). 85 unit, e2e 26. BUT the list is not shoppable:
  unit-less "¾", "garlic 3.8 g", no-qty items dumped to "Check these". So S7c.
- S6b merged. Re-run: 68 unit, e2e 25 passed. One run showed 13 failures because the e2e server reused
  port 4173 across worktrees (it tested another checkout's build). Fixed: PW_PORT, --strictPort,
  no reuse; 2/2 runs green. Tell parallel app builders to set PW_PORT. The ranking floor sits behind RANK_LEGACY.
- S3b merged, then match test updated to D16 (owner: protein swaps count as adaptable). 302 pytest.
  The holdout diet score drifted to 91.7% due to stale labels, left as-is. S8 was cut before S3b, so rebuild the corpus after the S8 merge.
- S6 merged. Re-run: 68 unit, e2e 25 passed. Cook screenshot checked. p50 29 ms on 3.6k. The native corpus path is unrun.
  Ranking puts tiny recipes high, so the owner grades a planted top 10 later (S6b adds a floor behind a constant).
- S9a merged. Re-run: 301 pytest, app check 34/0. Schema v1 in schema/corpus.sql. Size 2,178 B/recipe, so
  about 219 MB at 100k. Match query about 2 ms on 3.6k. Course blind 82% (<85%), so S9b. openrecipes and
  hf_cuisine_type have NO steps, so R10 drops all of them. The pool is recipenlg + small scraped sources.
  recipenlg URLs carry food.com ids: ratings join if the Food.com interactions data is found (Kaggle token or a mirror).
- S5b-2 merged. Re-run: 267 pytest; eval.json held-out 80.7% acc, 28.3% unknown (bar 80/30, a NARROW pass).
  The 300 "hand-checked" set is really lexicon-labelled (not human): 80.5%/14.3%. Section 9 caveat: the key is
  the lexicon's view, not the owner's. Before the ship, have the owner grade ~50 cuisine-filtered results.
  corpus unknown 48.5%. New raw source hf_cuisine_type (74,465 recipes, Eitanli/cuisine_type).
- S7b merged. Re-run: 34/0 unit, e2e 22 passed incl. no-horizontal-scroll at 360 and 412. OPFS in a Worker.
- S5a taggers merged. Re-run: 261 pytest, tag gold BARS PASSED. First run 96.0% diet, final 99.7%, holdout 96.7%.
  20k run: veg ok 57% / adaptable 6% / no 29% / unknown 9%. R9 (one_pot + course=main), R10 (drop nameless/stepless).
- S7a merged. Re-run: check 33/0 unit, e2e 2 passed (after the orchestrator fixed playwright webServer to build
  first; it had failed from a clean tree). The editor ingredient row overflows at 412px, so S7b.
- S5b merged: 224 pytest pass. Cuisine bar MISSED: 68.6% acc / 23.9% unknown held-out, transfer 57%.
  Seasonality done (80 produce slugs). The 2nd attempt, S5b-2, adds labelled data. If it fails again, the next attempt is opus.
- S3 parser + taxonomy, merged. Re-run: pytest 208 passed, taxonomy 0 errors (1553 slugs), gold slug 99.2%
  (first run 97.1%), unit 99.7%, qty 100%. Coverage: RecipeNLG 99.3%, fixture 96.3%. is_staple is narrow (11)
  by design, and user pantry defaults add the rest (S7a).
- S1 sources, merged. pytest 12 passed. Raw data in /home/user/recipe-data/raw (4.7 GB), verified with wc:
  recipenlg 2,231,142; openrecipes 168,442; themealdb 790; foodwishes 300; bbcgoodfood 245; foodcom 1,228
  (the HF mirror is mostly blank); github repos 7 in total (Cookdiary and recipe-generator are link-farm repos,
  so not usable). allrecipes gives 403 even in headless Chromium, so it is dropped.
  Gap: no big rated source. Food.com on Kaggle (230k recipes, 1.1M reviews) needs the owner's Kaggle token.
- CI run 3 GREEN at 2d52b77: typecheck, lint, unit, web build and the debug APK artifact.
- S2 app scaffold, merged 3639216. Re-run: typecheck/lint pass, unit 7/0. CI failed on Node 20
  (jsdom/undici); fixed to Node 22 in df4b21c. The APK job is still unverified. Open: the diet
  preset is in localStorage, not in user.db (wire it in S6).
- S4 + S4b substitutions: validate 0 errors, 790 entries, 316 targets, 503 slugs, pytest 80 passed
  (re-run by the orchestrator). Vegetarian = explicit_meat only (D15/R7), and No red meat is strict (R8).

## Risk
/home/user/recipe-data dies when the container is reclaimed. corpus.db needs durable storage
(a Release asset has no upload tool here, so decide at S1's end).

## Demo
Demo 1 is a private artifact at https://claude.ai/artifact/FH5WscMtqy8de1y7ogSfxR. Rebuild with VITE_CORPUS_DB_URL=assets/databases/corpus-db.bin.wasm
--base=./ and inline the CSS (the host does not serve .db files).

## Mapping (§4)
strong=opus, mid=sonnet, cheap=haiku, top=fable. The orchestrator runs on strong.

