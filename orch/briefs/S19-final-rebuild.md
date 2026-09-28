# Brief S19: final rebuild, and a CI build that ships the real library (ingest + CI)
From the orchestrator. All crawls are finished (BBC 17,404 lines; cuisine sites as in the logs at
/home/user/recipe-data/logs/). Read docs/DECISIONS.md R16-R20, ingest/build/CURATED_BUILD.md (the
rebuild commands), orch/reports/S10.md and S10b.md.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/`, `schema/`, generated app types,
`.github/workflows/app.yml`, and `app/vite.config.ts` only for the corpus file path.
Model: strong. Effort: high.

Deliverable:
1 Wire R20: call title_cuisine in derive(). Add 'title_marker' to the cuisine_source CHECK, bump the
  schema version, and regenerate types.ts. A demonym always overrides; a dish marker only when the
  classifier is unknown or below threshold.
2 Space (S10 Open 1): drop the unused vegetarian_strict rows from recipe_diet and shorten the swaps
  JSON keys (keep the app reading them; update app/src readers only if they must change, and keep
  check.sh green). Report the MB saved.
3 `scan --refresh-grown`, then the full build to /home/user/recipe-data/out/corpus.db, with a hard cap
  of 235 MB. Report the recipe count, and the distributions by source, site, cuisine, course and diet,
  plus the fill rates and drops by reason (CURATED_BUILD.md).
4 Git LFS layout, prepared but not pushed: add `.gitattributes` tracking `corpus/*.db` with LFS, and
  copy the built file to `corpus/corpus.db` in your worktree, committed via LFS (git-lfs is installed).
  Change the CI workflow: checkout with `lfs: true`, cache the LFS object keyed by its oid, and build
  the APK with CORPUS_DB_FILE=corpus/corpus.db, so the APK bundles the real library. The web build
  keeps the fixture unless CORPUS_DB_FILE is set. Do NOT push; the orchestrator pushes, and verifies
  the LFS upload works through this environment.
5 Spot-check 20 random recipes verbatim (title, cuisine, cuisine_source, course).
Checks: ingest pytest, app scripts/check.sh, and the build numbers. Report per §6.
