# Brief S7c: make the grocery list shoppable (ingest taxonomy + app)
From the orchestrator. The S7 list, verbatim from the screenshot (app/e2e/screens/list-412x915.png):
"soy sauce ¾", "bean sprouts ¾", "cilantro ¾", "garlic 3.8 g", "carrot 46 g", "lemon juice 2¼",
and ~20 real ingredients (rice, chicken, onion, cabbage...) moved to "Check these" only because
the recipe gave no quantity. A person cannot shop from that. Owner, verbatim: "it'll tell me what
else i need to get, and I can tick off as I am at the grocery store".
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/taxonomy/` (new optional fields only)
and `app/` (grocery feature). Read orch/reports/S7.md first.
Model: strong. Effort: high.

Deliverable:
1 Diagnose the unit-less amounts ("¾"): find where the unit was lost, fix it, and add a test.
2 Taxonomy purchase fields (optional, for the ~300 most frequent slugs in corpus recipes):
  - `buy_as`: the slug you actually buy (lemon_juice → lemon, garlic_clove → garlic, egg_yolk → egg,
    fresh herb leaves → a bunch)
  - `yield`: how much one purchase unit gives (1 lemon gives 45 ml juice; 1 head of garlic gives 10
    cloves; 1 bunch of cilantro gives 1 cup of leaves)
  - `shop_unit`: what the shopper sees (piece, bunch, head, g, ml, can, bottle, pack)
  Keep the taxonomy validator green and add a test for the new fields.
3 App list lines in shop units, rounded up to what you can buy:
  - "garlic 1 head (need 3 cloves)", "carrots 1 (46 g)", "lemons 2 (need 90 ml juice)",
    "cilantro 1 bunch"
  - Pantry liquids and condiments (soy sauce) show "check you have some", unless the amount is large
  - Each line shows its source recipes when tapped
4 A missing quantity is not "Check these". The item still goes on the list in its aisle, marked
  "amount: see recipe". "Check these" is only for lines with no recognisable ingredient.
5 Tests: update the aggregation tests, and add the cases above. Regenerate the list screenshot
  and report the same 3-recipe list verbatim, before and after.
Checks: ingest pytest and validators, app scripts/check.sh, and e2e (set PW_PORT if running beside
another suite). Report per §6.
