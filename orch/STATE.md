# State (what is true now)

Updated: 2026-09-27
Branch: `claude/funny-thompson-jcmpox` (the only branch; the repo started empty)
Commit identity: saurabhmalani1994 <saurabhmalani1994@users.noreply.github.com> (D10)

## Phase
Scoping is done. `docs/PRODUCT.md` v1 is DRAFT and waiting on the owner's approval, plus an
optional Codex review (`reviews/01-product-codex-brief.md`). No product code yet.

## Network (re-probed 2026-09-27 after the owner set it to full)
bbcgoodfood 200, foodwishes 200, huggingface 200, kaggle 200, fdc.nal.usda.gov 200.
`git clone` and raw.githubusercontent work, but github.com HTML, the API and codeload give 403.
allrecipes gives 402 even with a browser UA (bot wall), so S1 tries headless Chromium.

## Owner silence on 3 defaults (applied): metric default, no hosted PWA, start builds now.

## Running
S8 curation (opus), S6b (app, sonnet) and S7 planner/grocery (app, sonnet) run in worktrees. The app lane is free until corpus schema S9. The app lane is free (S7b READY; S6 waits on corpus schema S9). The full BBC crawl runs as a background
script (cap 20000, 6h timeout; log in /home/user/recipe-data/bbc_full_crawl.log).
Owner questions pending: Kaggle token (default: no ratings source), and location for seasonality (default: temperate north).

## Done
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

## Mapping (§4)
strong=opus, mid=sonnet, cheap=haiku, top=fable. The orchestrator runs on strong.

