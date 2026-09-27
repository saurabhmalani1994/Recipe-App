Builder app, slice S7a. Base claude/funny-thompson-jcmpox HEAD, on worktree-agent-a1fb0a4886bbd0d9f.
Scope: `app/` only.

- Changed:
  - `user.db` migration v2 (`app/src/db/userSchema.ts`): `kitchen_equipment` table, plus
    pre-seeding `kitchen_items` with 8 pantry staple defaults (salt, black_pepper, neutral_oil,
    water, sugar, all_purpose_flour, butter, olive_oil).
  - Settings screen (`app/src/routes/Settings.tsx` + `app/src/features/settings/settingsRepo.ts`):
    people, servings_per_person, units, diet preset, "my kitchen has" equipment checklist
    (`app/src/data/equipment.ts`, the S5a brief's list minus the derived tags), and pantry
    staple tick/untick — all read/write through the `Db` layer. Diet preset moved off
    `localStorage` onto `settings.diet_preset` (`app/src/state/diet.tsx`), closing S2's open
    item 1.
  - Kitchen list (`app/src/routes/Kitchen.tsx`, `app/src/features/kitchen/kitchenRepo.ts`):
    add by type-ahead against `app/src/corpus/slugs.json` (1553 ingredients, generated from
    `ingest/taxonomy/ingredients.yaml` by `app/scripts/gen_slugs.py` / `npm run gen:slugs`;
    read-only import, `ingest` still owns the taxonomy file), search by name or any synonym,
    remove, grouped by aisle.
  - Favorites: star on the recipe detail (`app/src/routes/RecipeDetail.tsx`) and a favorites
    list (`app/src/routes/Favorites.tsx`), via `app/src/features/favorites/favoritesRepo.ts`.
  - My recipes (`app/src/routes/MyRecipes.tsx`, `app/src/routes/MyRecipeEditor.tsx`,
    `app/src/features/myRecipes/*`): create/edit (title, servings, ingredient lines, steps,
    notes, cuisine, tags); "Make my version" forks a fixture recipe into `my_recipes` with
    `recipe_forks.parent_recipe_id`; the fork's editor shows a diff against the parent
    (ingredients added/removed/changed by quantity or unit, steps changed by position),
    recomputed on every save.
  - Recipe detail scaling (`app/src/features/scaling/scale.ts`): target servings =
    `ceil(people * servings_per_person)` (2 x 1.5 = 3, per D11's "1.5 servings worth per
    person", rounded up to the recipe's own whole-serving unit), ingredient quantities scaled
    by that ratio. Units toggle is wired to `settings.units` and the recipe detail UI, but does
    not convert numbers yet — the metric/US conversion tables arrive with the corpus (out of
    scope here, and documented as such in `scale.ts`).
  - `app/src/db/persistence.ts` (new, not in the brief but required to make any of the above
    survive a reload): `WebDb` is `:memory:`, so the web build had no durable storage at all.
    Added a `localStorage` JSON-snapshot wrapper around `user.db` (reusing the existing
    backup format) that persists after every write and rehydrates on open; native is
    untouched (`CapacitorDb` already writes a real file). Flagged as interim in a code comment;
    replace once a persistent web VFS (OPFS) lands.
- Checks: `scripts/check.sh` → `typecheck=pass lint=pass unit_passed=33 unit_failed=0` (11 test
  files, 0 skipped). Lint: 0 errors, 3 pre-existing non-blocking `react-refresh` warnings
  (unchanged from S2). e2e: 2 passed, 0 failed — the original smoke walk plus a new S7a walk
  (set diet in Settings, add "cilantro" via the synonym "dhania", favorite Weeknight Chana
  Masala, fork it, edit an ingredient quantity, see the diff, reload, and recheck all four).
  Screenshots at 412x915 in `app/e2e/screens/`: `home`, `settings`, `kitchen`,
  `recipe-detail`, `my-recipe-fork-diff`.
- Outside my package: none.
- Design was wrong about: the S2-era schema didn't need a change for pantry staples — "staples
  are pre-seeded" (docs/PRODUCT.md #7) turned out to just mean pre-seeded rows in the existing
  `kitchen_items` table, not a separate settings column; only "my kitchen has" equipment needed
  a new table (`kitchen_equipment`, migration v2).
- Open:
  1. The `localStorage`-snapshot persistence in `app/src/db/persistence.ts` is a stand-in for a
     real persistent web sqlite file (OPFS). It works and is tested, but it re-exports the
     *entire* `user.db` as JSON on every single write, which won't scale once grocery
     lists/plans have real volume. Recommend replacing with `@sqlite.org/sqlite-wasm`'s OPFS
     VFS (needs a Worker + COOP/COEP) in a later slice, keeping the same `Db` interface so
     nothing above `db/index.ts` has to change.
  2. Units toggle on the recipe detail screen is UI-only (see above) — no numeric conversion
     until the corpus ships density/each-weight data.
  3. "Recipe not found" and empty-list states are handled but minimally styled; fine for this
     slice given the matching engine (which would drive real navigation into recipes) is out
     of scope.
