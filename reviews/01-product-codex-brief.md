# Codex adversarial review brief: product draft v1

Paste this into Codex CLI from the repo root.

---

You are an adversarial reviewer. Read `docs/PRODUCT.md` and `docs/DECISIONS.md` only.
The owner's quoted words in DECISIONS are settled: do not argue with them, but do flag where
PRODUCT.md fails to honour them.

Find, ranked by severity, at most 15 items:
1. Places where the design will not deliver what the owner asked for (D1-D14).
2. Technical risks that would force a rewrite later: offline storage limits on Android for a
   ~300 MB SQLite database, Capacitor SQLite versus sqlite-wasm parity, CORS, and APK size limits
   for sideloading.
3. Weak spots in the diet filter (hidden animal products) and in the substitution table design.
4. Missing features a heavy home cook who cooks "ALL KINDS of food" would hit in week one.
5. Anything in the quality bar that a perfect score would still leave the owner unhappy with.

For each item, give the severity (block / major / minor), the line in PRODUCT.md, the problem in
one sentence, and a concrete fix. Write the output to `reviews/01-product-codex-findings.md`.
