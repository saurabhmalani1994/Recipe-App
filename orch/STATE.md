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
S3 (parser + taxonomy, opus, high) runs in a worktree. A BBC Good Food crawl resumes in a background script.

## Done
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

