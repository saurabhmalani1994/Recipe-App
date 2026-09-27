# Brief S7b: UI polish and durable web persistence (app)
From the orchestrator, release v0.1. Read orch/reports/S7a.md, section "Open", first.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/` only.
Model: mid. Effort: medium.

Deliverable:
1 Layout: at 412px wide nothing scrolls horizontally. The My Recipe editor's ingredient row
  currently cuts off its 3rd field. Use a compact row layout: qty about 4ch, unit about 6ch,
  and the name taking the remaining width, with a remove button. Steps take the full width
  and use a multi-line textarea. Also check every other screen at 360px and 412px.
  Add a Playwright check that fails if document.scrollWidth > clientWidth on any route, at
  both widths.
2 Persistence: replace the localStorage snapshot in `app/src/db/persistence.ts` with an
  OPFS-backed sqlite-wasm database where the browser supports it. Keep the snapshot as the
  fallback. The Db interface is unchanged. The e2e reload walk must still pass.
3 Tap targets are at least 44px tall, with visible focus states. Empty states on Favorites,
  Kitchen and My Recipes say what to do next.
Out of scope: new features.
Checks: scripts/check.sh summary, and the e2e count. Save screenshots of every route at 412x915.
Report per §6.
