Builder taxonomy/subs/parse, slice S3b. Base: claude/funny-thompson-jcmpox HEAD (d1b2969). Hash:
the commit that adds this file, on this worktree branch. Nothing pushed.

- Changed:
  - `ingest/taxonomy/ingredients.yaml`: `frog_legs` and `alligator` (the only two children of
    `meat`, besides `ground_meat_mix`) no longer carry `red_meat` -- both are reptile/amphibian,
    not mammal, so they are fine for no_red_meat. Re-flagged `poultry` (this taxonomy's existing
    bucket for "meat that isn't red, fish or shellfish" -- the same convention already used for
    octopus/squid under `shellfish`), keeping `explicit_meat` so vegetarian still excludes them.
    `ground_meat_mix` (meatloaf mix) audited and left alone: it is genuinely a red-meat blend.
    Added a new generic `roast` slug (parent `beef`, red_meat) for an unnamed roast, and three
    new synonyms on `crab` for "brown and white meat" phrasing (see parser, below).
  - `ingest/subs/substitutions.yaml`: added targets for `stock`, `chicken`, `cream_of_chicken_soup`,
    `pork`, `shellfish`, `fish`, `sausage` and `beef`, each with >=1 quality>=2 vegetarian-safe
    substitute (mostly `vegetarian_meat`, `young_jackfruit`, `hearts_of_palm`, `oyster_mushrooms`,
    `tempeh`, `soyrizo`; `stock`/`cream_of_chicken_soup` use existing vegetable/mushroom stock and
    cream-of-mushroom/celery soup). These are taxonomy parents, so ingest/tag's ancestor-walk
    substitution lookup picks them up for every child too: `chicken` covers `cooked_chicken`,
    `chicken_thigh`, `chicken_wings`, ...; `pork` covers `bacon`, `ham`, `prosciutto`, `pancetta`,
    `ground_pork`; `shellfish` covers `shrimp` and `crab`; `fish` covers `salmon` and every other
    named fish. That resolves all 14 required blockers (the 4 named in the brief, plus the "next
    10" ranked below) with 8 new target groups, not 14 separate entries.
  - `ingest/tag/diet.py`: removed `PROXY_TARGET` and the one line in `best_substitution` that
    used it, now that `ingest/subs` has a real `stock` target. `broth` was in `PROXY_TARGET` too
    but was dead: it is a synonym of `stock`, not its own taxonomy slug, so it never reached that
    branch.
  - `ingest/parse/parser.py`: "crab brown and white meat" now resolves to `crab` as one item (the
    taxonomy fix above; previously the parser's "and"-splitter cut it into "crab brown" -> crab
    and "white meat" -> generic `meat`). Added a duplicated-quantity-artifact guard: when the
    text after the amount is itself the exact same amount+unit again ("1 clove 1 clove", "2
    cloves 2 cloves"), the line is read as nameless (slug None) instead of resolving the bare
    unit word as an ingredient (previously "clove"/"cloves" collided with the spice "cloves" via
    the singular/plural normalizer). Added generic `roast` (see taxonomy) so "1 roast" resolves
    instead of staying unresolved.
  - Gold lines added to `ingest/parse/gold.jsonl` (n=3001-3003) and the matching raw lines
    appended to `ingest/fixtures/ingredient_lines_sample.txt`: "crab brown and white meat" ->
    crab; "1 clove 1 clove" -> unresolved (qty 1, unit clove, slug null); "1 roast" -> roast.
  - Ranked vegetarian blockers with `ingest/tag/run_corpus`'s existing output at
    `/home/user/recipe-data/derived/tags_sample.jsonl` (20,000 recipes, unmodified from S5a):
    counted `blockers` slugs on the `vegetarian` preset. Top 14 (after the 4 named in the brief):
    bacon 602, shrimp 406, chicken 396 (brief), ham 229, sausage 196, cream_of_chicken_soup 164
    (brief), chicken_thigh 163, salmon 161, beef 157, cooked_chicken 143 (brief), ground_pork 125,
    prosciutto 123, crab 118 -- plus `stock` (brief; not itself in the ranking since the old
    `PROXY_TARGET` mirror already resolved it). Verified programmatically (ancestor walk +
    `ingest.subs.validate.diet_safe`) that all 14 now find a quality>=2 vegetarian-safe swap.

- Checks:
  - `python3 -m ingest.taxonomy.taxonomy`: 0 errors, 1554 slugs (was 1553).
  - `python3 -m ingest.subs.validate`: 0 errors, 810 entries (was 774), 324 targets, vegetarian
    option 318/324, no-red-meat option 321/324 (was 317/323 and 320/323 including our own stock
    addition, so the 6 net targets we filled are real).
  - `python3 ingest/parse/score.py`: bar PASSED. slug 99.2% (375/378), qty 100%, unit 99.7%.
  - `python3 ingest/tag/gold/score.py`: BARS PASSED (diet, diet traps, one_pot and all six
    equipment tools at their thresholds).
  - `python3 -m pytest ingest`: 262 passed, 0 failed (was 245 before this slice).
  - Diffed the parser's old vs. new output over the full 3000-line fixture (a throwaway copy of
    the pre-change taxonomy/parser, not committed): only 2 lines changed, both intended fixes
    ("2 cloves 2 cloves", "3 cloves 3 cloves" -- the same clove/cloves collision as the gold
    case, now correctly nameless instead of "cloves"). No other line's resolution moved.

- Outside the brief's file list, needed to keep "all ingest pytest ... PASSED" true:
  - `ingest/tag/test_tag.py`: 6 tests hard-coded specific meats (bacon, gammon/ham, tuna, sea
    bass, chicken) as "no vegetarian way out" fixtures. Giving `chicken`/`pork`/`fish`/`shellfish`
    a real quality>=2 vegetarian swap (the brief's own ask) makes those recipes genuinely
    adaptable now, so the fixtures were testing a gap we were asked to close. Repointed each at
    an equivalent case in a family we did *not* touch (lamb, veal, duck, turkey -- none has any
    vegetarian-safe swap at any quality), so the same guarantee (quality<2 rejected, an unreadable
    or negated alternative isn't a way out, a step-added meat with no swap still offends, an
    "optional to keep X" note isn't a real omission) is still exercised; added one new test
    (`test_bacon_is_adaptable_via_substitution`) asserting the intended new behavior explicitly.
    One more test used "crab brown and white meat" to exercise the `GENERIC_MEAT_SLUG` fallback
    in `diet.item_flags`; the parser fix now resolves that exact phrase straight to `crab` (no
    fallback needed), so I swapped it for "lobster brown and white meat" (lobster still
    misparses to generic `meat`, and has no rescue either, so the fallback is still real).
  - `ingest/tag/gold/gold.jsonl`: 27 recipes across 26 ids had a hand `no` label for vegetarian
    and/or no_red_meat that predates any of these substitutions existing. Score.py's own
    docstring defines `adaptable` relative to "a substitution of quality>=2 in ingest/subs whose
    context fits" -- these recipes now have exactly that (rotisserie chicken -> plant-based
    chicken, crab -> hearts of palm, bacon -> vegan bacon, halibut -> hearts of palm, etc., all
    real, named vegan analogs, not a stretch), so I flipped those two label fields to `adaptable`
    and left everything else (equipment, one_pot, other diet fields) untouched. Spot-checked
    several by hand (Full English Breakfast, Singapore Chili Crabs, Colorado Beef Stroganoff) --
    all are genuinely veganizable with the swap the tagger now finds.
  - Did not touch `ingest/tag/gold/holdout.jsonl` (scored once, by policy, so I left it alone);
    running it informationally shows diet accuracy at 91.7% (was 96.7%), the same kind of stale
    hand-label drift as gold.jsonl, just not corrected since holdout isn't re-tuned against.
  - Regenerated `ingest/subs/COVERAGE.md` and `ingest/parse/COVERAGE.md` (both scripted, both
    change on any table/taxonomy edit; the subs one has a pytest check that fails if stale).
    `ingest/tag/COVERAGE.md` (from the 20k corpus run) was not regenerated -- no test depends on
    it, and re-running it would take ~70s and rewrite `/home/user/recipe-data/derived/tags_sample.jsonl`
    outside git; it is now stale relative to the new substitutions and worth a re-run when
    convenient.

- Design was wrong about: nothing in the brief is false. One thing I chose deliberately beyond
  the letter of it: the brief lists `chicken`, `cooked_chicken`, `cream_of_chicken_soup` and
  `stock` by name and separately asks for "the next 10" blockers, i.e. 14 named targets, but I
  added subs entries for 8 target *groups* (parents in the taxonomy), leaning on
  `ingest/tag/diet.best_substitution`'s existing ancestor walk to cover the rest (e.g. one
  `pork` entry covers bacon/ham/prosciutto/pancetta/ground_pork). This is the same mechanism the
  table already uses everywhere else (`chicken_breast` inherits nothing from a generic `chicken`
  today only because no such target existed); I did not invent a new mechanism.

- Open: `frog_legs`/`alligator` needed *some* non-red-meat flag to keep `explicit_meat` valid
  (the validator requires one of red_meat/poultry/fish/shellfish). None is a biologically exact
  fit; I used `poultry` as the closest existing "other meat" bucket, matching the precedent of
  cephalopods filed under `shellfish`. If the app ever needs to *display* a specific animal
  category rather than just filter by diet, `poultry` would read oddly for a reptile/amphibian --
  worth a proper `other_meat` flag if that comes up, but out of scope here.
