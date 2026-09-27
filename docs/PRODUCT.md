# Recipe App: product decisions

Status: DRAFT v1 for the owner's approval and a Codex adversarial review. The owner's words are
quoted in `docs/DECISIONS.md`, and anything labelled "ruling" was decided by the orchestrator and
can be challenged.

## What it is

A personal cooking companion for one owner, used on their own Android phone. It works fully
offline over a large local library of recipes gathered from free sources. The owner tells it
what they have, who they are cooking for, what equipment they want to use and what cuisine they
feel like, and it recommends recipes that work, plans the week, builds the grocery list, and
suggests substitutions.

## What it is not

- It is not a recipe generator that invents dishes from nothing. Without AI, "generate" means
  that v1 ranks proven recipes from the library and adapts them with substitutions and scaling.
  An AI slot for real generation is left for later (owner: "None in v1").
- It is not multi-user. There are no accounts and no servers (owner: "On-phone + file backup").
- It is not a publisher. The library is scraped for personal use only, and the repo stays private.

## Platform (owner chose "PWA + APK wrapper")

- One Vite + React + TypeScript codebase, wrapped with Capacitor into an APK that is built by
  GitHub Actions and sideloaded.
- Ruling: the APK is the primary install. It bundles the recipe library, and native HTTP gets
  around CORS for "import from URL". The browser build is used for development and Playwright
  tests. Hosting a PWA is optional and needs the owner's approval, because it is outward facing.
- Storage is SQLite (@capacitor-community/sqlite on the device and sqlite-wasm in the browser).
  There are two databases: `corpus.db` is read-only and shipped with the app, and `user.db` holds
  favorites, the owner's recipes, the plan, the kitchen, lists and settings.
- Backup exports `user.db` as JSON through the Android share sheet (Drive, Files) and imports it
  back.

## The library (owner: "Curated ~50-100k", NYT skipped)

- Sources, in order: open datasets (RecipeNLG, Food.com), the GitHub repos the owner listed, and
  schema.org JSON-LD scraped from AllRecipes, BBC Good Food and Food Wishes. Other free sources
  can be added as they are found. Every recipe keeps its source URL.
- Pipeline in Python (`ingest/`): fetch, parse, normalize ingredients, dedupe near-duplicates,
  apply the quality filter (complete ingredients and steps, sane quantities, a rating where one
  exists), tag, then build `corpus.db` with FTS5. Drops are counted with a reason for each (rule 11).
- Target: 50-100k recipes and under 300 MB on the phone. `corpus.db` is a GitHub Release asset,
  not stored in git.

### Tags derived for every recipe (the engine runs on these)

- **Canonical ingredients.** Each line is parsed into quantity, unit, canonical ingredient, form
  and optional flag. The canonical taxonomy is the core asset: it carries the grocery aisle, diet
  flags, density for unit conversion and the USDA nutrition link.
- **Cuisine.** Indian, Chinese, Italian, Mediterranean, Mexican, Thai, Japanese, Korean, Middle
  Eastern, French, American, and so on. It comes from source labels, with an ingredient-signature
  classifier as fallback.
- **Diet.** Derived from the ingredients, never from titles. The planted traps are beef stock,
  gelatin, lard, Worcestershire sauce (anchovy), fish sauce, and suet.
- **Equipment**, inferred from the steps: oven, stovetop, both, air fryer, food processor,
  blender, mortar and pestle, slow cooker, pressure cooker, grill, microwave, wok, stand mixer,
  and others. There is also a one-pot / one-pan / sheet-pan flag.
- **Time**, total and active, and a weeknight flag for recipes under 30 minutes.
- **Seasonality** of the key produce, and nutrition per serving (estimated from USDA
  FoodData Central).

## Features in v1

1. **What can I cook?** Enter the ingredients you have and pick a cuisine or "any". Results are
   ranked by how much of each recipe you can cover, with staples like salt, oil and water
   ignored. Each result shows "missing 1-2" and "missing, but a substitute works", and filters
   by diet, equipment, one-pot and time.
2. **Diet quick switch**, on every screen, with three presets: Everything / Vegetarian / No red
   meat (fish + poultry OK). Owner: "when i'm cooking for her".
3. **Equipment filter.** "My kitchen has" is set once in settings. Each search can also narrow to
   "use only…" or require one-pot, as the owner asked: "choose which cooking equipment i would
   like to use, option for one pot meals".
4. **Substitutions (focus feature).** A curated, offline table of swaps covering sauces,
   vinegars, dairy, eggs, flours, spices, aromatics, fats, alcohol and regional pantry items
   (Indian, Chinese, Japanese, Mexican, Middle Eastern, and so on). Each swap has a ratio, the
   contexts where it works (baking / sauce / marinade / garnish), a quality score from 1 to 3,
   how it changes the diet flags, and a note on the effect. Swaps show on every recipe, and the
   search uses them. Target for v1 is 400+ entries, reviewed adversarially.
5. **Weekly meal planner.** A week grid with a people count for each meal. It flags recipes
   that share ingredients so bunches and tins get used up.
6. **Grocery list builder.** It takes the plan, scales it (see servings), adds everything up by
   canonical ingredient with unit conversion, subtracts "what I have", groups by aisle, and gives
   a checklist that works one-handed in the store. A ticked item can be moved into "what I have".
7. **Kitchen list ("what I have").** A simple list of canonical ingredients with no expiry
   dates (the owner did not pick expiry). Staples are pre-seeded.
8. **Favorites and the home page.** The home page has four rows: cook with what I have, explore
   a cuisine you haven't cooked lately, like your favorites, and seasonal / quick weeknight.
9. **My recipes and variants.** Add your own recipe, or fork any recipe with "make my version".
   The app shows the fork's differences from the original, and both stay linked.
10. **Import from URL.** Reads schema.org JSON-LD without AI and falls back to a manual-edit form.
11. **Scaling and units.** Metric by default, with a toggle to US units on each recipe (ruling;
    the owner didn't choose units).
12. **Nutrition estimates** per serving, clearly labelled as estimates.

## Servings rule (owner's words)

"I find 1.5 servings worth per person to be appropriate." Servings are 1.5 per person, rounded
up to the recipe's natural unit. The default is 2 people, so 3 servings, and the rate of 1.5 can
be changed in settings.

## Quality bar (§9, written before any eval)

- Diet filter: zero red meat in "No red meat" and zero meat or fish in "Vegetarian", tested on
  planted hidden-ingredient fixtures. This is a hard gate.
- What can I cook: on a set of planted kitchens, the owner would cook at least 8 of the top 10
  results. The owner grades one hand-made set, and a cheap judge is used while iterating.
- Substitutions: every entry has a ratio and a context, and no entry violates the diet flags it
  claims. Codex reviews the table.
- Grocery totals: exact on the fixture plans, with unit conversions checked.

## Packages

| Package | Owns | Lang |
|---|---|---|
| `ingest` | Sources, the parser, the taxonomy, taggers, `corpus.db` and its schema (`schema/corpus.sql`) | Python |
| `app` | The UI, the engine (matching, planning, grocery), `user.db` and its migrations, the APK build | TS |

The two packages share only the corpus schema, and `ingest` owns it. `app` generates its types
from `schema/corpus.sql`.

## Open for the owner (each has a default)

- Network: this container can reach package registries but not recipe sites or dataset hosts.
  Until that changes, ingest runs only on fixtures.
- Hosting a PWA as well as the APK. Default: no.
- Codex reviews: the owner runs `reviews/*-codex-brief.md` in Codex CLI and drops the output
  into `reviews/`, and the orchestrator folds the findings in.
