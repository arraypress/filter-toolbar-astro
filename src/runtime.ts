/**
 * @module @arraypress/filter-toolbar-astro/runtime
 *
 * Client-side filter / sort / paginate runtime for a product listing.
 *
 * The runtime reads card data attributes (`data-category`,
 * `data-price`, `data-order`, `data-title`, `data-date`) from
 * existing card markup — it does not generate or mutate cards
 * itself. Render your cards however you like; just carry the data
 * attrs the sort/filter logic needs.
 *
 * ```ts
 * import { initFilterToolbar } from '@arraypress/filter-toolbar-astro/runtime';
 *
 * document.addEventListener('astro:page-load', () => {
 *   initFilterToolbar({
 *     pageSize: 24,
 *     currencySymbol: '£',
 *     paginationMode: 'paged',
 *   });
 * });
 * ```
 *
 * Filtering is live by default; `apply: 'staged'` holds changes made in
 * the drawer until Apply. A `search` input adds a free-text facet. After
 * every applied change the grid fires `filtertoolbar:change`, and
 * `getFilterToolbar()` hands back a controller for UI the runtime doesn't
 * draw.
 *
 * Idempotent — calling twice on the same grid is a no-op (marker
 * is stored on the grid element).
 */

import type {
	AttributeFacet,
	FilterToolbarController,
	FilterToolbarOptions,
	FilterToolbarState,
	RangeFacet,
	FilterToolbarSelectors,
	PaginationMode,
	SortMode,
	ViewMode,
} from './types';

const DEFAULT_SELECTORS: Required<FilterToolbarSelectors> = {
	grid:              '#product-grid',
	chips:             '.chip',
	sortSelect:        '#sort-select',
	drawerSort:        '#drawer-sort',
	empty:             '#empty-state',
	btnGrid:           '#view-grid',
	btnList:           '#view-list',
	priceInput:        '#price-max',
	priceLabel:        '#price-max-value',
	drawer:            '#filter-drawer',
	backdrop:          '#filter-backdrop',
	openBtn:           '#open-filters',
	closeBtn:          '#close-filters',
	applyBtn:          '#apply-filters',
	clearBtn:          '#clear-filters',
	resultsCount:      '#results-count',
	activeFilterBadge: '#active-filter-count',
	pagination:        '#pagination',
	paginationPages:   '#pagination-pages',
	pagePrev:          '#page-prev',
	pageNext:          '#page-next',
	loadMoreBtn:       '#load-more',
	sentinel:          '#scroll-sentinel',
	stagedCount:       '#staged-count',
};

interface InitMarker extends HTMLElement {
	__apFtInit?: boolean;
}

/** Roles whose on/off state ARIA spells `aria-selected`. */
const SELECTED_ROLES = new Set(['tab', 'option', 'row', 'gridcell', 'columnheader', 'rowheader', 'treeitem']);
/** Roles whose on/off state ARIA spells `aria-checked`. */
const CHECKED_ROLES = new Set(['checkbox', 'menuitemcheckbox', 'menuitemradio', 'radio', 'switch']);

/**
 * Reflect a chip's on/off state: the `.active` class, plus the ARIA
 * attribute its role allows. A plain `<button>` gets `aria-pressed` (a
 * toggle button); `aria-selected` is only valid on roles like `tab` /
 * `option`, so a chip that declares one of those keeps it, and a
 * checkbox-like role gets `aria-checked`. A stray `aria-selected` on a
 * role-less chip is removed — it isn't valid there.
 */
function setChipState(chip: HTMLElement, on: boolean): void {
	chip.classList.toggle('active', on);
	const role = (chip.getAttribute('role') ?? '').trim().toLowerCase();
	if (SELECTED_ROLES.has(role)) {
		chip.setAttribute('aria-selected', String(on));
	} else if (CHECKED_ROLES.has(role)) {
		chip.setAttribute('aria-checked', String(on));
	} else {
		chip.removeAttribute('aria-selected');
		chip.setAttribute('aria-pressed', String(on));
	}
}

/** What can take keyboard focus inside the drawer (for the focus trap). */
const FOCUSABLE = [
	'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'summary',
	'[contenteditable]:not([contenteditable="false"])', '[tabindex]',
].join(',');

function focusablesIn(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
		if (el.getAttribute('tabindex') === '-1') return false;
		if (el.closest('[hidden], [inert]')) return false;
		const cs = getComputedStyle(el);
		return cs.display !== 'none' && cs.visibility !== 'hidden';
	});
}

