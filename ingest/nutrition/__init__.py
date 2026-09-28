"""Nutrition estimates (S14): USDA FoodData Central mapping and the per-serving fill.

See ingest/nutrition/fetch_usda.py, mapping.py, estimate.py, and this package's README-in-code
at the top of each module. The corpus build calls estimate.fill_recipe() once per recipe
(ingest/build/build_corpus.py) to fill recipes.kcal/protein_g/fat_g/carbs_g/fiber_g/sugar_g/
sodium_mg (schema/corpus.sql), estimated from Foundation + SR Legacy foods only (public domain),
never zero: NULL when coverage is too low to trust.
"""
