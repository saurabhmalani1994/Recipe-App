# Brief S1b: fix the BBC Good Food parser (ingest)
From the orchestrator. The full crawl (cap 20000) ended with, verbatim: {'written': 4473, 'drops': {'parse
error: TypeError': 11834, 'no recipe data parsed from page': 11834, 'page fetch failed (non-200 or
timeout)': 17, 'duplicate id': 1}}. So 72% of pages were fetched but lost to one bug.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `ingest/fetch/` only.
Model: mid. Effort: medium.

Deliverable:
1 Reproduce: fetch 10 URLs that failed (at 1 request per second, each under a 20 s timeout;
  find them from the crawler's progress or log files), save 3 as test fixtures, and find the
  TypeError.
2 Fix it. The JSON-LD shape likely varies (a list vs a dict, HowToSection, or an image object
  vs a string). Add a pytest per shape.
3 Make the crawler able to re-visit only the URLs it dropped for parse errors (a
  `--retry-failed` flag), keeping the existing resumable progress.
4 Do NOT run the full re-crawl (about 3.5 hours). Run `--retry-failed` capped at 200 and report
  written and dropped counts, each with a reason. The orchestrator runs the rest as a
  background script.
Checks: pytest counts. Report per §6, with the exact command for the full retry.
