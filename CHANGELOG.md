# Changelog

All notable changes to this project will be documented in this file.

## [1.4.0] — 2026-10-22

### Added

- **Staged selection** — `apply: 'staged'`. Changes inside the drawer (or
  `stagedContainer`) are held until the Apply button fires; the grid, count,
  badge and URL keep the applied selection meanwhile. Closing the drawer any
  other way (close, backdrop, Escape) discards them and resets the controls.
  Clear resets the staged and applied selection together. Controls outside
  the container stay live. A new `#staged-count` (`selectors.stagedCount`)
  shows how many cards the pending selection matches ("Show 12 results").
- **Text search** — `search: { input, dataKeys, key, urlParam, debounce }`.
  Every word must appear (any order, case- and accent-insensitive) in the
  card attributes listed in `dataKeys` (default `['title']`). Debounced
  (200 ms; Enter filters at once and doesn't submit the form), ANDed with
  every facet, synced to `?q=` by default and restored on load, cleared by
  Clear. Not counted in the filter badge.
- **`filtertoolbar:change`** — a bubbling event on the grid, once at init and
  after every applied change, with the state (`count`, `category`, `sort`,
  `query`, `facets`, `ranges`, `maxPrice`) as `detail`.
- **`getFilterToolbar(grid?)`** — the controller: `state()`, `setFacet()`,
  `setQuery()`, `apply()`, `clear()`. For UI the runtime doesn't draw (e.g.
  removable active-filter chips); its changes apply at once.
- The toolbar's count (`.fb-toolbar-count`) is now `role="status"`, so the
  new count is announced. The runtime only rewrites a count when it changes.

### Fixed

- **Clear resets the sort to `defaultSort`**, not a hard-coded `'featured'`.
  A listing configured with `defaultSort: 'newest'` no longer flips to
  featured order on Clear.
- Clear resets the category even when there's no `data-filter="all"` chip.
- A `?cat=` with no matching chip no longer skips the first render.
- URL updates keep `history.state` (Astro's ClientRouter keeps its own there)
  and the `#hash`, and are skipped when the URL wouldn't change.

### Changed

- Nothing breaking. `apply` defaults to `'live'`; omitting `search` leaves
  behaviour unchanged.

## [1.3.0] — 2026-10-21

### Fixed

- **The closed filter drawer is now `inert`.** The runtime toggled
  `aria-hidden` on the drawer but never `inert`, so a closed drawer's
  chips, selects and buttons stayed in the tab order inside an
  `aria-hidden` subtree (axe `aria-hidden-focus`, WCAG 4.1.2). `inert` now
  moves in lockstep with `aria-hidden`, including the initial closed state
  set at init.
- **Focus management for the drawer.** Opening moves focus into the drawer
  (an `[autofocus]` element, else the first focusable control, else the
  drawer itself), Tab / Shift+Tab are trapped inside it while it's open,
  and closing (close / Done / backdrop / Escape) returns focus to the
  control that opened it, falling back to `#open-filters`.
- Escape is now a no-op while the drawer is closed (it used to re-run the
  close routine on every press). The document key handler unbinds itself
  once a View Transition swaps the drawer out, so soft navs don't stack
  listeners.

### Changed

- **Category chips use `aria-pressed`, not `aria-selected`.** A plain
  `<button>` can't carry `aria-selected` (it's only valid on `tab`,
  `option`, `row`, `gridcell`, `treeitem` …). Chips now get the attribute
  their role allows: no role → `aria-pressed`; `role="tab"` / `"option"` /
  … → `aria-selected` (unchanged for markup that already declares one);
  `role="checkbox"` / `"switch"` / … → `aria-checked`. A stale
  `aria-selected` on a role-less chip is removed at init. `.active` is
  unchanged. Attribute facets follow the same rule. **If you style
  role-less chips with `[aria-selected="true"]`, switch to `.active` or
  `[aria-pressed="true"]`.** Only chips carrying `data-filter` get ARIA
  state, so a `.chip` link elsewhere on the page is left alone.
- The drawer is set closed (`data-open="false"`, `aria-hidden="true"`,
  `inert`) at init unless its markup has `data-open="true"`. It's meant to
  be a slide-in drawer; an always-visible sidebar shouldn't be wired to
  `selectors.drawer`.
- Themes that mirrored `inert` off `data-open` with a MutationObserver can
  drop that workaround (it stays harmless if left in).

## [1.2.0] — 2026-10-08

### Added

- **Numeric range facets** via the new `rangeFacets` option: two
  `<input type="range">` ends narrow the listing to cards whose value falls
  in the window (BPM, year, duration…). A card carries one number
  (`data-bpm="128"`) or a range of its own (`data-bpm="120-128"`) and
  matches when the two OVERLAP. Cards with no value are hidden while the
  range is narrowed. The ends can't cross, an optional `output` element
  shows the selection (custom `format`), a narrowed range counts as one
  active filter, `#clear-filters` resets it, and opt-in `urlParam`
  reflects/restores `?bpm=120-128`.

### Changed

- Nothing breaking — omitting `rangeFacets` leaves behaviour unchanged.

## [1.1.0] — 2026-06-24

### Added

- **Multi-select attribute facets** via the new `attributeFacets` option
  on `initFilterToolbar()`. Layer any number of facets (genre / format /
  synth / tag / …) on top of the built-in category chip + price slider.
  Each facet reads a space/comma-delimited token list off a card data
  attribute (`data-genre`, …) and matches OR within a facet, AND across
  facets. Chips get `.active` + `aria-pressed`, the active-filter badge
  counts selected values, `#clear-filters` resets them, and opt-in
  `urlParam` reflects/restores the selection as `?key=a,b`.
- Runtime unit tests (happy-dom) covering the facet matching logic.

### Changed

- Nothing breaking — omitting `attributeFacets` leaves existing behaviour
  byte-for-byte unchanged.

## [1.0.1] — Unreleased

### Changed

- Widened the `astro` peerDependency to `^6.0.0 || ^7.0.0` for
  Astro 7 readiness. No runtime changes — the component is unaffected by the
  Astro 7 compiler / Vite 8 (Rolldown) upgrade.

## [1.0.0] — Unreleased

### Initial Release

- `<FilterToolbar>` Astro component — Filters trigger, results
  count, sort `<select>`, grid/list view toggle. Ships zero styles,
  exposes `.fb-toolbar*` class hooks only.
- `initFilterToolbar()` runtime — client-side filter / sort /
  paginate over a grid of cards. Three pagination modes:
  `'paged'` (default), `'load-more'`, `'infinite'`. Idempotent —
  safe to bind on both `DOMContentLoaded` and `astro:page-load`.
- Reads card data attributes (`data-category`, `data-price`,
  `data-order`, `data-title`, `data-date`) — does not generate
  or mutate cards itself.
- 5 sort modes: `featured` / `newest` / `price-asc` /
  `price-desc` / `name`.
- Deep-link support — `?cat=bundles` on the URL auto-clicks the
  matching chip on first load.
- localStorage persistence for the grid/list view toggle.
- 11 tests passing under Astro's experimental_AstroContainer.

Zero runtime dependencies.
