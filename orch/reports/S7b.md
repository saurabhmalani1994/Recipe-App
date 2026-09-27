Builder app, slice S7b. Base claude/funny-thompson-jcmpox HEAD, on worktree-agent-a87d33c96ca9d1c23.
Scope: `app/` only.

- Changed:
  - **Layout / no horizontal scroll** (`app/src/index.css`, `app/src/routes/MyRecipeEditor.tsx`):
    `html, body` get `max-width: 100%; overflow-x: hidden` as a backstop. The My Recipe editor's
    ingredient row (`.editor-ingredient-row`) is now a CSS grid — `4ch 6ch 1fr 44px` (qty, unit,
    name, remove) — instead of an unconstrained flex row, so the name field no longer gets
    pushed off-screen. Steps (`.editor-step-row`) switched from a single-line `<input>` to a
    full-width, resizable `<textarea>` with the remove button on its own row below. New e2e
    check, `app/e2e/layout.spec.ts`: for every route (`/`, `/cook`, `/plan`, `/list`,
    `/my-recipes`, `/my-recipes/new`, `/favorites`, `/kitchen`, `/settings`, `/recipe/r07`) at
    both 360px and 412px, it asserts `document.documentElement.scrollWidth <=
    document.documentElement.clientWidth`, and screenshots each route at 412x915 into
    `app/e2e/screens/route-<name>-412x915.png` (20 route × width combinations, all pass).
  - **Durable web persistence** (`app/src/db/opfsDb.ts`, `app/src/db/opfsWorker.ts`,
    `app/src/db/persistence.ts`, `app/src/db/index.ts`): `persistence.ts`'s `openWebUserDb(name)`
    now prefers a real, durable sqlite file over `@sqlite.org/sqlite-wasm`'s OPFS "SAH pool" VFS
    (`installOpfsSAHPoolVfs`), and only falls back to the old `:memory:` `WebDb` +
    `localStorage`-snapshot path when OPFS isn't available. The `Db` interface is unchanged;
    `db/index.ts`'s `getUserDb()` picks the path via `openWebUserDb`'s `durable` flag and only
    runs `hydrateFromLocalStorage`/`withLocalStoragePersistence` on the non-durable path.
    `FileSystemFileHandle.createSyncAccessHandle` (which the SAH pool needs) turned out to throw
    `is not a function` when called from the main thread in a real browser (confirmed against
    this container's Chromium 141, not just docs/types) — it's worker-only — so the actual
    sqlite3 connection lives in a dedicated Worker (`opfsWorker.ts`, spawned via
    `new Worker(new URL('./opfsWorker.ts', import.meta.url), { type: 'module' })`), and
    `opfsDb.ts`'s `OpfsDb` is a small `postMessage` RPC proxy implementing the same
    `VersionedDb` interface every other backend does. `opfsSupported()` feature-detects by
    actually trying to stand up the pool inside the worker and catching failure, rather than
    trusting a main-thread capability check. Verified live in a real browser (not just the
    feature-detect): after a settings write, `localStorage.getItem('recipe-app.user-db-snapshot')`
    is `null` (the fallback snapshot never ran) and the setting survives a reload — i.e. OPFS
    is genuinely doing the persisting, not silently falling back. `persistence.test.ts` adds a
    unit test for the fallback path itself (jsdom has no OPFS, so `openWebUserDb` must return
    `durable: false` and a working `WebDb`); the OPFS-happy-path is exercised by the e2e reload
    walk (`smoke.spec.ts`), which passes on whichever path the real browser takes.
  - **Tap targets / focus states / empty states** (`app/src/index.css` + the route files below):
    a shared 44px-minimum baseline — a plain `<button>` gets `min-height: 44px`, and a new
    `.icon-button` class gives a single-glyph button (remove ×, favorite star) a 44×44 tap area
    without looking like a full-width button. Bumped to 44px or wrapped with `.icon-button`:
    bottom nav items, the header settings gear, the diet-switch pills, recipe-list links,
    kitchen-add's input and suggestion buttons, kitchen-item rows' remove button, the recipe
    detail favorite toggle, settings radio/checkbox rows, and the "+ New recipe" link. Added a
    global `:focus-visible` outline (`var(--color-accent)`, 2px, 2px offset) on every
    interactive element, so keyboard/AT focus is always visible but a mouse click stays quiet.
    Empty-state copy now says what to do next: Favorites ("Open a recipe and tap the star to
    save it here"), Kitchen ("Search above for an ingredient you have and add it"), My Recipes
    ("Create one, or open a recipe and tap \"Make my version\" to fork it").
- Checks: `scripts/check.sh` → `typecheck=pass lint=pass unit_passed=34 unit_failed=0` (12 test
  files — the new `openWebUserDb` fallback test added to `persistence.test.ts` — 0 skipped).
  Lint: 0 errors, the same 3 pre-existing non-blocking `react-refresh` warnings as S7a
  (unrelated file, `state/diet.tsx`). `prettier --check .`: clean. e2e: 22 passed, 0 failed —
  the 2 from S7a/S2 plus 20 new (`layout.spec.ts`'s 10 routes × 2 widths). Screenshots at
  412x915 for every route in `app/e2e/screens/route-*-412x915.png`, plus the pre-existing
  S7a screenshots (home, kitchen, settings, recipe-detail, my-recipe-fork-diff) re-captured
  against this slice's CSS.
- Outside my package: none.
- Design was wrong about: my first read of `installOpfsSAHPoolVfs` (from its TypeScript types
  and general docs) was that it works from the main thread with no Worker and no COOP/COEP
  headers, unlike the async OPFS VFS. That's false in practice — `createSyncAccessHandle` is
  worker-only in real Chromium, main-thread calls throw `is not a function` — caught by actually
  probing it in this container's browser rather than trusting the docs, which is why the OPFS
  connection ended up in a dedicated Worker (`opfsWorker.ts`) instead of the simpler same-thread
  class I'd planned.
- Open:
  1. `OpfsDb`/`opfsWorker.ts` assume a single `user.db` connection at a time (one module-level
     `worker`/`db` singleton in the worker) — fine today (`getCorpusDb()` still throws, unbuilt),
     but if a second db needs to open concurrently on the web build later, the worker protocol
     needs a per-db id in its messages rather than one implicit connection.
  2. Units toggle on the recipe detail screen is still UI-only (carried over from S7a's open
     item 2; out of scope here, no corpus density data yet).
  3. "Recipe not found" is still minimally styled (S7a's open item 3) — the favorites/kitchen/
     my-recipes empty states this slice asked for are done, but that one wasn't in scope.
