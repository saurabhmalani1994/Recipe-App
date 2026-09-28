# Brief S22a: redesign — design system, shell, Home and Cook (app)
From the orchestrator. The owner, verbatim (D20): "the UI looks very unpolished, the vegetarian no red meat extra tab takes
too much space and does not need to be on every screen or always there. No swipe gestures work. This is a very
unfinished and clunky looking app." Choices (D21): diet switch as a "Filter chip in Cook & Home", with the default in
Settings; gestures "Swipe list items" and "Swipe between tabs"; look "Photo-led food magazine"; theme "Follow phone
setting". Judgement is the product here: the bar is that the owner would call it polished.
Base: claude/funny-thompson-jcmpox HEAD. Scope: `app/src/` UI (components, routes Home and Cook, the shell, styles,
the diet state). S21 is editing app/src/db/ and the CI workflow; do not touch those. S22b does the remaining screens
after you, reusing your components.
Model: strong. Effort: high.

Deliverable:
1 A design system in code: tokens for colour (a food-magazine palette, designed properly for light AND dark,
  following the phone), type (a characterful serif for display and titles, a highly legible sans for UI; bundle the
  fonts locally, since the app works offline), a spacing scale, radii, elevation and motion, with
  prefers-reduced-motion respected. Components: RecipeCard (photo-led; image_url when online, a tasteful
  cuisine-coloured placeholder with the dish initial when there is no image or no network; lazy-loaded), Chip or
  FilterChip, a ChipRow that scrolls horizontally, Section headers, BottomSheet (for filters), EmptyState, Skeleton
  loaders, and TopBar (compact, collapsing on scroll).
2 Shell: remove the global diet bar. A compact top bar (title plus settings). A bottom nav with proper icons (an inline
  SVG icon set, not emoji), 64dp tall, with safe-area insets. Swipe left or right between the 5 tabs, with a
  horizontal pager whose transition follows the finger, without breaking vertical scroll or horizontal chip rows.
  Android back navigation keeps working (S21 adds the listener; do not duplicate it).
3 The diet preset becomes a "Diet" FilterChip on Home and Cook, opening a small sheet: Everything / Vegetarian / No
  red meat. The default comes from Settings (keep the existing settings key). The chip shows the active state
  clearly.
4 Home: a magazine layout. A hero card (today's pick), then the 4 rows as horizontal photo carousels with good
  titles, "Surprise me" as a real button, and loading skeletons. Cook: the ingredient chips, then filter chips
  (Diet, Cuisine, Time, One pot, Equipment) opening sheets, then results as photo cards with "You have 7 of 9" and
  "Missing: fish sauce → soy sauce + nori" styled clearly.
5 Quality gate: Playwright screenshots of Home and Cook at 412x915 in light and dark, and at 360 wide. No horizontal
  page scroll. Tap targets at least 48dp. A contrast check (text on surfaces at least 4.5:1) as a unit test over the
  tokens. Look at every screenshot yourself before reporting, and fix what looks off. Report the screenshots' paths.
  Keep all existing tests green (update selectors where the UI legitimately changed).
Checks: scripts/check.sh and e2e (PW_PORT=4331). Report per §6.
