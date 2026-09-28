# Brief S17b: reach the blocked cuisine sites with a headless browser (ingest)
From the orchestrator. S17 (orch/reports/S17.md; read "Design was wrong about" and "Open") found these blocked to a
plain HTTP client: vegrecipesofindia, maangchi, mykoreankitchen, justonecookbook, rasamalaysia,
themediterraneandish, amiraspantry, unicornsinthekitchen, familyspice, redhousespice. No Persian
site worked. Owner, verbatim (D19): "...no israeli food only palestinian/greek/egyptian/persian".
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/fetch/` (a browser mode for
fetch_sites.py, plus sites.yaml entries).
Model: mid. Effort: high.

Deliverable:
1 A `fetch: browser` option per site in sites.yaml. It uses Playwright with Chromium at
  executablePath /opt/pw-browsers/chromium (never install browsers). It keeps one browser
  context per site, 1 page per 2 seconds, and respects robots.txt. It reads JSON-LD from the
  rendered DOM and reuses the existing parse path.
2 Try each blocked site on 3 recipe pages. Keep a site only if 3/3 parse. Do not attempt to
  defeat an interactive challenge (CAPTCHA). If a site shows one, drop it with the reason
  "bot challenge".
3 Find at least 2 Persian sites that work (plain or browser), and one more French and one more
  Singaporean site if possible. Exclude Israeli sites (R16).
4 Smoke test with --cap 20 for each newly kept site. Report the per-site table with reasons.
  Do not run full crawls.
Checks: pytest (mock the browser layer in tests). Report per §6.
