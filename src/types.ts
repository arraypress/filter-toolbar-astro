/**
 * @module @arraypress/filter-toolbar-astro/types
 */

/**
 * Sort modes the runtime understands. Add a new value here AND add
 * a `case` in `applySort` if you fork the runtime.
 */
export type SortMode =
	| 'featured'
	| 'newest'
	| 'price-asc'
	| 'price-desc'
	| 'name';

/** View toggle — grid tiles vs horizontal rows. */
export type ViewMode = 'grid' | 'list';

/**
 * Pagination UX mode.
 *
 *   - `'paged'`     numbered prev/next + page buttons
 *   - `'load-more'` "Show more" button reveals the next chunk
 *   - `'infinite'`  auto-reveals chunks as the sentinel scrolls into view
 */
export type PaginationMode = 'paged' | 'load-more' | 'infinite';

/** Sort option for the toolbar `<select>`. */
export interface SortOption {
	value: SortMode;
	label: string;
}

/** Default sort options — `featured` first matches conventions. */
export const DEFAULT_SORT_OPTIONS: SortOption[] = [
	{ value: 'featured',   label: 'Featured' },
	{ value: 'newest',     label: 'Newest' },
	{ value: 'price-asc',  label: 'Price: Low to High' },
	{ value: 'price-desc', label: 'Price: High to Low' },
	{ value: 'name',       label: 'Name A→Z' },
];

/**
 * Props for the `<FilterToolbar>` component.
 *
 * The toolbar renders the minimal markup needed for the runtime —
 * a Filters trigger, a results count, a sort `<select>`, and a
 * grid/list toggle. Everything else (the drawer body, chips,
 * price slider, pagination nav) is yours to mount around it.
 */
export interface FilterToolbarProps {
	/** Initial results count (server-rendered). The runtime updates it
	 *  client-side. Optional — toolbar still renders without it. */
	resultsCount?: number;
	/** Override the sort options. Default: `DEFAULT_SORT_OPTIONS`. */
	sortOptions?: SortOption[];
	/** Show the Filters trigger button. Default: `true`. Set `false`
	 *  if you don't have a drawer to open. */
	showFiltersTrigger?: boolean;
	/** Label for the Filters button. Default: `'Filters'`. */
	filtersLabel?: string;
	/** Label after the results count. Default: `'results'`. */
	resultsLabel?: string;
	/** Show the grid/list view toggle. Default: `true`. */
	showViewToggle?: boolean;
	/** Aria-label for the sort `<select>`. Default: `'Sort products'`. */
	sortAriaLabel?: string;
	/** Extra classes appended to the toolbar root. */
	class?: string;
}

/** Selectors the runtime queries. All optional — pass overrides if
 *  your markup uses different ids. */
export interface FilterToolbarSelectors {
	/** Container element with card children. Default `#product-grid`. */
	grid?: string;
	/** Category chip buttons. Default `.chip`. */
	chips?: string;
	/** Toolbar sort `<select>`. Default `#sort-select`. */
	sortSelect?: string;
	/** Drawer sort `<select>` (kept in sync with toolbar). Default `#drawer-sort`. */
	drawerSort?: string;
	/** Empty-state message. Default `#empty-state`. */
	empty?: string;
	/** Grid-view toggle button. Default `#view-grid`. */
	btnGrid?: string;
	/** List-view toggle button. Default `#view-list`. */
	btnList?: string;
	/** Max-price `<input type="range">`. Default `#price-max`. */
	priceInput?: string;
	/** Live `<span>` showing the slider's formatted max. Default `#price-max-value`. */
	priceLabel?: string;
	/** Filter drawer `<aside>`. Default `#filter-drawer`. */
	drawer?: string;
	/** Backdrop behind the drawer. Default `#filter-backdrop`. */
	backdrop?: string;
	/** Toolbar button that opens the drawer. Default `#open-filters`. */
	openBtn?: string;
	/** Close button inside the drawer. Default `#close-filters`. */
	closeBtn?: string;
	/** "Done" button at the bottom of the drawer. Default `#apply-filters`. */
	applyBtn?: string;
	/** "Clear all" button. Default `#clear-filters`. */
	clearBtn?: string;
	/** Live "N results" label. Default `#results-count`. */
	resultsCount?: string;
	/** Pill on the Filters button showing active-filter count. Default `#active-filter-count`. */
	activeFilterBadge?: string;
	/** Pagination `<nav>`. Default `#pagination`. */
	pagination?: string;
	/** Page-number button container. Default `#pagination-pages`. */
	paginationPages?: string;
	/** Previous-page button. Default `#page-prev`. */
	pagePrev?: string;
	/** Next-page button. Default `#page-next`. */
	pageNext?: string;
	/** Load-more button. Default `#load-more`. */
	loadMoreBtn?: string;
	/** Infinite-scroll sentinel. Default `#scroll-sentinel`. */
	sentinel?: string;
	/** Text that shows how many cards the CURRENT selection matches — in
	 *  staged mode, before Apply (e.g. "Show <span id=…>12</span> results"
	 *  on the Apply button); in live mode the same as `resultsCount`.
	 *  Default `#staged-count`. */
	stagedCount?: string;
}

