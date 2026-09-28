# Brief S7: weekly planner and grocery list (app)
From the orchestrator, release v0.2. Owner, verbatim: "Grocery list builder - I put in what groceries i
already have, what food i want to cook for the week for how many people, and it'll tell me what else
i need to get, and I can tick off as I am at the grocery store". Also D11 (1.5 servings per
person) and PRODUCT.md Features 5-7. Read schema/README.md and app/src/features/units/units.ts
(S6).
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only (Plan and List routes, a new
features/plan and features/grocery). Do not edit the Cook screen or the engine; S6b is working
there.
Model: mid. Effort: high.

Deliverable:
1 Plan: a week grid of 7 days x meal slots (lunch and dinner by default; a setting turns on
  breakfast). Add a recipe to a slot from recipe detail ("Add to plan"), from Cook results, or
  by searching favorites. Each entry has a people count (default settings.people). Entries can
  be moved and removed. There is a "this week / next week" switch. A "shares ingredients"
  hint links days that use the same perishable (fresh herbs, a half-used can, a bunch of
  coriander).
2 Grocery build from a date range:
  - Scale each entry to people x servings_per_person (D11) and aggregate by canonical slug.
  - Convert to one unit per slug, using the corpus units and density, and keep packages in
    counts ("2 x 400 g cans").
  - Subtract the kitchen list: items there are "have" and shown collapsed. Staples are always
    assumed.
  - Group by aisle.
  Unparseable lines are listed under "Check these" with their raw text, never dropped silently
  (rule 11).
3 Shopping mode: a big-tap checklist grouped by aisle. Ticked items drop to the bottom. It
  works offline. Buttons: "Add ticked to kitchen" and "Clear". Extra manual items are allowed
  (e.g. "paper towels"). The list persists in user.db (grocery_lists and grocery_items).
4 Tests:
  - Unit tests for aggregation, written with the expected lists first:
    - 2 recipes both using onion, as pieces and grams
    - cups of flour plus grams of flour
    - 1 can plus 400 g of tomatoes
    - a kitchen item subtracted
    - scaling 2 people x 1.5 on a 4-serving recipe
  - A Playwright walk: plan 3 recipes, build the list, tick 2 items, add them to the kitchen,
    reload, and check that it persists. Screenshots at 412x915; no horizontal scroll.
Checks: scripts/check.sh and the e2e count. Report per §6 plus one generated list verbatim.
