# Decision record

Append only. The owner's words are verbatim (rule 13). Do not ask these again.

## 2026-09-27, scoping

| # | Topic | Owner said / chose |
|---|---|---|
| D1 | Form | "PWA + APK wrapper" |
| D2 | Data | "On-phone + file backup" |
| D3 | Library | "Curated ~50-100k" |
| D4 | NYT Cooking | "Skip it" |
| D5 | Diet | "In general I eat everything - but it would be good to be able to easily filter to vegetarian and to fish+poultry (my girlfriend does not eat red meat) when i'm cooking for her" |
| D6 | Extras | "Weekly meal planner", "Import from URL", "Nutrition estimates", "Scaling + unit toggle", "Substitutions" |
| D7 | Substitutions | "the substitutions table would be AMAZING - make a good focus of this, for all sorts of things, soy sauce, worstershire sauce, apple cider vinegar - just examples not exhaustive - i cook ALL KINDS of food" |
| D8 | Equipment | "choose which cooking equipment i would like to use, option for one pot meals, and use that to filter, e.g. oven, stove top, BOTH stove and oven, air fryer, food processer, mortar pestle, etc. etc. etc. <-- only illustrative NOt definitive" |
| D9 | AI | "None in v1" |
| D10 | Commit identity | GitHub noreply: saurabhmalani1994 <saurabhmalani1994@users.noreply.github.com> |
| D11 | Servings | "do 3 servings - i find the 2 servings are always too small for 2 people - I find 1.5 servings worth per person to be appropriate" |
| D12 | Home page | All four: cook with what I have, explore new cuisines, like my favorites, seasonal / quick weeknight |
| D13 | Not chosen | Cooking mode, pantry with expiry, and cook log with ratings were not picked for v1 |
| D14 | General | "I want most of the app to work without needing AI tools." "used primarily on my own Android phone." "personal use only" |

## 2026-09-27, diet follow-up

| # | Topic | Owner said |
|---|---|---|
| D15 | Vegetarian meaning | "yes, honestly anythiing that is not explicitly meat is fine for vegetarian, even stuff like oyster sauce of worsterchire sauce is fine, its mostly about the protein source" |
| D16 | Main-protein swaps | Asked: should a recipe whose main protein is meat or fish show as "adaptable" in Vegetarian / No red meat? Owner chose "Always show them" (over a separate tier, or never) |
| D17 | Style | "many of the apps felt very southern or mid western, using things like cool whip or sour cream for lots of the recipes, which is not my style." (said after grading sheet 1) |
| D18 | Fresh ingredients, Food Wishes | "i like using fresh ingredients. cant you get more from Food Wishes? he makes good food" |

## Orchestrator rulings (challengeable)

| # | Ruling | Why |
|---|---|---|
| R1 | The APK is the primary install, and the browser build is for dev and tests | Bundles the library offline, and native HTTP gets around CORS for URL import |
| R2 | Vite + React + TS + Capacitor, SQLite on both sides | One codebase, and it can be tested in this container |
| R3 | Metric by default, with a toggle per recipe | The owner answered servings but not units |
| R4 | `ingest` owns the corpus schema, and `app` owns `user.db` | Rule 8 |
| R5 | `corpus.db` ships as a Release asset, not in git | Size |
| R6 | "Generate" in v1 = rank, then adapt with substitutions and scaling | D9 rules out AI |
| R7 | Vegetarian (per D15) excludes only explicit meat, poultry, fish and shellfish, plus stocks, broths and fats named for them (chicken stock, lard). Condiments (oyster, fish and Worcestershire sauce, shrimp paste, anchovy paste), gelatin and rennet cheeses are allowed. The strict flags are kept, so a strict mode can be added later | D15 says "the protein source"; stock and lard are "explicitly meat" |
| R8 | No red meat stays strict: beef stock, lard and gelatin are excluded, because the preset exists for the girlfriend, not the owner | D5 |
| R9 | one_pot stays a literal tag (a single vessel). The app's "one pot meals" filter ANDs it with course=main, so S8 must derive a course tag | S5a open item; keeps course judgement out of an equipment tag |
| R10 | Curation drops openrecipes records whose ingredient names were lost (about 32% sampled) and any recipe without steps | They can't be matched or cooked |
| R11 | Drop the `foodcom` HF-mirror source (1,228 recipes) from the corpus. Its units were never in the data and the fetcher misaligned quantities. RecipeNLG already carries food.com recipes with full lines. Regenerate fixture.db without it | S7c finding |
| R12 | My Recipes rank as quality 1.0 within their coverage band | The owner's own recipes "worked well" |
| R13 | A My Recipe with no value for an active filter (time, one-pot, equipment) is excluded and counted, never passed through | Rule 11 |
| R14 | Ship the S15 servings estimator even though it missed its bar (61.9% vs 70%). The key was the source's stated servings, and the owner's complaint (D11: "2 servings are always too small for 2 people") is that stated servings run small, so matching them is the wrong target. The page labels it "Serves about N (estimated)". Re-judge later on owner feedback | Section 9: check the key against the complaint |
| R15 | D17 overrides the orchestrator's sheet-1 stat that convenience products had "no effect" (that regex missed sour cream, and a grade mixes quality with taste). Curation adds a style signal that down-weights heartland/convenience cooking, and the app gets a per-user "ingredients I avoid" setting | D17 |
