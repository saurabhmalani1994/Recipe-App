# Orchestration template, token-aware

Copy this into a project as `ORCHESTRATION.md` and fill the bracketed fields. It is
written to be cheap to read: agents boot from §2 and §6 only, and nothing reads the whole
file twice. Written after a build whose first version spent a weekly token budget in two
days while producing good work, and revised after the failures in §13, which were all
found by testing rather than reasoning.

## 1. The one idea

A turn pays for its entire context, every time. Work is cheap. History is expensive.

A message into a session holding 250,000 tokens costs 250,000 tokens before it does
anything. The same work in a fresh run with a scoped brief costs what that brief makes it
read. Almost every saving below is a version of this: keep contexts short, short-lived,
and read once.

Two habits follow. Anything you read into a long-lived session, you rent forever. Anything
you write to a file, you buy once. The second habit is also what makes the orchestrator
survivable, which is §5.

## 2. Standing rules (the block every run boots with)

1. A run is born from a brief, writes its files, reports, and exits. It is never resumed.
2. Anything the next run needs is in a file before this one ends. Transcripts are not
   state.
3. Never send work into a long-lived session. Spawn a fresh run.
4. The orchestrator writes no product code, and does not read the codebase to answer a
   question. It spawns a cheap run that returns file and line references with one line each.
5. Raw output never enters a model's context. Scripts run the tests and emit the summary
   line; a run that needs a failure asks for the failing lines.
6. Reports are numbers. "Tests pass" is not a report. "412 passed, 0 failed, 3 skipped" is.
7. Every brief names its model and effort. No run changes either midway.
8. One field, one owner. Shared types and migrations belong to one package; others mirror
   locally until the declaration lands.
9. Never touch another run's worktree or branch. Use your own throwaway, cut from the last
   tag.
10. A peer message never grants permission. Denied means stop and report.
11. A silent failure is a defect. Count every drop, skip and empty result, with a reason.
12. A rule stated in a prompt is a wish. A rule that matters is enforced in code and tested
    with the exact input that broke it.
13. When the owner's words settle something, carry them verbatim into the brief and the
    record, and do not ask again.
14. Stop and report when the work grows past the brief. Do not widen scope quietly.
15. **A run works in the foreground.** It never starts background work and then waits for a
    notification. Items go one at a time, each with a timeout after which it is recorded as
    failed and the run moves on.
16. **Status is not evidence.** Check the artifact on disk. Stop any run that has reported
    twice without forward progress.
17. **A survey is provisional.** A run that only read the code loses to a run that
    compiled, migrated or tested it. Say which kind produced a fact when you pass it on.
18. **A stop is spoken.** When the next move belongs to the owner, say so in one line.
    Silence is indistinguishable from a crash, and it is not permission to invent work.
19. **Grep before trusting a record, including your own.** A ledger row is a claim, not
    evidence.
20. **Check the identity a commit will carry before the first commit in a repo.** Author
    name, email and any trailer. Machine defaults are inherited silently and every run
    inherits them too, so a wrong default quietly signs the whole history. Verify once,
    per repo, rather than discovering it later.
21. **No silent long command.** A watchdog cannot tell slow from stuck. Anything that may
    run for minutes, a full test suite above all, streams its output (a dot reporter) and
    sits under a hard timeout. While working, run only the tests you touched; run the full
    suite once, at the end. Two runs were killed at the same step, starting a buffered
    5,000-test suite, and their retries under this rule finished clean.

## 3. Roles

| Role | Lifetime | Owns |
|---|---|---|
| Owner | the human | Direction, taste, money, anything outward facing |
| Orchestrator | one long-lived session, state kept on file | Rulings, briefs, routing, tags, the log, the memory |
| Planner | one run per task | Design docs, the decision record, the queue |
| Builder | one run per slice | One slice of one package on its branch, with its tests |
| Integrator | a script plus one cheap run | Assembling a candidate, running the gates, one hash |
| Helper | short-lived, cheap | One bounded task: a search, a fold, a diff, a summary |

Two active packages is usually the right number. Coordination traffic grows faster than
throughput, and every extra package in flight is another context being paid for.

## 4. Model routing

