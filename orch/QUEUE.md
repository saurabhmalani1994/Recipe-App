# Queue

`name | package | status | tier | brief file | target`

S1 source-fetch (datasets + schema.org scrape) | ingest | DONE (merged) | sonnet | orch/briefs/S1-source-fetch.md | v0.1
S2 app scaffold: Vite+React+TS, Capacitor, sqlite, CI APK, commit hook | app | DONE 3639216 | sonnet | orch/briefs/S2-app-scaffold.md | v0.1
S3 ingredient-line parser + canonical taxonomy | ingest | DONE (merged) | opus | orch/briefs/S3-parser-taxonomy.md | v0.1
S4 substitutions table v1 (400+ entries, schema + tests) | ingest | DONE (merged) | opus | orch/briefs/S4-substitutions.md | v0.1
S5a diet/equipment/one-pot/time taggers | ingest | DONE merged | opus | orch/briefs/S5a-diet-equipment.md |
S5b cuisine classifier + seasonality | ingest | DONE merged, BAR MISSED (68.6%/23.9%) | sonnet | orch/briefs/S5b-cuisine-season.md |
S5b-2 cuisine data expansion (2nd attempt, same tier) | ingest | DONE merged, bar PASSED narrowly | sonnet | orch/briefs/S5b2-cuisine-data.md |
S7a settings, kitchen, favorites, my recipes + forks | app | DONE merged | sonnet | orch/briefs/S7a-user-features.md | v0.1
S6 matcher engine + Cook screen + units | app | DONE merged | opus | orch/briefs/S6-matcher.md | v0.2
S7 planner + grocery + shopping mode | app | DONE merged | sonnet | orch/briefs/S7-planner-grocery.md | v0.2
S8 curation: dedupe + quality + select ~80k + full build | ingest | DONE merged (owner grade pending) | opus | orch/briefs/S8-curation.md | v0.1
S9 corpus.db build + FTS5 + schema/corpus.sql | ingest | after S8 | opus | - | v0.1
S7b UI polish: the recipe editor ingredient row overflows at 412px (3rd field cut off, seen in the screenshot); the qty/unit fields are too wide; OPFS persistence instead of the localStorage snapshot | app | DONE merged | sonnet | orch/briefs/S7b-ui-polish.md | v0.1
S3b taxonomy/subs/parser fixups from S5a | ingest | DONE merged | sonnet | orch/briefs/S3b-fixups.md | v0.1
S9a corpus.db schema + builder on sample + course tagger + app types/fixture | ingest+app types | DONE merged | opus | orch/briefs/S9a-corpus-schema.md | v0.1
S9b course tagger modifier rules; blind set must be >= 85% (it was 82%) | ingest | READY after S8 | sonnet | - | v0.1
S9c parser: 'cans tuna packed in water' resolves to water | ingest | fold into next parser slice | sonnet | - | v0.1
S6b Cook fixes: flaky diet persistence, equipment list drift, readability, ranking floor | app | DONE merged | sonnet | orch/briefs/S6b-cook-fixes.md | v0.1
S7c shoppable grocery list (buy_as, shop units, no-qty items stay on list) | ingest taxonomy + app | DONE merged | opus | orch/briefs/S7c-shoppable-list.md | v0.2
S10 full rebuild: R17 (Food Wishes video-method exception, extract the YouTube URL), R16 (no Israeli), S17 sites, R11 (no foodcom), S3b subs, S14 nutrition, S15 servings, bbc new lines, owner-grade outcome; regenerate fixture.db | ingest | after S15 + owner grade | sonnet | - | v0.2
S13 TS ingredient parser port + My Recipes parsed items | app | DONE merged | opus | orch/briefs/S13-ts-parser.md | v0.2
S11 home page 4 rows + corpus favorites | app | DONE merged | sonnet | orch/briefs/S11-home.md | v0.2
S14 nutrition (USDA FDC) | ingest | DONE merged | sonnet | orch/briefs/S14-nutrition.md | v0.2
S12 import from URL + My Recipes in Cook | app | DONE merged | sonnet | orch/briefs/S12-import-url.md | v0.2
S15 servings estimator | ingest + small app | DONE merged, bar missed (61.9%), shipped per R14 | opus | orch/briefs/S15-servings.md | v0.2
S12b Mine: favorite-source bug, R12 ranking, R13 filters | app | RUNNING | sonnet | orch/briefs/S12b-mine-fixes.md | v0.2
S1b fix BBC parser TypeError + --retry-failed | ingest | DONE merged; full retry running as background script | sonnet | orch/briefs/S1b-bbc-parser.md | v0.2
S8b rescore by substance (owner grade FAIL: top 1.05) + fresh 45-recipe sheet | ingest | RUNNING | opus | orch/briefs/S8b-rescore.md | v0.2
S16 app: 'ingredients I avoid' setting (R15), with down-ranking or hiding in Cook, Home and Surprise | app | READY after S12b | sonnet | - | v0.2
S1c Food Wishes full crawl via Blogger feed | ingest | DONE merged: 1,084 recipes (587 posts are Allrecipes-only) | sonnet | orch/briefs/S1c-foodwishes-full.md | v0.2
S12b merge | app | DONE merged after the owner said resume |
S17 cuisine-specialist sites: survey + generic fetcher (D19, R16) | ingest | RUNNING | sonnet | orch/briefs/S17-cuisine-sites.md | v0.2
