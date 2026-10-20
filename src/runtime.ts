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
 * Idempotent — calling twice on the same grid is a no-op (marker
 * is stored on the grid element).
 */

import type {
	AttributeFacet,
	FilterToolbarOptions,
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
	} = opts;
	const sel = { ...DEFAULT_SELECTORS, ...(opts.selectors ?? {}) };
	const mode: PaginationMode = paginationMode;

	const grid = document.querySelector<InitMarker>(sel.grid);
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

	let activeFilter = 'all';
	let activeSort: SortMode = defaultSort;
	let maxPrice = Infinity;
	let currentPage = 1;
	let revealedChunks = 1;
	let filteredCards: HTMLElement[] = [];

	// Multi-select attribute facets (genre/format/synth/…). Each facet's
	// key maps to the Set of currently-selected token values.
	const activeFacets = new Map<string, Set<string>>();
	attributeFacets.forEach((f) => activeFacets.set(f.key, new Set<string>()));

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
	/** The selection, and whether it's narrowed from the inputs' bounds. */
	function rangeOf(r: RangeState): { lo: number; hi: number; active: boolean } {
		const lo = Number(r.lo.value);
		const hi = Number(r.hi.value);
		return { lo, hi, active: lo > Number(r.lo.min) || hi < Number(r.hi.max) };
	}
	/** A card's value as [min, max]: "128" → [128, 128], "120-128" → [120, 128]. */
	function cardRange(card: HTMLElement, dataKey: string): [number, number] | null {
		const raw = (card.dataset[dataKey] ?? '').trim();
		if (!raw) return null;
		const nums = raw.split(/\s*[-–,]\s*/).map(Number).filter((n) => Number.isFinite(n));
		if (!nums.length) return null;
		return [Math.min(...nums), Math.max(...nums)];
	}

	function recomputeFilter(): void {
		filteredCards = cards.filter((card) => {
			const cat = card.dataset.category ?? '';
			const price = Number(card.dataset.price ?? 0);
			const matchesCat = activeFilter === 'all' || cat === activeFilter;
			const matchesPrice = price <= maxPrice;
			// Every active facet must match (AND across facets); within a
			// facet the card needs at least one selected token (OR).
			const matchesFacets = attributeFacets.every((facet) => {
				const sel = activeFacets.get(facet.key);
				if (!sel || sel.size === 0) return true;
				return facetTokens(card, facet.dataKey).some((v) => sel.has(v));
			});
			// Every narrowed range must overlap the card's own range.
			const matchesRanges = ranges.every((r) => {
				const { lo, hi, active } = rangeOf(r);
				if (!active) return true;
				const v = cardRange(card, r.facet.dataKey);
				return v !== null && v[0] <= hi && v[1] >= lo;
			});
			return matchesCat && matchesPrice && matchesFacets && matchesRanges;
		});
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

	function updateToolbarCounts(): void {
		const resultsEl = document.querySelector<HTMLElement>(sel.resultsCount);
		const badgeEl   = document.querySelector<HTMLElement>(sel.activeFilterBadge);
		if (resultsEl) resultsEl.textContent = String(filteredCards.length);
		let active = 0;
		if (activeFilter !== 'all') active++;
		if (maxPrice !== Infinity) active++;
		activeFacets.forEach((set) => { active += set.size; });
		ranges.forEach((r) => { if (rangeOf(r).active) active++; });
		if (badgeEl) {
			badgeEl.textContent = String(active);
			badgeEl.hidden = active === 0;
		}
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

	function applySort(): void {
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
			switch (activeSort) {
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
		applyFilter(false);
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
			activeFilter = f;
			applyFilter();
		});
	});

	// ---- Multi-select attribute facets (genre / format / synth / …) ----
	function syncFacetUrl(): void {
		const params = new URLSearchParams(location.search);
		let touched = false;
		attributeFacets.forEach((facet) => {
			if (!facet.urlParam) return;
			touched = true;
			const set = activeFacets.get(facet.key);
			if (set && set.size > 0) params.set(facet.key, [...set].join(','));
			else params.delete(facet.key);
		});
		if (!touched) return;
		const qs = params.toString();
		history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
	}

	function wireFacet(facet: AttributeFacet): void {
		const set = activeFacets.get(facet.key);
		if (!set) return;
		const facetChips = document.querySelectorAll<HTMLElement>(facet.chipSelector);
		facetChips.forEach((chip) => {
			chip.addEventListener('click', () => {
				const val = chip.dataset.value ?? '';
				if (val === '' || val === 'all') {
					set.clear();
					facetChips.forEach((c) => setChipState(c, false));
				} else if (set.has(val)) {
					set.delete(val);
					setChipState(chip, false);
				} else {
					set.add(val);
					setChipState(chip, true);
				}
				applyFilter();
				syncFacetUrl();
			});
		});
	}
	attributeFacets.forEach(wireFacet);

	// ---- Numeric range facets ----
	function renderRange(r: RangeState): void {
		const { lo, hi, active } = rangeOf(r);
		if (r.out) r.out.textContent = r.facet.format ? r.facet.format(lo, hi, !active) : `${lo}–${hi}`;
	}
	function syncRangeUrl(): void {
		const withUrl = ranges.filter((r) => r.facet.urlParam);
		if (!withUrl.length) return;
		const params = new URLSearchParams(location.search);
		withUrl.forEach((r) => {
			const { lo, hi, active } = rangeOf(r);
			if (active) params.set(r.facet.key, `${lo}-${hi}`);
			else params.delete(r.facet.key);
		});
		const qs = params.toString();
		history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
	}
	ranges.forEach((r) => {
		// The ends can't cross: the one being dragged stops at the other.
		r.lo.addEventListener('input', () => {
			if (Number(r.lo.value) > Number(r.hi.value)) r.lo.value = r.hi.value;
			renderRange(r);
			applyFilter();
			syncRangeUrl();
		});
		r.hi.addEventListener('input', () => {
			if (Number(r.hi.value) < Number(r.lo.value)) r.hi.value = r.lo.value;
			renderRange(r);
			applyFilter();
			syncRangeUrl();
		});
		renderRange(r);
	});

	function syncSort(val: SortMode): void {
		activeSort = val;
		if (sortSelect && sortSelect.value !== val) sortSelect.value = val;
		if (drawerSort && drawerSort.value !== val) drawerSort.value = val;
		applySort();
	}
	sortSelect?.addEventListener('change', () => syncSort(sortSelect.value as SortMode));
	drawerSort?.addEventListener('change', () => syncSort(drawerSort.value as SortMode));

	priceInput?.addEventListener('input', () => {
		const v = Number(priceInput.value);
		maxPrice = v >= Number(priceInput.max) ? Infinity : v;
		if (priceLabel) {
			priceLabel.textContent =
				v >= Number(priceInput.max) ? `${currencySymbol}${v}+` : `${currencySymbol}${v}`;
		}
		applyFilter();
	});

	const drawer   = document.querySelector<HTMLElement>(sel.drawer);
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
	// whatever opened the drawer.
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
	applyBtn?.addEventListener('click', closeDrawer);
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

	clearBtn?.addEventListener('click', () => {
		const allChip = document.querySelector<HTMLButtonElement>(`${sel.chips}[data-filter="all"]`);
		allChip?.click();
		syncSort('featured');
		if (priceInput) {
			priceInput.value = priceInput.max;
			priceInput.dispatchEvent(new Event('input'));
		}
		// Clear every attribute facet too.
		attributeFacets.forEach((facet) => {
			activeFacets.get(facet.key)?.clear();
			document.querySelectorAll<HTMLElement>(facet.chipSelector).forEach((c) => setChipState(c, false));
		});
		syncFacetUrl();
		ranges.forEach((r) => {
			r.lo.value = r.lo.min;
			r.hi.value = r.hi.max;
			renderRange(r);
		});
		syncRangeUrl();
		applyFilter();
	});

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

	const params = new URLSearchParams(location.search);
	// Restore attribute-facet selections from the URL (facets with urlParam).
	attributeFacets.forEach((facet) => {
		if (!facet.urlParam) return;
		const raw = params.get(facet.key);
		if (!raw) return;
		const set = activeFacets.get(facet.key);
		if (!set) return;
		raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((v) => set.add(v));
		document.querySelectorAll<HTMLElement>(facet.chipSelector).forEach((chip) => {
			setChipState(chip, set.has(chip.dataset.value ?? ''));
		});
	});
	// Restore range selections from the URL (`?bpm=120-130`).
	ranges.forEach((r) => {
		if (!r.facet.urlParam) return;
		const m = (params.get(r.facet.key) ?? '').match(/^(-?[\d.]+)-(-?[\d.]+)$/);
		if (!m) return;
		r.lo.value = String(Math.min(Number(m[1]), Number(m[2])));
		r.hi.value = String(Math.max(Number(m[1]), Number(m[2])));
		renderRange(r);
	});
	const initialCat = params.get('cat');
	if (initialCat) {
		const chip = document.querySelector<HTMLButtonElement>(
			`${sel.chips}[data-filter="${initialCat}"]`,
		);
		chip?.click();
	} else {
		applyFilter();
	}

	return true;
}
