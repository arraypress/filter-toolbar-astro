# @arraypress/filter-toolbar-astro

> Astro listing toolbar — sort + grid/list view toggle + results
> count, with a client-side filter / sort / paginate runtime (paged,
> load-more, or infinite-scroll).

## Install

```bash
npm install @arraypress/filter-toolbar-astro
```

## Use

```astro
---
import { FilterToolbar } from '@arraypress/filter-toolbar-astro';
---
<FilterToolbar resultsCount={products.length} />

<div id="product-grid" class="fb-grid fb-grid--grid">
  {products.map((p) => <ProductCard product={p} />)}
</div>

<script>
  import { initFilterToolbar } from '@arraypress/filter-toolbar-astro/runtime';

  document.addEventListener('astro:page-load', () => {
    initFilterToolbar({
      pageSize: 24,
      currencySymbol: '£',
      paginationMode: 'paged',     // | 'load-more' | 'infinite'
    });
  });
</script>
```

## DOM contract

Cards need data attributes the runtime reads. These are the keys
sort/filter logic looks at:

```html
<article
  class="product-card"
  data-category="bundles"
  data-price="49.99"
  data-order="3"
  data-title="Future Bass Vol. 1"
  data-date="2026-04-12"
>
  …
</article>
```

The toolbar component covers:
- `#open-filters` — drawer trigger (with `#active-filter-count` badge)
- `#results-count` — live count label
- `#sort-select` — sort dropdown
- `#view-grid` / `#view-list` — view toggle

You provide the rest of the markup the runtime expects, with these
default ids/classes:

| Surface             | Default selector             | Purpose                        |
|---------------------|------------------------------|--------------------------------|
| Grid container      | `#product-grid`              | Wrapper for `.product-card`s   |
| Category chips      | `.chip[data-filter="…"]`     | Buttons that filter by category|
| Filter drawer       | `#filter-drawer`             | Slide-in drawer body           |
| Backdrop            | `#filter-backdrop`           | Click-to-close                 |
| Drawer close btn    | `#close-filters`             |                                |
| Drawer apply btn    | `#apply-filters`             |                                |
| Drawer clear btn    | `#clear-filters`             |                                |
| Empty state         | `#empty-state`               | Shown when no cards match      |
| Price slider        | `#price-max` + `#price-max-value` |                           |
| Paged controls      | `#pagination`, `#pagination-pages`, `#page-prev`, `#page-next` | |
| Load-more button    | `#load-more`                 |                                |
| Infinite sentinel   | `#scroll-sentinel`           |                                |

Override any of these via `selectors` if your markup uses different
ids.

## Pagination modes

- **`'paged'`** (default) — numbered prev/next + page buttons.
- **`'load-more'`** — "Show more" button reveals the next chunk on
  click.
- **`'infinite'`** — auto-reveals chunks as `#scroll-sentinel` enters
  the viewport (300px rootMargin).

## Sort modes

Five built-ins, sorted by reading these card attributes:

| Mode         | Read from         |
|--------------|-------------------|
| `featured`   | `data-order` (asc) |
| `newest`     | `data-date` (desc) |
| `price-asc`  | `data-price` (asc) |
| `price-desc` | `data-price` (desc)|
| `name`       | `data-title` (locale-aware A→Z) |

## Toolbar props

| Prop                  | Default               | Description                                                |
|-----------------------|-----------------------|------------------------------------------------------------|
| `resultsCount`        | `''`                  | Initial server-rendered count. Runtime updates it.         |
| `sortOptions`         | `DEFAULT_SORT_OPTIONS`| Custom sort dropdown options.                              |
| `showFiltersTrigger`  | `true`                | Render the Filters button.                                 |
| `filtersLabel`        | `'Filters'`           |                                                            |
| `resultsLabel`        | `'results'`           |                                                            |
| `showViewToggle`      | `true`                | Render the grid/list toggle.                               |
| `sortAriaLabel`       | `'Sort products'`     | aria-label for the `<select>`.                             |
| `class`               | —                     | Extra classes on the toolbar root.                         |

## Runtime options

```ts
initFilterToolbar({
  pageSize: 24,                       // required
  currencySymbol: '£',                // for the price-slider label
  defaultSort: 'featured',
  paginationMode: 'paged',
  loadMoreLabel: 'Show more',
  viewStorageKey: 'ap-view-mode',
  gridClass: 'fb-grid--grid',
  listClass: 'fb-grid--list',
  cardSelector: '.product-card',
  selectors: { /* override any of the default ids */ },
});
```

Idempotent — calling twice on the same `#product-grid` is a no-op.
Safe to fire from both `DOMContentLoaded` and `astro:page-load`.

## Deep-linking

`?cat=bundles` on the URL auto-clicks the matching chip on first
load, so `/products?cat=bundles` lands users straight on the filtered
view.

## Styling

The toolbar ships **no styles** — it emits class hooks only:

```
.fb-toolbar
.fb-toolbar-filters, .fb-toolbar-filters-label, .fb-toolbar-active-badge
.fb-toolbar-count, .fb-toolbar-count-num, .fb-toolbar-count-label
.fb-toolbar-right
.fb-toolbar-sort, .fb-toolbar-sort-icon, .fb-toolbar-sort-select
.fb-toolbar-view, .fb-toolbar-view-btn (`.active` when picked)
```

## License

MIT
