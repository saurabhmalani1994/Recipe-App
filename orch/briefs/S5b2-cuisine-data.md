# Brief S5b-2: cuisine classifier, second attempt (more labelled data)
From the orchestrator. S5b missed its bar: "accuracy among scored 68.6% (81/118), unknown 23.9%"
held-out, and 57.1% on the 100-recipe hand-labelled transfer set. The cause, per orch/reports/S5b.md
(read that report first): only 823 labelled recipes, from 2 sources. Tuning is exhausted, so the
fix is data.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/cuisine/` only.
Model: mid. Effort: high. The bar is unchanged: top-1 >= 80% among scored, unknown <= 30%.

Deliverable:
1 More labelled data, with every added set counted and reported with drops (rule 11):
  a Public cuisine-labelled datasets on Hugging Face, e.g. mirrors of Kaggle "What's Cooking"
    (Yummly, about 40k recipes in 20 cuisines) or any recipe set with a cuisine column. Search
    https://huggingface.co/api/datasets?search=... and fetch the files directly.
  b Silver labels from a curated lexicon of dish names and demonyms, applied to titles in
    recipenlg and openrecipes. Examples: "tikka masala", "pad thai", "bibimbap", "tagine" and
    "carbonara". A title like "Thai green curry" counts, but "italian sausage", "french fries",
    "american cheese", "swiss chard" and "spanish onion" do not. Cap each class so that no
    cuisine exceeds 5x the smallest.
  c Source domains in openrecipes URLs, where a site is dedicated to one cuisine.
2 No leakage. When a label came from a title marker, drop that marker's tokens from the
  features of that training row. The eval sets are the existing held-out split plus a new
  300-recipe hand-checked set from sources and titles not used in training. Report both.
3 Class hygiene: if german_central_eu or another umbrella bucket still swallows unrelated
  recipes, restructure it. Record any label change in cuisines.yaml with a reason. Keep
  southern_us in the list; it may stay predict-never if no data labels it.
4 Rerun the 20k corpus run. Report the unknown rate by source and the top-10 label distribution.
Checks: the pytest count, and both eval sets against the bar. If it still misses, give the best
config's numbers and a recommendation, and do not lower the bar.
Report per §6 plus 8 classified recipes verbatim from the new hand-checked set, including 2 wrong ones.
