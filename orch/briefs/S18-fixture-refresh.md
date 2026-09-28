# Brief S18: refresh the app fixture (app tests re-pinned)
From the orchestrator. S10 (orch/reports/S10.md "Design was wrong about" and "Open" item 2) could not
swap in a balanced fixture, because engine.test.ts, rows.test.ts and myRecipeMatch.test.ts pin counts
over the whole fixture. The refresh command is ready:
`python3 -m ingest.build.make_fixture --keys-from app/src/corpus/fixture.db --refresh`.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` tests and `app/src/corpus/fixture.db`.
Model: mid. Effort: medium.

Deliverable:
1 Run the refresh. It adds 2 recipes per cuisine site and 18 Food Wishes, 12 of them video-only.
2 Re-pin the fixture-wide counts in tests to the new fixture. Keep every behavioural assertion
  (planted kitchens K1-K3, the diet traps, swaps). Where a behavioural test only held because of
  old data (S10 names "Beef stew excluded under no_red_meat"), rewrite it against today's
  substitutions table and D16/R8, and explain each case.
3 App: a recipe with video_url and no steps shows "Method in the video" with a link on the
  detail page (R17). Add a test.
4 scripts/check.sh green, and e2e with PW_PORT=4321 green.
Report per §6 with every re-pinned number (old → new).
