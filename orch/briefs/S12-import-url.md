# Brief S12: Import from URL, and My Recipes in "What can I cook?" (app)
From the orchestrator, release v0.2. Owner, verbatim: "Upload my own recipes based on something i did that
worked well, or to copy an existing version and make a version of it with some modifications i
did that I liked". Also D6 "Import from URL" (no AI). Read orch/reports/S13.md.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only. S11 (home) is working in
routes/Home.tsx and features/home|favorites; do not edit those.
Model: mid. Effort: high.

Deliverable:
1 Import from URL, in My Recipes > "Import from link". On native, fetch with CapacitorHttp (no
  CORS). In the browser, a direct fetch usually fails on CORS, so offer "paste the page's HTML
  or the recipe text" as the fallback, and explain it in one line.
  - Parse schema.org Recipe JSON-LD (including @graph and arrays), then microdata as a fallback.
    Read title, yield, times, ingredients, instructions (HowToStep and HowToSection), image,
    cuisine, category and the source URL.
  - If there is no structured data, heuristically split plain pasted text into ingredients and
    steps.
  - Open the result in the editor, pre-filled and parsed by S13's parser, with the source URL
    kept. The user reviews and saves.
  - Tests: a saved-HTML fixture for each of bbcgoodfood, a WordPress recipe-plugin page (WPRM)
    and a blogspot page (all from /home/user/recipe-data/raw where available; otherwise write
    small realistic fixtures), plus a plain-text paste.
2 My Recipes in Cook results: a JS-side union of My Recipes (using their stored slugs) with the
  SQL candidates, ranked by the same comparator and marked "Mine". Diet status is computed from
  the taxonomy flags (explicit_meat for vegetarian per R7/D15, red_meat for no_red_meat per R8),
  including adaptable where a substitution exists; reuse the engine's swap logic. Tests: a My
  Recipe appears for a matching kitchen, and is excluded by a diet it violates.
3 Playwright: paste an HTML fixture, see the parsed preview, save, and find it in Cook.
  PW_PORT=4312. No horizontal scroll.
Checks: scripts/check.sh and the e2e count. Report per §6.
