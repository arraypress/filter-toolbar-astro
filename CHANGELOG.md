# Changelog

All notable changes to this project will be documented in this file.

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
