# Brief S4b: Vegetarian means "the protein source" (owner ruling D15)
From the orchestrator. Owner, verbatim (D15): "anything that is not explicitly meat is fine for
vegetarian, even stuff like oyster sauce of worsterchire sauce is fine, its mostly about the
protein source". Rulings R7 and R8 in docs/DECISIONS.md: read those two rows only.
Base: claude/funny-thompson-jcmpox (current HEAD). Scope: `ingest/subs/` only.
Model: mid. Effort: medium.

Deliverable:
1 Add one flag, `explicit_meat`, to ingredients.yaml. It is true for meat, poultry, fish and
  shellfish as a protein (fillets, mince, bacon, anchovy fillets, canned tuna...) and for stocks,
  broths, bouillon and fats named for an animal (chicken stock, beef stock, dashi with bonito,
  lard, suet, schmaltz, bacon fat). It is false for condiments and hidden-animal items: oyster
  sauce, fish sauce, Worcestershire, shrimp paste, anchovy paste, XO sauce, gelatin, and rennet
  cheeses. Keep every existing flag unchanged.
2 In validate.py, `DIETS` becomes: Vegetarian excludes `explicit_meat` only. No red meat is
  unchanged and stays strict (red_meat, which includes gelatin, lard and beef stock).
  Keep a `vegetarian_strict` diet, the old rule, in code and in tests, but not as a preset.
3 Rewrite the tests to match:
  - Worcestershire, oyster sauce and fish sauce are now Vegetarian-OK.
  - Chicken stock, lard and anchovy fillets are not Vegetarian.
  - Beef stock and gelatin are not OK for No red meat.
  - Parmigiano is Vegetarian-OK.
  - The vegetarian_strict traps keep their old results.
  Update note and flavor phrases that now contradict the computed flags; the phrase test
  enforces this.
4 Regenerate COVERAGE.md.
Out of scope: anything outside ingest/subs.
Checks: validator 0 errors, pytest counts. Report per ORCHESTRATION §6, with the list of slugs
where explicit_meat was a judgement call.
