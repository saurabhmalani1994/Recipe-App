# Brief S16: "ingredients I avoid" (app)
From the orchestrator. Ruling R15, from the owner's D17 (verbatim): "many of the apps felt very southern or mid
western, using things like cool whip or sour cream for lots of the recipes, which is not my style."
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only. Do not edit generated corpus types
or fixture.db (S10 regenerates them).
Model: mid. Effort: medium.

Deliverable:
1 Settings: an "Ingredients I avoid" list with type-ahead over slugs.json (synonyms work, and a
  parent slug covers its children, so "sour cream" covers its varieties). There is also a
  per-item mode: "hide recipes with it" or "rank them lower". Stored in user.db (a migration).
2 Apply it everywhere recipes are suggested: Cook results (the engine and Mine), the Home rows,
  and Surprise me. Hidden recipes are counted in a small note ("12 hidden: sour cream"), never
  dropped silently (rule 11). A lower-ranked recipe drops one coverage band per avoided
  ingredient.
3 The recipe detail marks an avoided ingredient line and shows its best swap from the
  substitutions table.
4 Tests: unit tests for hide and lower-rank, parent coverage and the note counts. Add an e2e
  walk with PW_PORT=4320.
Checks: scripts/check.sh and the e2e count. Report per §6.
