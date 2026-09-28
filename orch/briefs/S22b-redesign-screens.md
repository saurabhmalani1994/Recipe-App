# Brief S22b: redesign the remaining screens on the S22a system (app)
From the orchestrator. The owner's verdict (D20) and choices (D21) still apply: gestures "Swipe list items"; look
"Photo-led food magazine"; theme "Follow phone setting". Read orch/reports/S22a.md first (the components, and the
notes for S22b). Reuse app/src/components/ui/* and the tokens; add components only where needed.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/src/` UI only.
Model: strong. Effort: high.

Deliverable:
1 Recipe detail (corpus, fixture and My Recipe views):
  - A full-bleed hero photo (or placeholder) with the title in the serif, and a meta row (cuisine, time,
    serves N with the "(estimated)" note, and a diet badge).
  - A sticky servings stepper plus the Metric/US toggle.
  - Ingredients as a clean checklist, with missing and avoided marks and swaps.
  - Steps as numbered cards.
  - "Method in the video" as a prominent button.
  - A nutrition card labelled "estimate".
  - Actions: star, Add to plan, Make my version.
  - Readable in the kitchen: body at least 17px, and the screen stays awake while the detail is open (a Wake Lock;
    tolerate rejection).
2 Plan: a week view with day cards and meal slots, and a "this week / next week" segmented control. Swipe a
  planned meal left to remove it, with an undo snackbar. The share-ingredient hints read as a subtle note.
3 List (shopping mode): big rows grouped by aisle with sticky aisle headers. Swipe right (or tap) to tick,
  swipe left to delete, with undo. Ticked items collapse into a "Done (n)" section. "Add ticked to kitchen"
  is a clear primary action. Building the list is one tap from Plan.
4 Kitchen: grouped chips or rows by aisle, and swipe to remove with undo. The type-ahead add sits at the top.
5 My Recipes: photo-card grid or list, "New recipe" and "Import from link" as FAB or sheet actions, and the
  editor restyled (ingredient rows with the parse preview, steps as cards).
6 Settings: grouped sections (Servings, Default diet, My kitchen equipment, Ingredients I avoid, Backup), with
  native-feeling rows and switches.
7 Fixes from review of S22a:
  - Home's "Today's pick" prefers course=main.
  - A cuisine tag from cuisine_source='classifier' shows only when confidence >= 0.8; otherwise hide it. The
    corpus has a cuisine_confidence column; if not, report it.
  - No screen shows its title twice.
8 One shared swipe-row primitive (with a pointer-events threshold, a haptic via @capacitor/haptics where
  available, and an accessible non-swipe alternative), plus an undo snackbar component.
Quality gate: the S22a standard. Screenshots of every screen at 412x915, light and dark, and at 360. No
horizontal scroll. Tap targets at least 48dp. The contrast test is extended to any new tokens. Swipe e2e
tests for List tick and delete, Plan remove, and Kitchen remove. Look at every screenshot yourself and fix what
looks off. Keep all tests green.
Checks: scripts/check.sh and e2e (PW_PORT=4332). Report per §6 with the screenshot paths.