/** Lower-case, accent-free text, so "Café" matches "cafe". */
function fold(text: string): string {
	return text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** One selection: what the listing shows (applied) or what the staged
 *  controls currently say (draft). */
interface FilterState {
	category: string;
	maxPrice: number;
	facets: Map<string, Set<string>>;
	ranges: Map<string, [number, number]>;
	sort: SortMode;
	query: string;
}

function cloneState(s: FilterState): FilterState {
	return {
		category: s.category,
		maxPrice: s.maxPrice,
		facets: new Map([...s.facets].map(([k, v]) => [k, new Set(v)])),
		ranges: new Map([...s.ranges].map(([k, v]) => [k, [v[0], v[1]] as [number, number]])),
		sort: s.sort,
		query: s.query,
	};
}

/** Everything but the sort, as a string — "did the filter change?" */
function filterKey(s: FilterState): string {
	return JSON.stringify([
		s.category,
		s.maxPrice === Infinity ? null : s.maxPrice,
		[...s.facets].map(([k, v]) => [k, [...v].sort()]),
		[...s.ranges],
		s.query,
	]);
}

interface Controlled extends InitMarker {
	__apFt?: FilterToolbarController;
}

/**
 * The controller of an initialised listing, or `null` if `grid` hasn't been
 * through `initFilterToolbar()`. Use it for UI the runtime doesn't draw
 * itself — removable "active filter" chips, a "clear search" link.
 */
export function getFilterToolbar(grid: string | Element = DEFAULT_SELECTORS.grid): FilterToolbarController | null {
	const el = typeof grid === 'string' ? document.querySelector(grid) : grid;
	return (el as Controlled | null)?.__apFt ?? null;
}

/**
 * Wire up the listing page. Returns `true` on first bind, `false`
 * if it bailed (no grid, or grid already initialised).
 */
export function initFilterToolbar(opts: FilterToolbarOptions): boolean {
	const {
		pageSize,
		currencySymbol = '',
		defaultSort = 'featured',
		paginationMode = 'paged',
		loadMoreLabel = 'Show more',
		viewStorageKey = 'ap-view-mode',
		gridClass = 'fb-grid--grid',
		listClass = 'fb-grid--list',
		cardSelector = '.product-card',
		attributeFacets = [],
		rangeFacets = [],
		search,
		apply: applyMode = 'live',
		stagedContainer,
	} = opts;
	const sel = { ...DEFAULT_SELECTORS, ...(opts.selectors ?? {}) };
	const mode: PaginationMode = paginationMode;

	const grid = document.querySelector<Controlled>(sel.grid);
	if (!grid || grid.__apFtInit) return false;
	grid.__apFtInit = true;

	const cards: HTMLElement[] = Array.from(grid.querySelectorAll<HTMLElement>(cardSelector));
	const chips = document.querySelectorAll<HTMLElement>(sel.chips);
	const sortSelect  = document.querySelector<HTMLSelectElement>(sel.sortSelect);
	const drawerSort  = document.querySelector<HTMLSelectElement>(sel.drawerSort);
	const empty       = document.querySelector<HTMLElement>(sel.empty);
	const btnGrid     = document.querySelector<HTMLButtonElement>(sel.btnGrid);
	const btnList     = document.querySelector<HTMLButtonElement>(sel.btnList);
	const priceInput  = document.querySelector<HTMLInputElement>(sel.priceInput);
	const priceLabel  = document.querySelector<HTMLElement>(sel.priceLabel);
	const drawer      = document.querySelector<HTMLElement>(sel.drawer);

	let currentPage = 1;
	let revealedChunks = 1;
	let filteredCards: HTMLElement[] = [];

	function facetTokens(card: HTMLElement, dataKey: string): string[] {
		return (card.dataset[dataKey] ?? '')
			.split(/[,\s]+/)
			.map((s) => s.trim())
			.filter(Boolean);
	}

	// Numeric range facets (BPM / year / …): each holds its two inputs.
	interface RangeState { facet: RangeFacet; lo: HTMLInputElement; hi: HTMLInputElement; out: HTMLElement | null }
	const ranges: RangeState[] = [];
	rangeFacets.forEach((facet) => {
		const lo = document.querySelector<HTMLInputElement>(facet.minInput);
		const hi = document.querySelector<HTMLInputElement>(facet.maxInput);
		if (lo && hi) ranges.push({ facet, lo, hi, out: facet.output ? document.querySelector<HTMLElement>(facet.output) : null });
	});
	/** Narrowed from the inputs' own bounds? */
	const rangeActive = (r: RangeState, lo: number, hi: number): boolean =>
		lo > Number(r.lo.min) || hi < Number(r.hi.max);
	/** A card's value as [min, max]: "128" → [128, 128], "120-128" → [120, 128]. */
	function cardRange(card: HTMLElement, dataKey: string): [number, number] | null {
		const raw = (card.dataset[dataKey] ?? '').trim();
		if (!raw) return null;
		const nums = raw.split(/\s*[-–,]\s*/).map(Number).filter((n) => Number.isFinite(n));
		if (!nums.length) return null;
		return [Math.min(...nums), Math.max(...nums)];
	}

	// Free-text search. Each card's searchable text is folded once, lazily.
	const searchInput = search ? document.querySelector<HTMLInputElement>(search.input) : null;
	const searchKeys = search?.dataKeys?.length ? search.dataKeys : ['title'];
	const searchParam = search?.key ?? 'q';
	const searchInUrl = search?.urlParam !== false;
	const haystacks = new WeakMap<HTMLElement, string>();
	function haystack(card: HTMLElement): string {
		let h = haystacks.get(card);
		if (h === undefined) {
			h = fold(searchKeys.map((k) => card.dataset[k] ?? '').join(' '));
			haystacks.set(card, h);
		}
		return h;
	}
	const termsOf = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean);

	// ---- State ----
	// `applied` is what the listing shows. `draft` is what the controls say:
	// the SAME object in live mode; in staged mode a copy that controls inside
	// the staged container write to, until Apply copies it over.
	const blank = (): FilterState => ({
		category: 'all',
		maxPrice: Infinity,
		facets: new Map(attributeFacets.map((f) => [f.key, new Set<string>()])),
		ranges: new Map(ranges.map((r) => [r.facet.key, [Number(r.lo.min), Number(r.hi.max)] as [number, number]])),
		sort: defaultSort,
		query: '',
	});
	let applied: FilterState = blank();
	// Ranges start wherever the markup put the inputs.
	ranges.forEach((r) => applied.ranges.set(r.facet.key, [Number(r.lo.value), Number(r.hi.value)]));
	const staged = applyMode === 'staged';
	const stageRoot = staged
		? (stagedContainer ? document.querySelector<HTMLElement>(stagedContainer) : drawer)
		: null;
	let draft: FilterState = applied;
	/** Is this control's change held for Apply? */
	const isStaged = (el: Element | null): boolean => !!(stageRoot && el && stageRoot.contains(el));
	/** The state a control displays. */
	const stateFor = (el: Element | null): FilterState => (isStaged(el) ? draft : applied);

	function matches(card: HTMLElement, s: FilterState, terms: string[]): boolean {
		const cat = card.dataset.category ?? '';
		const price = Number(card.dataset.price ?? 0);
		if (s.category !== 'all' && cat !== s.category) return false;
		if (!(price <= s.maxPrice)) return false;
		// Every active facet must match (AND across facets); within a
		// facet the card needs at least one selected token (OR).
		for (const facet of attributeFacets) {
			const set = s.facets.get(facet.key);
			if (set && set.size > 0 && !facetTokens(card, facet.dataKey).some((v) => set.has(v))) return false;
		}
		// Every narrowed range must overlap the card's own range.
		for (const r of ranges) {
			const [lo, hi] = s.ranges.get(r.facet.key) ?? [Number(r.lo.min), Number(r.hi.max)];
			if (!rangeActive(r, lo, hi)) continue;
			const v = cardRange(card, r.facet.dataKey);
			if (v === null || v[0] > hi || v[1] < lo) return false;
		}
		// Every word of the query must appear somewhere in the card's text.
		if (terms.length) {
			const h = haystack(card);
			if (!terms.every((t) => h.includes(t))) return false;
		}
		return true;
	}

	function recomputeFilter(): void {
		const terms = termsOf(applied.query);
		filteredCards = cards.filter((card) => matches(card, applied, terms));
	}

	function applyFilter(resetPage = true): void {
		recomputeFilter();
		if (resetPage) {
			currentPage = 1;
			revealedChunks = 1;
		}
		if (empty) empty.hidden = filteredCards.length > 0;
		renderPagination();
		updateToolbarCounts();
	}

	function setText(el: HTMLElement | null, text: string): void {
		// Only on change: rewriting a live region's text re-announces it.
		if (el && el.textContent !== text) el.textContent = text;
	}

	function updateToolbarCounts(): void {
		setText(document.querySelector<HTMLElement>(sel.resultsCount), String(filteredCards.length));
		const badgeEl = document.querySelector<HTMLElement>(sel.activeFilterBadge);
		let active = 0;
		if (applied.category !== 'all') active++;
		if (applied.maxPrice !== Infinity) active++;
		applied.facets.forEach((set) => { active += set.size; });
		ranges.forEach((r) => {
			const [lo, hi] = applied.ranges.get(r.facet.key)!;
			if (rangeActive(r, lo, hi)) active++;
		});
		if (badgeEl) {
			badgeEl.textContent = String(active);
			badgeEl.hidden = active === 0;
		}
	}

	/** How many cards the draft would show — "Show 12 results" on Apply. */
	function renderStagedCount(): void {
		const el = document.querySelector<HTMLElement>(sel.stagedCount);
		if (!el) return;
		const n = draft === applied
			? filteredCards.length
			: cards.filter((card) => matches(card, draft, termsOf(draft.query))).length;
		setText(el, String(n));
	}

	function renderPagination(): void {
		const total = filteredCards.length;
		const totalPages = Math.max(1, Math.ceil(total / pageSize));
		let visibleSet: Set<HTMLElement>;
		if (mode === 'paged') {
			if (currentPage > totalPages) currentPage = totalPages;
			const start = (currentPage - 1) * pageSize;
			visibleSet = new Set(filteredCards.slice(start, start + pageSize));
		} else {
			const revealed = Math.min(total, pageSize * revealedChunks);
			visibleSet = new Set(filteredCards.slice(0, revealed));
		}
		const filterSet = new Set(filteredCards);
		cards.forEach((card) => {
			if (!filterSet.has(card)) card.style.display = 'none';
			else card.style.display = visibleSet.has(card) ? '' : 'none';
		});
		if (mode === 'paged') renderPaginationControls(totalPages);
		else renderLoadMoreControl();
	}

	function renderLoadMoreControl(): void {
		const btn = document.querySelector<HTMLButtonElement>(sel.loadMoreBtn);
		const sentinel = document.querySelector<HTMLElement>(sel.sentinel);
		const total = filteredCards.length;
		const revealed = Math.min(total, pageSize * revealedChunks);
		const more = revealed < total;
		const nav = document.querySelector<HTMLElement>(sel.pagination);
		if (nav) nav.hidden = true;
		if (btn) {
			btn.hidden = !more || mode === 'infinite';
			btn.textContent = loadMoreLabel;
		}
		if (sentinel) sentinel.hidden = !more || mode !== 'infinite';
	}

	function renderPaginationControls(totalPages: number): void {
		const pagesEl = document.querySelector<HTMLElement>(sel.paginationPages);
		const nav     = document.querySelector<HTMLElement>(sel.pagination);
		const prev    = document.querySelector<HTMLButtonElement>(sel.pagePrev);
		const next    = document.querySelector<HTMLButtonElement>(sel.pageNext);
		if (!pagesEl || !nav) return;
		nav.hidden = totalPages <= 1;
		pagesEl.innerHTML = '';
		const addBtn = (page: number | '…', active = false): void => {
			if (page === '…') {
				const span = document.createElement('span');
				span.className = 'pagination-ellipsis';
				span.textContent = '…';
				pagesEl.appendChild(span);
				return;
			}
			const btn = document.createElement('button');
			btn.className = 'pagination-page' + (active ? ' active' : '');
			btn.textContent = String(page);
			btn.setAttribute('aria-current', active ? 'page' : 'false');
			btn.addEventListener('click', () => {
				currentPage = Number(page);
				renderPagination();
				document.querySelector(sel.grid)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			});
			pagesEl.appendChild(btn);
		};
		const win = 1;
		const seen = new Set<number>();
		const push = (p: number): void => {
			if (p < 1 || p > totalPages || seen.has(p)) return;
			seen.add(p);
		};
		push(1);
		for (let p = currentPage - win; p <= currentPage + win; p++) push(p);
		push(totalPages);
		const sorted = [...seen].sort((a, b) => a - b);
		const final: Array<number | '…'> = [];
		for (let i = 0; i < sorted.length; i++) {
			final.push(sorted[i]);
			if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) final.push('…');
		}
		final.forEach((p) => addBtn(p, p === currentPage));
		if (prev) prev.disabled = currentPage <= 1;
		if (next) next.disabled = currentPage >= totalPages;
	}

	document.querySelector<HTMLButtonElement>(sel.pagePrev)?.addEventListener('click', () => {
		if (currentPage > 1) {
			currentPage--;
			renderPagination();
			document.querySelector(sel.grid)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});
	document.querySelector<HTMLButtonElement>(sel.pageNext)?.addEventListener('click', () => {
		const total = Math.ceil(filteredCards.length / pageSize);
		if (currentPage < total) {
			currentPage++;
			renderPagination();
			document.querySelector(sel.grid)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	});

	document.querySelector<HTMLButtonElement>(sel.loadMoreBtn)?.addEventListener('click', () => {
		const total = filteredCards.length;
		const revealed = pageSize * revealedChunks;
		if (revealed < total) {
			revealedChunks++;
			renderPagination();
		}
	});

	if (mode === 'infinite' && 'IntersectionObserver' in window) {
		const sentinelEl = document.querySelector<HTMLElement>(sel.sentinel);
		if (sentinelEl) {
			const io = new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						if (!e.isIntersecting) continue;
						const total = filteredCards.length;
						const revealed = pageSize * revealedChunks;
						if (revealed < total) {
							revealedChunks++;
							renderPagination();
						}
					}
				},
				{ rootMargin: '300px 0px' },
			);
			io.observe(sentinelEl);
		}
	}

	/** Re-order the cards in the DOM by the applied sort. */
	function reorder(): void {
		if (!grid) return;
		cards.length = 0;
		const allCards = Array.from(grid.querySelectorAll<HTMLElement>(cardSelector));
		cards.push(...allCards);
		const sorted = [...cards].sort((a, b) => {
			const pa = Number(a.dataset.price ?? 0);
			const pb = Number(b.dataset.price ?? 0);
			const oa = Number(a.dataset.order ?? 100);
			const ob = Number(b.dataset.order ?? 100);
			const na = a.dataset.title ?? '';
			const nb = b.dataset.title ?? '';
			const da = a.dataset.date ? Date.parse(a.dataset.date) : 0;
			const db = b.dataset.date ? Date.parse(b.dataset.date) : 0;
			switch (applied.sort) {
				case 'newest':     return db - da;
				case 'price-asc':  return pa - pb;
				case 'price-desc': return pb - pa;
				case 'name':       return na.localeCompare(nb);
				default:           return oa - ob;
			}
		});
		const frag = document.createDocumentFragment();
		sorted.forEach((c) => frag.appendChild(c));
		grid.appendChild(frag);
		cards.length = 0;
		cards.push(...sorted);
	}

	// ---- URL ----
	function syncUrl(): void {
		const params = new URLSearchParams(location.search);
		let touched = false;
		attributeFacets.forEach((facet) => {
			if (!facet.urlParam) return;
			touched = true;
			const set = applied.facets.get(facet.key);
			if (set && set.size > 0) params.set(facet.key, [...set].join(','));
			else params.delete(facet.key);
		});
		ranges.forEach((r) => {
			if (!r.facet.urlParam) return;
			touched = true;
			const [lo, hi] = applied.ranges.get(r.facet.key)!;
			if (rangeActive(r, lo, hi)) params.set(r.facet.key, `${lo}-${hi}`);
			else params.delete(r.facet.key);
		});
		if (searchInput && searchInUrl) {
			touched = true;
			if (applied.query) params.set(searchParam, applied.query);
			else params.delete(searchParam);
		}
		if (!touched) return;
		const qs = params.toString();
		const url = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
		// Keep history.state: a router (Astro's ClientRouter) keeps its own there.
		if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', url);
	}

	// ---- Reporting ----
	function snapshot(): FilterToolbarState {
		const facets: Record<string, string[]> = {};
		applied.facets.forEach((set, key) => { facets[key] = [...set]; });
		const rangeOut: Record<string, [number, number] | null> = {};
		ranges.forEach((r) => {
			const [lo, hi] = applied.ranges.get(r.facet.key)!;
			rangeOut[r.facet.key] = rangeActive(r, lo, hi) ? [lo, hi] : null;
		});
		return {
			count: filteredCards.length,
			category: applied.category,
			maxPrice: applied.maxPrice === Infinity ? null : applied.maxPrice,
			sort: applied.sort,
			query: applied.query,
			facets,
			ranges: rangeOut,
		};
	}
	function emit(): void {
		grid?.dispatchEvent(new CustomEvent<FilterToolbarState>('filtertoolbar:change', { bubbles: true, detail: snapshot() }));
	}

	/** After `applied` changed: re-sort if needed, re-filter, sync URL, report.
	 *  A sort-only change keeps the page; anything else goes back to page 1. */
	function refresh(before: FilterState): void {
		const sorted = before.sort !== applied.sort;
		const filtered = filterKey(before) !== filterKey(applied);
		if (sorted) reorder();
		applyFilter(filtered || !sorted);
		syncUrl();
		renderStagedCount();
		emit();
	}

	/**
	 * Apply one change from `control`. Inside the staged container it only
	 * updates the draft. Anywhere else it applies at once — and to the draft
	 * too, so a later Apply doesn't undo it. `set` must be an assignment
	 * (it may run twice, once per state).
	 */
	function change(control: Element | null, set: (s: FilterState) => void): void {
		if (isStaged(control)) {
			set(draft);
		} else {
			const before = cloneState(applied);
			set(applied);
			if (draft !== applied) set(draft);
			refresh(before);
		}
		renderControls();
		renderStagedCount();
	}

	// ---- Controls ----
	function renderRange(r: RangeState, lo: number, hi: number): void {
		if (!r.out) return;
		setText(r.out, r.facet.format ? r.facet.format(lo, hi, !rangeActive(r, lo, hi)) : `${lo}–${hi}`);
	}
	function priceText(v: number): string {
		return v >= Number(priceInput?.max) ? `${currencySymbol}${v}+` : `${currencySymbol}${v}`;
	}

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	/** Make every control show its state (draft inside the staged container,
	 *  applied elsewhere). Writes only what differs. */
	function renderControls(forceLabels = false): void {
		chips.forEach((c) => {
			if (c.hasAttribute('data-filter')) setChipState(c, c.dataset.filter === stateFor(c).category);
		});
		attributeFacets.forEach((facet) => {
			document.querySelectorAll<HTMLElement>(facet.chipSelector).forEach((c) => {
				setChipState(c, stateFor(c).facets.get(facet.key)?.has(c.dataset.value ?? '') ?? false);
			});
		});
		ranges.forEach((r) => {
			const [lo, hi] = stateFor(r.lo).ranges.get(r.facet.key)!;
			if (r.lo.value !== String(lo)) r.lo.value = String(lo);
			if (r.hi.value !== String(hi)) r.hi.value = String(hi);
			renderRange(r, lo, hi);
		});
		if (priceInput) {
			const max = stateFor(priceInput).maxPrice;
			const value = max === Infinity ? priceInput.max : String(max);
			if (forceLabels || priceInput.value !== value) {
				priceInput.value = value;
				if (priceLabel) priceLabel.textContent = priceText(Number(value));
			}
		}
		[sortSelect, drawerSort].forEach((s) => {
			if (!s) return;
			const v = stateFor(s).sort;
			if (s.value !== v) s.value = v;
		});
		// Don't overwrite what someone is still typing.
		if (searchInput && searchTimer === undefined) {
			const q = stateFor(searchInput).query;
			if (searchInput.value.trim() !== q) searchInput.value = q;
		}
	}

	// Category chips. Only chips carrying `data-filter` get ARIA state (a
	// `.chip` link elsewhere on the page only has its class toggled). Sync
	// the server-rendered state now so a stale `aria-selected` on a plain
	// button is replaced before anyone clicks.
	const markChip = (c: HTMLElement, on: boolean): void => {
		if (c.hasAttribute('data-filter')) setChipState(c, on);
		else c.classList.toggle('active', on);
	};
	chips.forEach((c) => { if (c.hasAttribute('data-filter')) setChipState(c, c.classList.contains('active')); });
	chips.forEach((chip) => {
		chip.addEventListener('click', () => {
			const f = chip.dataset.filter ?? 'all';
			chips.forEach((c) => markChip(c, c.dataset.filter === f));
			change(chip, (s) => { s.category = f; });
		});
	});

	// ---- Multi-select attribute facets (genre / format / synth / …) ----
	function wireFacet(facet: AttributeFacet): void {
		document.querySelectorAll<HTMLElement>(facet.chipSelector).forEach((chip) => {
			chip.addEventListener('click', () => {
				const val = chip.dataset.value ?? '';
				const next = new Set(stateFor(chip).facets.get(facet.key));
				if (val === '' || val === 'all') next.clear();
				else if (next.has(val)) next.delete(val);
				else next.add(val);
				change(chip, (s) => { s.facets.set(facet.key, new Set(next)); });
			});
		});
	}
	attributeFacets.forEach(wireFacet);

	// ---- Numeric range facets ----
	ranges.forEach((r) => {
		const onInput = (moved: 'lo' | 'hi'): void => {
			// The ends can't cross: the one being dragged stops at the other.
			if (Number(r.lo.value) > Number(r.hi.value)) {
				if (moved === 'lo') r.lo.value = r.hi.value;
				else r.hi.value = r.lo.value;
			}
			const lo = Number(r.lo.value);
			const hi = Number(r.hi.value);
			renderRange(r, lo, hi);
			change(r.lo, (s) => { s.ranges.set(r.facet.key, [lo, hi]); });
		};
		r.lo.addEventListener('input', () => onInput('lo'));
		r.hi.addEventListener('input', () => onInput('hi'));
		const [lo, hi] = applied.ranges.get(r.facet.key)!;
		renderRange(r, lo, hi);
	});

	// ---- Sort ----
	sortSelect?.addEventListener('change', () => change(sortSelect, (s) => { s.sort = sortSelect.value as SortMode; }));
	drawerSort?.addEventListener('change', () => change(drawerSort, (s) => { s.sort = drawerSort.value as SortMode; }));

	// ---- Price ----
	priceInput?.addEventListener('input', () => {
		const v = Number(priceInput.value);
		if (priceLabel) priceLabel.textContent = priceText(v);
		const max = v >= Number(priceInput.max) ? Infinity : v;
		change(priceInput, (s) => { s.maxPrice = max; });
	});

	// ---- Search ----
	function runSearch(): void {
		if (!searchInput) return;
		if (searchTimer !== undefined) clearTimeout(searchTimer);
		searchTimer = undefined;
		const q = searchInput.value.trim();
		if (q === stateFor(searchInput).query) return;
		change(searchInput, (s) => { s.query = q; });
	}
	if (searchInput) {
		const wait = Math.max(0, search?.debounce ?? 200);
		searchInput.addEventListener('input', () => {
			if (searchTimer !== undefined) clearTimeout(searchTimer);
			searchTimer = setTimeout(runSearch, wait);
		});
		searchInput.addEventListener('keydown', (e) => {
			if (e.key !== 'Enter') return;
			e.preventDefault(); // filter here; don't submit the form
			runSearch();
		});
		searchInput.form?.addEventListener('submit', (e) => {
			e.preventDefault();
			runSearch();
		});
	}

	// ---- Staged apply ----
	/** Commit the draft (what the Apply control does). */
	function commit(): void {
		if (!staged) return;
		if (searchTimer !== undefined && isStaged(searchInput)) runSearch();
		const before = applied;
		applied = cloneState(draft);
		refresh(before);
		renderControls();
	}
	/** Throw the draft away: the staged controls go back to the applied state. */
	function revert(): void {
		if (!staged) return;
		if (isStaged(searchInput) && searchTimer !== undefined) {
			clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		draft = cloneState(applied);
		renderControls(true);
		renderStagedCount();
	}
	/** Reset everything, staged and applied, and the sort to `defaultSort`. */
	function clearAll(): void {
		if (searchTimer !== undefined) clearTimeout(searchTimer);
		searchTimer = undefined;
		const before = applied;
		applied = blank();
		draft = staged ? cloneState(applied) : applied;
		refresh(before);
		renderControls(true);
	}
	if (staged) draft = cloneState(applied);

	const backdrop = document.querySelector<HTMLElement>(sel.backdrop);
	const openBtn  = document.querySelector<HTMLButtonElement>(sel.openBtn);
	const closeBtn = document.querySelector<HTMLButtonElement>(sel.closeBtn);
	const applyBtn = document.querySelector<HTMLButtonElement>(sel.applyBtn);
	const clearBtn = document.querySelector<HTMLButtonElement>(sel.clearBtn);

	// ---- Filter drawer ----
	// `data-open` is the source of truth. `aria-hidden` and `inert` move in
	// lockstep with it, so a closed drawer's controls are out of the tab
	// order as well as the accessibility tree (axe `aria-hidden-focus`).
	// While open, focus is moved in and trapped; on close it returns to
	// whatever opened the drawer. In staged mode, closing without Apply
	// discards what was staged.
	let returnFocus: HTMLElement | null = null;
	const isOpen = (): boolean => drawer?.dataset.open === 'true';

	function setDrawerState(open: boolean): void {
		if (drawer) {
			drawer.dataset.open = String(open);
			drawer.setAttribute('aria-hidden', String(!open));
			drawer.toggleAttribute('inert', !open);
		}
		if (backdrop) backdrop.dataset.open = String(open);
		openBtn?.setAttribute('aria-expanded', String(open));
		document.body.classList.toggle('drawer-open', open);
	}
	function openDrawer(): void {
		if (!drawer || isOpen()) return;
		const active = document.activeElement;
		returnFocus = active instanceof HTMLElement && active !== document.body && !drawer.contains(active)
			? active
			: openBtn;
		setDrawerState(true);
		const target = drawer.querySelector<HTMLElement>('[autofocus]') ?? focusablesIn(drawer)[0] ?? drawer;
		if (target === drawer && !drawer.hasAttribute('tabindex')) drawer.setAttribute('tabindex', '-1');
		target.focus({ preventScroll: true });
	}
	function closeDrawer(): void {
		if (!drawer || !isOpen()) return;
		revert();
		setDrawerState(false);
		const to = returnFocus?.isConnected ? returnFocus : openBtn;
		returnFocus = null;
		const active = document.activeElement;
		if (!active || active === document.body || drawer.contains(active)) to?.focus({ preventScroll: true });
	}
	// Initial state: closed unless the markup says otherwise.
	if (drawer) setDrawerState(isOpen());

	openBtn?.addEventListener('click', openDrawer);
	closeBtn?.addEventListener('click', closeDrawer);
	backdrop?.addEventListener('click', closeDrawer);
	applyBtn?.addEventListener('click', () => {
		commit();
		closeDrawer();
	});
	if (drawer) {
		// One document listener per drawer; it unbinds itself once a View
		// Transition swaps the drawer out, so soft navs don't stack traps.
		const ac = new AbortController();
		document.addEventListener('keydown', (e) => {
			if (!drawer.isConnected) { ac.abort(); return; }
			if (!isOpen()) return;
			if (e.key === 'Escape') { closeDrawer(); return; }
			if (e.key !== 'Tab') return;
			const items = focusablesIn(drawer);
			const active = document.activeElement;
			if (!items.length) { e.preventDefault(); drawer.focus(); return; }
			const first = items[0];
			const last = items[items.length - 1];
			if (!active || !drawer.contains(active)) {
				e.preventDefault();
				(e.shiftKey ? last : first).focus();
			} else if (e.shiftKey && (active === first || active === drawer)) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}, { signal: ac.signal });
	}

	clearBtn?.addEventListener('click', clearAll);

	function applyView(view: ViewMode): void {
		grid?.classList.toggle(gridClass, view === 'grid');
		grid?.classList.toggle(listClass, view === 'list');
		btnGrid?.classList.toggle('active', view === 'grid');
		btnList?.classList.toggle('active', view === 'list');
		try { localStorage.setItem(viewStorageKey, view); } catch { /* ignore */ }
	}
	btnGrid?.addEventListener('click', () => applyView('grid'));
	btnList?.addEventListener('click', () => applyView('list'));
	try {
		const saved = localStorage.getItem(viewStorageKey);
		if (saved === 'grid' || saved === 'list') applyView(saved);
	} catch { /* ignore */ }

	// ---- Restore from the URL (into both states), then first render ----
	const params = new URLSearchParams(location.search);
	attributeFacets.forEach((facet) => {
		if (!facet.urlParam) return;
		const raw = params.get(facet.key);
		if (!raw) return;
		const set = applied.facets.get(facet.key)!;
		raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((v) => set.add(v));
		document.querySelectorAll<HTMLElement>(facet.chipSelector).forEach((chip) => {
			setChipState(chip, set.has(chip.dataset.value ?? ''));
		});
	});
	// `?bpm=120-130`
	ranges.forEach((r) => {
		if (!r.facet.urlParam) return;
		const m = (params.get(r.facet.key) ?? '').match(/^(-?[\d.]+)-(-?[\d.]+)$/);
		if (!m) return;
		r.lo.value = String(Math.min(Number(m[1]), Number(m[2])));
		r.hi.value = String(Math.max(Number(m[1]), Number(m[2])));
		const lo = Number(r.lo.value);
		const hi = Number(r.hi.value);
		applied.ranges.set(r.facet.key, [lo, hi]);
		renderRange(r, lo, hi);
	});
	// `?q=…`
	if (searchInput && searchInUrl) {
		const q = (params.get(searchParam) ?? '').trim();
		if (q) {
			applied.query = q;
			searchInput.value = q;
		}
	}
	// `?cat=bundles` selects that category chip.
	const initialCat = params.get('cat');
	if (initialCat) {
		const chip = Array.from(chips).find((c) => c.dataset.filter === initialCat);
		if (chip) {
			chips.forEach((c) => markChip(c, c.dataset.filter === initialCat));
			applied.category = initialCat;
		}
	}
	if (staged) draft = cloneState(applied);
	applyFilter();
	renderStagedCount();

	grid.__apFt = {
		state: snapshot,
		setFacet(key, values) {
			if (!applied.facets.has(key)) return;
			change(null, (s) => { s.facets.set(key, new Set(values)); });
		},
		setQuery(query) {
			if (searchTimer !== undefined) clearTimeout(searchTimer);
			searchTimer = undefined;
			const q = query.trim();
			change(null, (s) => { s.query = q; });
		},
		apply() {
			commit();
		},
		clear: clearAll,
	};
	emit();

	return true;
}
