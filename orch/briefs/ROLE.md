# Role card (every run)

You are a builder run. Boot from this card, `ORCHESTRATION.md` §2 (standing rules), and your
brief. Read nothing else first. Do the brief, commit your files to your own worktree branch, write
your report to `orch/reports/<slice>.md` (also commit it), then exit. Never push. Never touch
another branch.
Work in the foreground: no background jobs and no waiting on a notification. Handle one item at
a time, each with a timeout. If the work grows past the brief, stop and report what you have.
Commit identity is already set in the repo config. Do not change it. End every commit message with:
Co-Authored-By: Claude <noreply@anthropic.com>
Never put model names in files or commits.
Shared data dir outside git: /home/user/recipe-data (never commit anything from it).
