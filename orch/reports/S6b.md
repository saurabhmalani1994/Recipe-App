Builder app, slice S6b (Cook screen fixes from S6). Base: 8ff26b7 (claude/funny-thompson-jcmpox
HEAD, which already carried the S6 merge and D16). Worktree branch:
worktree-agent-a78668cde26560f37. Nothing pushed.

- Changed:
  - Flaky test (item 1): `state/diet.tsx`'s `setPreset` used to fire the settings write and
    forget it (`void updateSettings(...)`), and that write is a `postMessage` round trip to the
    OPFS worker (`db/opfsDb.ts`), not something that finishes in the same tick as the click. A
    reload right after tapping could land before the round trip completed. Fix: `setPreset` now
    also writes the choice into a small synchronous `localStorage` cache
    (`recipe-app.diet-preset-cache`) before returning; `DietProvider`'s initial state reads that
    cache (not the default) whenever it exists, and only trusts `user.db`'s value when there was
    no cache to read. `user.db` stays the durable, queryable store (backup/export, native, the
    engine); the cache is a same-tab fast path in front of it, not a replacement — noted in the
    file for whoever builds backup restore, since `importUserDb` writes `user.db` directly and
    should clear this cache too.
  - Equipment list (item 2): `data/equipment.ts`'s `KITCHEN_EQUIPMENT` is now
    `EQUIPMENT_VALUES` from `corpus/types.ts` (the `recipe_equipment.equipment` CHECK enum,
    `schema/corpus.sql`) instead of a hand-copied 22-item list, so it cannot drift from the
    corpus again. Added labels for the 9 it was missing (toaster, toaster_oven, sous_vide,
    waffle_iron, bread_machine, dehydrator, campfire, steamer, ice_cream_maker). Settings now
    lists 31 equipment items, up from 22 (its screenshot changed accordingly).
  - Cook screen readability (item 3): staples (`is_staple` plus the 8 `PANTRY_DEFAULT_SLUGS`)
    collapse into one "+ pantry basics (N)" chip in "what you have", expandable to individual
    removable chips; non-staple items (e.g. a newly added "soy sauce") are unaffected and still
    shown directly. `missingSummary` now caps at 3 names then "+N more" instead of spelling out
    an arbitrarily long ingredient list. A result whose diet status is `adaptable` gets a small
    line under it, e.g. "veg: swap chicken → tofu" (or "no red meat: …"), read off
    `result.diet.swaps[0]`; it only appears when a diet filter is active, since the engine only
    returns `diet` for the selected preset (D16: main-protein swaps count as adaptable).
  - Ranking floor (item 4, `features/cook/engine.ts`): a new `compareRanked` replaces raw
    coverage-first sorting. A floor stops a recipe covering fewer than 3 non-staple ingredients
    from ever outranking one that covers more, regardless of percentage; short of that, coverage
    is banded into 10-percentage-point steps and ties inside a band go to covered count, then
    quality. The old comparator is kept as `compareLegacy`, selected by the exported
    `RANK_LEGACY` constant (default `false`) so the owner-graded top-10 comparison this brief
    asks for later can flip back to the pre-floor ordering on the same data.
    Before/after on the planted kitchens (fixture.db, verified by dumping actual
    covered/needed/coverage/quality for each):
    - K1 (Pad Thai minus fish sauce), no diet filter: before, position 2 (right after Pad Thai)
      was the margarita at 2/4 (50%), ahead of two 3/8 (37.5%) salads and everything else below
      it. After: `themealdb:52953` (5/15, 33%), `recipenlg:1470870` (4/12, 33%), the two salads
      (3/8 each), and `themealdb:53368` (5/17, 29%) all rank ahead of the margarita — every one
      of them covers more non-staple ingredients than its 2, so the floor keeps it behind all of
      them even though its own percentage is higher than several.
    - K1, Vegetarian: before, the margarita (2/4) led (Pad Thai drops for diet). After,
      `recipenlg:1470870` (4/12) leads — it covers more.
    - K1, "use only" the oven (6 candidates): before, `recipenlg:636138` (1/7, 14.3%) led over
      `foodwishes:fresh-corn-sausage-muffins-twelve` (2/15, 13.3%) purely on percentage; after,
      the muffins (2 covered) lead, both being in the same 10-30% band.
    - K2 (exactly Kidney Bean Curry), Indian: before, `themealdb:52807` (2/8, 25%) took 3rd on a
      quality tiebreak against band-mates covering more; after, `themealdb:52805` (4/19, 21%)
      takes 3rd, since 21% and 25% land in the same 20-29% band and it covers more.
    - K2, any cuisine (135 candidates): before, `recipenlg:1271214`, a 1/1 "Un-Stuffed Cabbage
      Casserole" at 100% coverage, tied the 10/10 curry's coverage band and only lost 1st on a
      quality tiebreak that happened to go the right way (flagged in `orch/reports/S6.md`,
      "Open" — "ties the 10/10 curry at 100%"). After: it falls to position 66 of 135, behind
      every candidate covering 2 or more, on the floor rather than by accident.
    `engine.test.ts`'s planted-kitchen expectations were updated to the new (verified) order;
    every other assertion (candidate counts, filters, substitutions, invariants, latency) is
    unchanged.
- Checks:
  - `scripts/check.sh`: typecheck=pass lint=pass unit_passed=68 unit_failed=0 (same 3 pre-existing
    react-refresh warnings in `state/diet.tsx` as before this slice; `prettier --check .` is
    clean).
  - e2e: 25 passed (unchanged count; `e2e/cook.spec.ts`'s walk and the layout/no-scroll checks
    all still pass with the new "pantry basics" chip and the wider equipment list).
  - The repeat run this brief calls for: `playwright test e2e/smoke.spec.ts -g "keeps the diet
    switch persisted across a reload" --repeat-each=10`, run twice, 20 of 20 passed (10/10 and
    10/10; previously about 1 in 3 failed).
- Outside my package: `orch/reports/S6b.md` (this report). Everything else is under `app/`.
- Design was wrong about: nothing — the brief's own examples (margarita/salads on K1, the
  casserole/curry tie on K2) matched the fixture data once dumped; no surprises in the corpus
  itself for this slice.
- Open:
  - The floor (`covered < 3` may not be outranked by a bigger covered count) is a blanket rule,
    not scoped to "within a band": a recipe at 2/2 (100%) can now rank behind one at 3/40 (7.5%).
    That is what the brief's wording says, and it is what fixes the K2 casserole/curry case, but
    it is a strong rule; the owner-graded comparison this brief flags for later is the place to
    confirm it does not over-correct on real (non-planted) kitchens.
  - Backup restore (`db/backup.ts`'s `importUserDb`) does not yet clear the new diet-preset
    cache; there is no restore UI to wire it into yet (noted in `state/diet.tsx`). Whoever builds
    that UI should call `localStorage.removeItem('recipe-app.diet-preset-cache')` (or route the
    restored value back through `setPreset`) right after a restore.
  - Native (Capacitor) was not re-verified for this slice; item 1's fix is web/OPFS-specific
    (`localStorage` is available in a Capacitor WebView too, but the native path doesn't hit the
    same worker round trip in the first place, per `orch/reports/S6.md`'s "not run" note, which
    still stands).
