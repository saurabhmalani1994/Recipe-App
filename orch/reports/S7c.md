Builder ingest/taxonomy + app, slice S7c (shoppable grocery list). Hash: the commit that adds
this file, on branch worktree-agent-a202fffddcea2254e (cut from b07dc10 =
claude/funny-thompson-jcmpox HEAD). Nothing pushed.

- Diagnosis (#1), from reading the source data and the code, then tested: the unit is lost before
  the parser ever sees it. The Food.com mirror (`ingest/fetch/fetch_foodcom.py`) has
  `RecipeIngredientQuantities` ("3") and `RecipeIngredientParts` ("lemon juice") and **no unit
  column at all**, so the fetcher writes "3 lemon juice". The parser then gives every bare number
  the unit `piece` (parser.py:490, as documented), and the app printed a piece with no label
  (`unitLabel('piece')` is ''), so 3 × 0.75 became "lemon juice 2¼". Scale in corpus_sample.db:
  foodcom has 446 recipes and 3,511 lines; 1,112 of its 1,133 lines that have a quantity are
  `piece`, and **299 of the 446 recipes have no quantity on any line**. That second count comes
  from the same fetcher: when the two columns differ in length (e.g. nasi goreng: 17 quantities,
  15 parts) it drops every quantity, which is why rice, chicken, onion... showed "no quantity
  given". I did not recover the units: they do not exist in this dataset, and the fetcher and
  parser are outside this slice (see Open).
- Fix (in scope, `app/`): `recipeLookup.ts` marks Food.com lines with a bare `piece` as
  `unitStripped` (`sourceHasNoUnits`). `aggregate.ts` `trustsBareCount` believes a bare count only
  for something you count (has `each_g`, is bought by the piece, or its yield is counted). For
  unit-stripped lines it also refuses buy_as slugs, since "3 lemon juice" is not three lemons.
  The failing input, verbatim, is a unit test ("unit-less amounts: the ¾ bug") that asserts no
  line ends in a bare fraction. The e2e test also asserts no "¾" is on screen.
- Taxonomy (#2): `buy_as`, `shop_unit`, `yield` added as optional fields on 296 of the 300 slugs
  used by the most corpus_sample.db recipes. The other four are water, ice, cooking_spray and
  nonfood_item, which nobody shops for. Shop units: piece, bunch, head, g, ml, can, bottle, pack,
  plus **jar**, which the brief did not list; I added it for spices and condiments.
  `taxonomy.py` validates the fields:
  - the unit is from the list;
  - bunch, head, can, bottle, jar and pack need a yield;
  - g and ml take no yield;
  - a buy_as target must exist, have the same shop_unit, and not have a buy_as of its own (one
    hop);
  - a buy_as slug needs a yield.
  New tests: 6 brief examples, coverage ≥290, 10 error cases, one-hop, one valid record. The
  header of ingredients.yaml documents the fields. `app/scripts/gen_slugs.py` exports them to
  `slugs.json` as `shopUnit`, `yield` and `buyAs`.
- App (#3, #4): lines are grouped by the slug you buy and rounded up to shop units, with a 5%
  slack, so 227 g from a 225 g pack is one pack. Examples:
  - "garlic 1 head (need 3 cloves)"
  - "carrot 1 (46 g)"
  - "lemons 2 (need 90 ml juice)"
  - "cilantro 1 bunch (need 2 tbsp)"
  - "ground beef 500 g": meat is rounded up to 50 g steps
  - pantry bottles, jars and packs in the pantry, spices, international and beverages aisles
    read "check you have some (need 1 tbsp)" below half a unit, and "1 bottle (need 200 ml)"
    from half a unit up.

  A missing or unusable amount keeps the item in its aisle as "amount: see recipe" (or
  "+ more, see recipe"). "Check these" now holds only lines with no slug. Each line has an
  "n recipes" button that shows its source recipes when tapped. user.db migration v4 adds
  `grocery_items.display_name` ("lemons") and `.sources` (JSON). Staples and kitchen items are
  still left off, and a message now names them.
- Checks:
  - ingest pytest: 322 passed / 0 failed
  - taxonomy validator: 0 errors (1,554 slugs, 296 with a shop_unit)
  - subs validator: 0 errors
  - app `scripts/check.sh`: typecheck pass, lint pass (0 errors; 3 warnings, already there, in
    src/state/diet.tsx), unit tests 112 passed / 0 failed / 1 skipped (19 files)
  - e2e (PW_PORT=4290, full suite): 26 passed / 0 failed. `plan.spec.ts` now also checks the
    shop amounts, "see recipe", "check you have some", the absence of "¾", "Check these" = only
    the lines with no slug, the "left off" message, and tapping sources open and closed.
- The 3-recipe list, verbatim (fixture.db, "This week", metric, 2 people × 1.5 → 0.75x).
  Before (S7, `e2e/screens/list-412x915.png` at b07dc10):
  ```
  Pantry     soy sauce ¾
  Produce    bean sprouts ¾ | carrot 46 g | cilantro ¾ | garlic 3.8 g | lemon juice 2¼ | mango 150 g
  Check These  trassi oedang, curcumae (no canonical ingredient matched); rice, bacon, chicken,
             onion, onion, clove garlic, carrot, carrot, cabbage, water, leek, kecap manis, cumin,
             sambal oelek, salt, salt, cauliflower, celery, mayonnaise, curry powder, ginger,
             cheddar, butter (no quantity given)
  ```
  After (`e2e/screens/list-412x915.txt`, written by the e2e run; screenshots
  `list-412x915.png` and `list-produce-412x915.png`):
  ```
  Left off 4 you already have: butter, salt, sugar, water.
  Dairy    cheddar         amount: see recipe                        1 recipe
  Meat     bacon           amount: see recipe                        1 recipe
           chicken         amount: see recipe                        1 recipe
  Pantry   kecap manis     amount: see recipe                        1 recipe
           mayonnaise      check you have some                       1 recipe
           rice            check you have some                       1 recipe
           sambal oelek    amount: see recipe                        1 recipe
           soy sauce       check you have some                       1 recipe
  Produce  bean sprouts    amount: see recipe                        1 recipe
           cabbage         amount: see recipe                        1 recipe
           carrot          1 (46 g + more, see recipe)               3 recipes
           cauliflower     amount: see recipe                        1 recipe
           celery          amount: see recipe                        1 recipe
           cilantro        amount: see recipe                        1 recipe
           garlic          1 head (need 1 clove + more, see recipe)  2 recipes
           ginger          amount: see recipe                        1 recipe
           leek            amount: see recipe                        1 recipe
           lemon           amount: see recipe                        1 recipe
           mango           1 (150 g)                                 1 recipe
           onion           amount: see recipe                        2 recipes
  Spices   cumin           check you have some                       1 recipe
           curry powder    check you have some                       1 recipe
  Check These  trassi oedang, curcumae   no canonical ingredient matched
  ```
  Most lines read "see recipe" because the source recipes have no quantities, not because of a
  bug here (see Diagnosis). This list is now honest about that, but it is still thin.
- Outside my package: none. I touched only `ingest/taxonomy/` and `app/`.
- Design was wrong about: (1) "find where the unit was lost, fix it". It was never in the data,
  so no fix inside ingest/taxonomy or app can restore it. What I could fix is the app treating
  the parser's default `piece` as a real count. (2) The brief's "cilantro 1 bunch" example has no
  "need" note. I kept one on every sized unit ("1 bunch (need 2 tbsp)") so 3 cups of cilantro
  visibly becomes 3 bunches. (3) "~20 real ingredients ... only because the recipe gave no
  quantity": the quantities were in the source, and our fetcher threw them away on a
  column-length mismatch.
- Open: Food.com's quantities cannot be used as they are ingested: in 299 of 446 recipes every
  quantity was dropped, and in almost all the rest the units are stripped. My recommendation is
  a small ingest slice (fetch + build owners) that does one of two things:
  - recover the full ingredient lines. RecipeNLG carries www.food.com pages with full lines,
    units included: I checked this by grep (row 957739, for example), but I did not measure how
    many of our 446 recipes are in it;
  - or tag Food.com quantities as unit-less in corpus.db, so the app does not have to key on the
    `foodcom:` prefix.

  The next move is the owner's.