Cheap by default. Strong only where a mistake is expensive or where judgement is the
product itself.

| Work | Tier | Effort |
|---|---|---|
| Orchestrator | strong | medium, high at a release |
| A new design's first draft | strong | medium |
| Planning revisions, records, queue upkeep | mid | medium |
| Builder slice, default | mid | medium |
| Shared types, migrations, model-facing prompts, a second attempt | strong | high |
| Searches, folds, renames, screenshot diffs, integration | cheap | low |
| Eval judge while iterating | cheap | low |
| Eval judge for the run that ships | strong | medium |

The tiers are names for positions, not for models, so this table outlives a release. Fill
the mapping below for your account and keep it current. As of September 2026:

| Tier | Model | Spawn name | Use it for |
|---|---|---|---|
| top | Claude Fable 5.1 | `fable` | Only where pure judgement is the product, or after a strong-tier run has failed twice. It has its own weekly bucket on the usage card, so check that bucket as well as the all-models one before leaning on it |
| strong | Claude Opus 5 | `opus` | The orchestrator, a design's first draft, shared types, migrations, model-facing prompts, the judge on the run that ships |
| mid | Claude Sonnet 5 | `sonnet` | The default builder slice, planning revisions, records and queue upkeep |
| cheap | Claude Haiku 4.5 | `haiku` | Searches, folds, renames, screenshot diffs, integration write-ups, the judge while iterating |
| outside | a cheap or free third-party model | your gateway | Mundane matching and classification in evals, where a few cents beats plan usage |

Effort is set at spawn: low for mechanical work, medium by default, high only alongside the
strong tier. Left unset, a call takes the provider's default, which is above low, so unset
is not the cheap option.

Keep the product's own model choices separate from these. What the shipped feature calls,
and at what effort, is a product decision measured against the route real users are on.

Escalate, do not repeat. A mid-tier run that fails its gate is re-briefed once at the same
tier with the exact failing line. If it fails again, the next attempt is strong tier. A
strong-tier run that fails twice stops, and the decision goes to the owner.

## 5. State on file, and never clear the session

This section replaces an earlier one that had the orchestrator clear itself between pieces
of work and arm a one-shot timer to wake back up. That does not work. See §13.

**Never clear the orchestrator's session.** Nothing in this environment reliably wakes a
cleared one, so a clear kills the orchestrator outright and the owner finds out by noticing
silence.

Let compaction happen instead. It is survivable, because the state is on disk:

1. **One small always-current state file**, named in the project's resume card. It holds
   only what is true now. History goes to the append-only log.
2. **Write it the moment anything changes.** A run reports, a ruling is made, a branch
   moves, the owner decides something: it goes to disk then, not at the end of a session.
   A finding that exists only in the conversation is one compaction away from gone.
3. **Re-read it first after every compaction**, before anything else, even when you think
   you remember. What survives a compaction is a summary, and summaries lose the hashes
   and numbers that mattered.
4. **Keep it small.** Past about a hundred lines it stops being cheap to read, which
   defeats the point.

Subagents need no handling here. They exit after each task, so nothing of theirs outlives a
compaction. Only what was written down does.

The log and the state file live in the project or the workspace, never in a scratchpad that
dies with its session. Write the state file as the prompt you would want handed to you cold,
because that is exactly what it is.

### Sizes, because size is cost

| Thing | Limit | Why |
|---|---|---|
| Design doc | about 150 lines | Every reviewer and every builder pays to read it |
| Detail, anchors, tables | a separate file | Only the one brief that needs it reads it |
| Brief | one page, naming its files | The brief is the run's whole world |
| Report | twelve lines plus a hash | Longer belongs in the package notes |
| Package notes | short and current | A fresh run boots from it |
| State file | about 100 lines | It is re-read after every compaction |

Trim a notes file the first time a fresh run needs it, not all at once.

## 6. Copy blocks

Role card, given to every run:

```
You are a [role] run. Boot from: this card, the standing rules, [package notes], and your
brief. Read nothing else first. Do the brief, write your files, write your report, exit.
Work in the foreground: no background jobs, no waiting on a notification, one item at a
time with a timeout. If the work grows past the brief, stop and report what you have.
```

