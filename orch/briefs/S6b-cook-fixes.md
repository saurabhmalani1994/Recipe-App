# Brief S6b: Cook screen fixes from S6 (app)
From the orchestrator. Read orch/reports/S6.md, "Checks", "Design was wrong about" and "Open".
Owner D16: main-protein swaps count as adaptable, so show them.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only.
Model: mid. Effort: medium.

Deliverable:
1 Flaky test: smoke "keeps the diet switch persisted across a reload" fails about 1 run in 3.
  The diet write is fire-and-forget. Make the settings write awaited, or flushed before
  unload, so a user who closes the app right after tapping keeps the choice. Prove it with 10
  runs of `--repeat-each=10` of that test, all passing.
2 Add the 9 corpus equipment values that "My kitchen has" is missing (toaster, toaster_oven,
  sous_vide, waffle_iron, bread_machine, dehydrator, campfire, steamer, ice_cream_maker). Better,
  derive the list from the corpus types (CHECK enum), so the two lists cannot drift apart.
3 Cook screen readability:
  - Staples (is_staple, plus pantry defaults) collapse into one "+ pantry basics (8)" chip that
    can be expanded.
  - The missing list shows at most 3 names, then "+N more".
  - A recipe whose diet status is adaptable shows a small "veg: swap chicken → tofu" line under
    Vegetarian or No red meat.
4 Ranking floor (report the before and after on the planted kitchens): a recipe with fewer than 3
  non-staple ingredients does not rank above one that covers more of what you have. Within a
  coverage band of 10 percentage points, rank by covered count, then quality. Keep the old
  ordering behind a constant, so the owner-graded comparison (later) can flip it.
Checks: scripts/check.sh, e2e count, and the repeat run. Report per §6.
