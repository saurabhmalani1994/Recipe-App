Builder ingest/subs, slice S4b. Hash: see the commit that adds this file, on branch
worktree-agent-a05aee5c59e20ecef (cut from b2d5bc4 = claude/funny-thompson-jcmpox). Nothing pushed.

- Changed:
  - `ingest/subs/ingredients.yaml`: added the `explicit_meat` flag (D15/R7) to the 46 slugs that
    are the protein itself (fillets, mince, bacon, canned tuna, anchovy, scallops, shrimp...) or
    a stock/broth/bouillon/fat named for an animal (chicken/beef/turkey stock and bouillon, fish
    stock, dashi, instant dashi, clam juice, lard, bacon fat, duck fat, schmaltz). Every existing
    flag is unchanged. Extended the header comment to document the new flag and why it excludes
    condiments and hidden-animal items.
  - `ingest/subs/validate.py`: `DIETS['vegetarian']` is now `('explicit_meat',)`. Added
    `DIETS['vegetarian_strict']` = the old rule (red_meat, poultry, fish, shellfish,
    animal_derived), kept in code for tests and a possible strict mode, plus a `PRESETS` tuple
    (`vegetarian`, `no_red_meat`) so `target_report`/`COVERAGE.md` only surface the two offered
    presets, not the strict one. `no_red_meat` is untouched (red_meat only, so it stays strict:
    beef stock, lard and gelatin all carry `red_meat` and are excluded). `NON_VEG`, which guards
    `hidden_animal`/`animal_derived` consistency on ingredient records, now reads from
    `vegetarian_strict` so that logic (unrelated to the diet preset) is unaffected.
  - `ingest/subs/test_subs.py`: rewrote the planted-trap tests (brief item 3). Worcestershire,
    oyster sauce and fish sauce are now asserted Vegetarian-OK (and still fail
    `vegetarian_strict`). Chicken stock, lard and anchovy fillets are asserted not Vegetarian.
    Parmigiano is asserted Vegetarian-OK (still fails strict, since DOP rennet is unchanged).
    Beef stock and gelatin are asserted not OK for No red meat; gelatin is now asserted
    Vegetarian-OK (D15: it's not the protein source) but still fails `vegetarian_strict`.
    `test_flags_are_computed_from_components_not_claims` swapped its fish-sauce trap for an
    anchovy-fillet one, since fish sauce alone no longer makes a mix non-vegetarian.
    80 tests total (was 75; +5 net after replacing/adding traps).
  - `ingest/subs/substitutions.yaml`: one note contradicted the new rule --
    `worcestershire_sauce__fish_sauce-apple_cider_vinegar`'s note said "not vegetarian"; changed
    to "vegetarian but not vegan" (fish sauce no longer sets `explicit_meat`). The phrase test
    (`test_text_claims_agree_with_computed_flags`) found no other contradiction: the six other
    "vegetarian" flavor/note mentions (bacon_fat/butter, dashi/kombu, dashi/shiitake,
    ground_beef/lentils, bacon/tempeh, chicken_breast/seitan, pork_shoulder/jackfruit) all use
    components with no meat-family flag at all, so they were already correct and untouched.
  - `ingest/subs/COVERAGE.md`: regenerated via `--coverage`; byte-identical to before. The
    condiment items that flipped to Vegetarian-OK (Worcestershire, fish/oyster sauce, gelatin,
    shrimp/anchovy paste) never were the *only* Vegetarian rescue for any target, so no target's
    aggregate Vegetarian-option boolean changed. Totals stay 310/316 Vegetarian, 313/316
    No-red-meat (no_red_meat logic untouched).
- Checks: `python3 ingest/subs/validate.py` -> "validate: 0 errors, 790 entries, 316 targets,
  503 slugs (0 unused), vegetarian option 310/316, no-red-meat option 313/316". pytest:
  80 passed, 0 failed, 0 skipped (0.6s). No typecheck/lint configured for this package.
- Judgement calls on `explicit_meat` (not spelled out verbatim in the brief):
  - `clam_juice` (stock, shellfish, animal_derived, hidden_animal "clams") -> set true. It's a
    stock literally named for the shellfish, same shape as fish_stock/beef_stock, not a hidden
    animal.
  - `katsuobushi` (pantry, fish, "Dried bonito") -> set true. It's dried bonito flakes used
    directly as a garnish/protein, not a condiment hiding the animal (unlike dashi's bonito,
    which is the same fish but already covered by the dashi/instant_dashi entries).
  All other true/false assignments (anchovy, bacon, chicken/beef/turkey stock and bouillon,
  lard, bacon fat, duck fat, schmaltz vs. oyster/fish/Worcestershire/shrimp/anchovy
  paste/gelatin/rennet cheeses) were named explicitly in the brief.
- Outside my package: `orch/reports/S4b.md` (this report, as ROLE.md requires). Nothing else.
- Design was wrong about: nothing material.
- Open: none.

Samples, verbatim from the diet-trap tests in test_subs.py:

```python
def test_worcestershire_is_vegetarian_ok_but_fails_strict():
    fl = ing_flags('worcestershire_sauce')
    assert v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert 'fish' in fl and 'explicit_meat' not in fl

def test_gelatin_is_vegetarian_ok_but_not_ok_for_no_red_meat():
    fl = ing_flags('gelatin')
    assert 'animal_derived' in fl and 'red_meat' in fl
    assert 'explicit_meat' not in fl
    assert v.diet_safe(fl, 'vegetarian'), 'D15: gelatin is a condiment-like trace, not the protein'
    assert not v.diet_safe(fl, 'vegetarian_strict')
    assert not v.diet_safe(fl, 'no_red_meat'), 'R8: No red meat stays strict'

def test_lard_is_not_vegetarian():
    fl = ing_flags('lard')
    assert 'explicit_meat' in fl
    assert not v.diet_safe(fl, 'vegetarian')
    assert not v.diet_safe(fl, 'no_red_meat')
```

The one changed note, verbatim (`worcestershire_sauce__fish_sauce-apple_cider_vinegar`):
before: `"Add a pinch of sugar; not vegetarian"`, after:
`"Add a pinch of sugar; vegetarian but not vegan"`.