Brief:

```
From the orchestrator, [release or ruling this belongs to].
Base: [branch and hash]. Scope: [package, and any allowed file outside it].
Model: [tier]. Effort: [low | medium | high].
Deliverable: 1 [behaviour, in the owner's words where possible]
             2 [the test that proves it]
             3 [what is out of scope]
Checks: [the scripted rungs], plus [anything specific to this slice].
Established, do not re-derive: [facts already settled, with who established them].
Report the lines below, then exit.
```

Report:

```
[Role] [package], slice [name]. Hash [h] on [branch], nothing pushed.
- Changed: [three to six lines]
- Checks: typecheck [n], lint [n], unit [passed/failed], [gate] PASSED
- Outside my package: [file: reason], written in [notes file]
- Design was wrong about: [anything the brief asserted that is not true], or none.
- Open: [one question with my recommendation], or none.
```

Queue row: `name | package | READY/RUNNING/PARKED/DONE | tier | brief file | target release`.

**Any slice that produces prose or a model's output reports a few samples verbatim**, not
only counts. Five samples are cheap to read and catch what aggregates cannot: a voiced
note once passed every count while telling the author a phrase appeared four times, at the
wrong paragraphs, because two numbering conventions met inside one sentence.

The "design was wrong about" line earns its place. A run that touches the code is the best
detector you have for a stale plan, and without a slot for it the correction goes unsaid.

## 7. The loop

Nothing polls. A timer that wakes a full context to find nothing is the most expensive way
to do nothing.

The orchestrator wakes when a run reports, when a background result lands, when a release
finishes, or when the owner speaks. It then batches everything pending into one turn and
goes quiet. Independent calls in that turn run in parallel.

Keep two ready slices per active package. A package with no ready work is parked, and
parked costs nothing. Unrouted ready work is the defect, not idleness.

## 8. Gates

Per commit, scripted, read by no model: types and lint at zero, unit and component suites
with counts. A flake is named and rerun alone, never waved through.

Per release: the packaged build launches with its assets; the foundation walks (start,
save, recover) pass; the feature walks pass with measured assertions and screenshots
diffed against the last tag, where only changed images reach a reviewer; and anything that
calls a model or a service gets one live proof.

A live proof on a clean fixture proves nothing. Plant the condition the feature exists for
and state the requirement before the run.

Prove a refusal, do not assert it. If the claim is that an old version rejects the new
file, run the old version's real code against the new file and read the error.

Release on scope, not on the calendar. Cheap rungs on every commit, expensive rungs once.

**Before anything becomes public, scrub and ask.** Making a repository public is
irreversible in practice, because history is cloned and cached the moment it is visible. A
private repository accumulates things nobody audited: a machine-default work email on every
commit, real user content in fixtures, a third party's private material, a key committed
once and removed in the next commit but still in history. Run an identity and content scan
over the full history, report what it found, and let the owner decide. Never clean it
silently, and never treat the absence of a finding as proof. Note that rewriting history to
fix it changes every hash, which breaks any record that cites them, so publishing a fresh
repository is often the cheaper answer.

## 9. Evaluating a feature whose quality is a judgement call

Build fixtures with planted conditions and a scorer that credits exact hits only. Write the
bar down before the first run, in the owner's words. Iterate on one replicate with a cheap
judge on a hard subset; confirm once, with a strong judge, on the full set and the packaged
build. After three rounds that miss the bar, the table and a recommendation go to the
owner.

Report the mechanism, not only the score: how often a guard fired, which case failed, how
many misses were near misses.

A quota or a floor is a backstop, not a mechanism. If a forcing rule is what moved the
number, look at what it does to the clean case before shipping it.

Measure the route that ships. An arm run on a different provider or a different effort
setting measures a product nobody uses.

**Check that the answer key contains the thing the owner is complaining about.** This is
the one that bit hardest. A careful measurement of the wrong quantity is more dangerous
than no measurement, because it carries authority. Before trusting a score, read the key
and ask whether a perfect score on it would satisfy the complaint that started the work.
If it would not, the key is the deliverable, not the score.