/**
 * A multi-select attribute facet (genre / format / synth / tag / …)
 * layered on top of the built-in single category chip + price slider.
 *
 * The runtime reads a delimited value list off each card's data
 * attribute and shows a card only if — for EVERY facet that has an
 * active selection — the card carries at least one of the selected
 * values (OR within a facet, AND across facets, AND with the category
 * + price filters).
 *
 * Card markup: emit the card's values as space- OR comma-separated
 * tokens, e.g. `data-genre="uplifting-trance progressive-trance"`.
 * Use slugs (no internal spaces) so the tokens parse cleanly. Each
 * facet chip carries `data-value="<token>"`; a chip with
 * `data-value=""` or `data-value="all"` clears that facet.
 */
export interface AttributeFacet {
	/** Stable unique key, e.g. `'genre'`. Used for the active-filter
	 *  count and (when `urlParam` is set) the URL query param. */
	key: string;
	/** The card dataset key holding the token list. `dataKey: 'genre'`
	 *  reads `card.dataset.genre` (the `data-genre` attribute);
	 *  `data-foo-bar` maps to `dataKey: 'fooBar'` the usual way. */
	dataKey: string;
	/** Selector for this facet's chip buttons (each with `data-value`),
	 *  e.g. `'.facet-genre'`. */
	chipSelector: string;
	/** Reflect the active selection into the URL as `?<key>=a,b` and
	 *  restore it on load. Default `false`. */
	urlParam?: boolean;
}

/**
 * A numeric range facet (BPM, year, duration…): two `<input type="range">`
 * elements, one per end, narrow the listing to cards whose value falls
 * inside the range.
 *
 * Card markup: one number (`data-bpm="128"`) or a range of its own
 * (`data-bpm="120-128"`, for a pack spanning tempos). A card matches when
 * its range OVERLAPS the selected one, so a 120–128 pack shows up for a
 * 125–135 search. A card with no value is hidden while the range is
 * narrowed (it can't be said to match) and shown when it's at full width.
 *
 * The facet is inactive while both inputs sit at their own `min`/`max`,
 * so the inputs' bounds ARE the facet's bounds — set them from your data.
 */
export interface RangeFacet {
	/** Stable unique key, e.g. `'bpm'`. Used for the URL query param. */
	key: string;
	/** The card dataset key holding the value: `dataKey: 'bpm'` reads
	 *  `data-bpm`. */
	dataKey: string;
	/** Selector for the low end's `<input type="range">`. */
	minInput: string;
	/** Selector for the high end's `<input type="range">`. */
	maxInput: string;
	/** Selector for an element that shows the selected range as text
	 *  (updated on every input). Optional. */
	output?: string;
	/** Text for `output`. Default `"<lo>–<hi>"`. `full` is true while the
	 *  facet is inactive (both ends at their bounds). */
	format?: (lo: number, hi: number, full: boolean) => string;
	/** Reflect the selection into the URL as `?<key>=lo-hi` and restore it
	 *  on load. Default `false`. */
	urlParam?: boolean;
}

/**
 * A free-text search facet: one `<input>` whose words must ALL appear in a
 * card's text (case- and accent-insensitive, in any order), ANDed with every
 * other facet. The text is read from card data attributes you choose, so the
 * runtime never scrapes rendered markup:
 *
 *   <article data-title="Writing for the web" data-excerpt="…" data-tag="seo design">
 *
 * Typing filters after `debounce` ms; Enter (or submitting the input's
 * `<form>`) filters at once and doesn't navigate. The count updates through
 * `resultsCount`, so a `role="status"` around it announces the result.
 */
