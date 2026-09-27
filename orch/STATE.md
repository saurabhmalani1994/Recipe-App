# State (what is true now)

Updated: 2026-09-27
Branch: `claude/funny-thompson-jcmpox` (the only branch; the repo started empty)
Commit identity: saurabhmalani1994 <saurabhmalani1994@users.noreply.github.com> (D10)

## Phase
Scoping is done. `docs/PRODUCT.md` v1 is DRAFT and waiting on the owner's approval, plus an
optional Codex review (`reviews/01-product-codex-brief.md`). No product code yet.

## Blockers
- Network: this container reaches registry.npmjs.org (200). allrecipes, bbcgoodfood, foodwishes,
  huggingface and kaggle time out (000), github.com gives 403, and fdc.nal.usda.gov times out.
  Probed with curl on 2026-09-27. Ingest of real data is blocked until the owner widens network
  access. Parser and tagger work proceeds on fixtures.

## Mapping (§4)
strong=opus, mid=sonnet, cheap=haiku, top=fable. The orchestrator runs on strong.

## Next on approval
Queue rows S2, S3 and S4 are READY and start in parallel (two packages: app, ingest).