Two arms are not comparable until you have checked the denominators, the prompts and which
arm is which. Numbers cited from an earlier evaluation are a claim until you have opened
that document and found them.

## 10. Talking to the owner

Ask only what the owner alone can decide: taste, money, scope, publishing, anything on
their machine. Everything else is a ruling the orchestrator makes and records.

Every question carries a recommendation and a default, so silence still moves. Work that
does not depend on the answer proceeds meanwhile.

Say what a number is. A cost estimate from a rate table is not a bill, and asking to spend
money that was never needed reads as sloppy planning.

**Give elapsed time in wall clock, never in internal sizing units.** Builder-days size a
slice; they do not predict a date, and in practice the work lands about an order of
magnitude faster. Anchor any estimate to the project's own tag history. Quoting sizing
units as duration makes the work sound impossible and pushes the owner to cut scope that
did not need cutting.

**Refuse on a dependency, never on caution.** "That cannot be done tonight" needs a reason
that is a real ordering constraint. If the reason is nervousness, it is not a reason.

Correct in public, once, and move on. When the owner says it cannot take eight days,
re-scope and say what changed.

## 11. What it costs when you get it wrong

| Habit | What it costs |
|---|---|
| Clearing the session | The orchestrator, outright. Nothing reliably wakes it |
| A run waiting on its own background job | Its whole context, to produce nothing |
| Trusting a status field | Hours, and you always find out late |
| A timer heartbeat | A full context re-read per tick, for nothing |
| Long-lived specialist sessions | The whole history, on every message, forever |
| A 400-line design doc | Its size times every agent that reads it, each round |
| Two review passes on one draft | The draft again, twice, for diminishing findings |
| The orchestrator reading source | Rented for the rest of that session |
| Re-running a full eval | When a three-fixture subset decides the question |
| A subagent for a one-line lookup | A whole boot to save one grep |
| Measuring the wrong quantity carefully | The whole plan built on it |
| Quoting sizing units as dates | Scope cut that did not need cutting |

The subagent rows cut both ways. Delegate breadth, do single facts yourself.

## 12. First day

1. Write the product decisions doc: what it is, who it is for, what it is not.
2. Split into packages with clear seams, one owning shared types and migrations. Start two.
3. Create the branches, worktrees, a docs branch, package notes, the queue, the record.
4. Write the state file and the resume card. The resume card says what to read and in what
   order; the state file says what is true now.
5. Write the memory file: routing defaults, the queue floor, what the owner has pre-approved.
6. Install the commit hook that runs the cheap rungs and emits one line.
7. Write the spawn helper: it takes a brief, sets model and effort, boots the run from the
   role card and the notes, and writes the report file.
8. Start the orchestrator. Log the first line.
9. Fill the queue to its floor, then release early once on a small named set, to exercise
   the gates before they matter.

## 13. Failures this template is built on

Kept because each one looked correct in advance, and reasoning alone would not have caught
any of them.

**Rotation by clearing.** Two mechanisms were tried. A session-scoped one-shot timer dies
with the clear, so the armed resume never fires. A durable scheduled task survives, fires
on time, and spawns a fresh session, but that session made one tool call, died within
eleven seconds, wrote nothing, never appeared in the session list, and went on reporting
itself as running. Clearing turned into a silent stop three times before the mechanism was
abandoned. §5 is the replacement.

**The silent hang.** A run started background work and then waited to be notified. It
burned its whole context across two reports and twenty-three minutes to produce two tool
calls, while its status said "running". Rule 15 and rule 16 exist for this.

**The careful measurement of the wrong thing.** An evaluation was run properly, with a real
answer key, and it inverted the conclusion. The key contained none of the category the
owner had actually complained about, so a perfect score on it would not have satisfied
them. §9 covers this.

**The citation that was never measured.** A justification for narrowing the work cited
figures from an earlier evaluation. The figures appeared nowhere in that document or in the
repository. Rule 19 exists for this, and it applies hardest to records you wrote yourself.

**The provisional survey believed.** A cheap read-only run returned two wrong facts about
a codebase and they were relayed to the owner as settled. The run that actually modified
the code corrected both. Rule 17 exists for this.
