# Brief S21: the native corpus fails to open on the owner's phone, plus a device smoke gate (app + CI)
From the orchestrator. On the owner's Android phone (first device run), Home shows, verbatim: "The recipe library
could not be opened: not allowed in read-only mode". Root cause, established by the orchestrator:
app/src/db/corpusDb.ts openCorpus() calls `db.execute('PRAGMA query_only = ON')`. On native, CapacitorDb
opens corpus.db with readonly=true, and the plugin's execute(), executeSet() and run() throw "not allowed in
read-only mode" (CapacitorSQLite.java around line 890). The web path accepts it, so every test passed.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/src/db/`, `app/android/` if needed,
`.github/workflows/app.yml`.
Model: strong. Effort: high.

Deliverable:
1 Fix: never call execute or run on a read-only native connection. The native path relies on the plugin's
  readonly flag, and the web path keeps query_only. Audit every call on the corpus Db for the same
  class of bug. Add a unit test with a fake readonly CapacitorDb that throws exactly like the plugin
  (rule 12: the exact input that broke it).
2 The Android back gesture and back button navigate back in the app history (the @capacitor/app
  backButton listener). They exit only from the Home root.
3 Device smoke gate in CI (§8, "the packaged build launches with its assets"): a job that boots an
  Android emulator (reactivecircus/android-emulator-runner, API 34, x86_64), installs the debug APK,
  launches it, and waits up to 10 minutes for a logcat line the app prints when the corpus is ready
  (add `console.info('[corpus] ready <n> recipes')`). It also asserts that no "could not be opened"
  line appears. It fails the build otherwise. Report the first-launch copy time you observe for the
  228 MB asset in the emulator.
4 First-launch UX: while the corpus is copied, show a progress or "Setting up the recipe library (one
  time, about N seconds)" state instead of an error.
Checks: scripts/check.sh, e2e (PW_PORT=4330), and the new CI job green on push. You cannot push, so
make the workflow correct by construction and state what you could not run. Report per §6.
