# Brief S20: swap choice and vegetarian ordering (app)
From the orchestrator. Two findings:
(a) orch/reports/S18.md: for shrimp the app now shows "hearts of palm" over "scallops", because the
    ancestor swap shellfish__hearts_of_palm ties shrimp__scallops on quality and wins the id tiebreak.
(b) Under D16, 92% of the corpus is vegetarian ok or adaptable, so the Vegetarian filter barely narrows.
    Ruling R19: under a diet preset, "ok" recipes rank above "adaptable" ones within a coverage band.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only.
Model: mid. Effort: medium.

Deliverable:
1 Swap ranking everywhere the app picks a "best swap" (detail lines, the Cook missing list, the avoid
  list): prefer an exact-slug substitution over an ancestor one at equal quality. Under the
  Everything preset, prefer a swap that keeps the dish's diet character (a seafood swap for
  seafood) over a diet-changing one. Under a diet preset, prefer the swap that satisfies the
  diet. Tests for all three cases, including shrimp → scallops under Everything and shrimp →
  hearts of palm under Vegetarian.
2 R19 in the engine comparator, with a test.
3 Update avoid.spec.ts back to the intended swap if the rule changes it, and keep everything green.
Checks: scripts/check.sh, and e2e with PW_PORT=4322. Report per §6.
