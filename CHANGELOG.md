# Changelog

All notable changes to this project will be documented in this file.

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
