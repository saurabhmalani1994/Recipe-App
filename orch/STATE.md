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
S1 (ingest fetch, sonnet) runs in its own worktree. The orchestrator merges and pushes.

## Done
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