export interface SearchFacet {
	/** Selector for the `<input type="search">`. */
	input: string;
	/** Card dataset keys whose text is searched. Default `['title']`
	 *  (`data-title`); e.g. `['title', 'excerpt', 'tag']`. */
	dataKeys?: string[];
	/** URL query param. Default `'q'`. */
	key?: string;
	/** Reflect the query into the URL (`?q=…`) and restore it on load.
	 *  Default `true` — unlike the other facets, because a search is the
	 *  thing people share. */
	urlParam?: boolean;
	/** Milliseconds after the last keystroke before filtering. Default `200`. */
	debounce?: number;
}

/**
 * How selections take effect.
 *
 *   - `'live'`   (default) every change filters the listing at once.
 *   - `'staged'` changes made INSIDE `stagedContainer` (the drawer, by
 *                default) are held until the Apply control (`applyBtn`)
 *                fires. Closing the drawer any other way (close button,
 *                backdrop, Escape) discards them. Clear resets the staged
 *                AND the applied selection at once. Controls outside the
 *                container still filter live.
 */
export type ApplyMode = 'live' | 'staged';

/** The applied selection, as `getFilterToolbar().state()` and the
 *  `filtertoolbar:change` event report it. */
export interface FilterToolbarState {
	/** Cards the applied selection matches. */
	count: number;
	/** Active category chip value (`'all'` when none). */
	category: string;
	/** Active price ceiling, or `null` when the slider is at its max. */
	maxPrice: number | null;
	/** Active sort. */
	sort: SortMode;
	/** The search text (trimmed; `''` when none). */
	query: string;
	/** Selected values per attribute facet key (`[]` when none). */
	facets: Record<string, string[]>;
	/** Narrowed range per range facet key, or `null` at full width. */
	ranges: Record<string, [number, number] | null>;
}

/** Programmatic control over an initialised listing — for UI the runtime
 *  doesn't render itself, e.g. removable "active filter" chips. Changes made
 *  through it apply at once (they're never staged). */
export interface FilterToolbarController {
	/** The applied selection. */
	state(): FilterToolbarState;
	/** Set an attribute facet's selected values (`[]` clears it). */
	setFacet(key: string, values: string[]): void;
	/** Set the search text. */
	setQuery(query: string): void;
	/** Commit staged changes (what the Apply control does, minus closing). */
	apply(): void;
	/** Reset every facet, the search and the sort (what Clear does). */
	clear(): void;
}

/** Constructor options for `initFilterToolbar()`. */
export interface FilterToolbarOptions {
	/** Cards per page. Required. */
	pageSize: number;
	/** Currency symbol for the price-slider label, e.g. `'£'`. Required
	 *  if you wire a price slider; safe to pass `''` otherwise. */
	currencySymbol?: string;
	/** The sort the listing starts in, and the one Clear returns to.
	 *  Default `'featured'`. (The cards are not re-sorted on load: render
	 *  them in this order.) */
	defaultSort?: SortMode;
	/**
	 * Pagination UX mode. Default `'paged'`.
	 */
	paginationMode?: PaginationMode;
	/** Label for the load-more button. Default `'Show more'`. */
	loadMoreLabel?: string;
	/** Selector overrides. */
	selectors?: FilterToolbarSelectors;
	/** localStorage key for the view-mode toggle. Default `'ap-view-mode'`. */
	viewStorageKey?: string;
	/** CSS class added to the grid root for grid view. Default `'fb-grid--grid'`. */
	gridClass?: string;
	/** CSS class added to the grid root for list view. Default `'fb-grid--list'`. */
	listClass?: string;
	/** CSS class used for card children (used by querySelectorAll). Default `'.product-card'`. */
	cardSelector?: string;
	/** Extra multi-select attribute facets (genre / format / synth / …)
	 *  layered on top of the built-in category chip + price slider.
	 *  Default: none — omitting it leaves the existing single-facet
	 *  behaviour completely unchanged. */
	attributeFacets?: AttributeFacet[];
	/** Numeric range facets (BPM / year / …), each a pair of range
	 *  inputs. Default: none. */
	rangeFacets?: RangeFacet[];
	/** A free-text search input. Default: none. */
	search?: SearchFacet;
	/** `'live'` (default) or `'staged'` — see {@link ApplyMode}. */
	apply?: ApplyMode;
	/** In staged mode, the element whose controls are staged. Default: the
	 *  drawer (`selectors.drawer`). */
	stagedContainer?: string;
}

/** Detail of the `filtertoolbar:change` event, fired (bubbling) on the grid
 *  once at init and after every change to the applied selection. */
export type FilterToolbarChangeDetail = FilterToolbarState;
