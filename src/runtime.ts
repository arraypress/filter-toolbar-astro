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
	FilterToolbarOptions,
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

	function recomputeFilter(): void {
		filteredCards = cards.filter((card) => {
			const cat = card.dataset.category ?? '';
			const price = Number(card.dataset.price ?? 0);
			const matchesCat = activeFilter === 'all' || cat === activeFilter;
			const matchesPrice = price <= maxPrice;
			return matchesCat && matchesPrice;
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

	chips.forEach((chip) => {
		chip.addEventListener('click', () => {
			const f = chip.dataset.filter ?? 'all';
			chips.forEach((c) => {
				const match = c.dataset.filter === f;
				c.classList.toggle('active', match);
				c.setAttribute('aria-selected', String(match));
			});
			activeFilter = f;
			applyFilter();
		});
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

	function openDrawer(): void {
		if (drawer)   drawer.dataset.open   = 'true';
		if (backdrop) backdrop.dataset.open = 'true';
		drawer?.setAttribute('aria-hidden', 'false');
		openBtn?.setAttribute('aria-expanded', 'true');
		document.body.classList.add('drawer-open');
	}
	function closeDrawer(): void {
		if (drawer)   drawer.dataset.open   = 'false';
		if (backdrop) backdrop.dataset.open = 'false';
		drawer?.setAttribute('aria-hidden', 'true');
		openBtn?.setAttribute('aria-expanded', 'false');
		document.body.classList.remove('drawer-open');
	}
	openBtn?.addEventListener('click', openDrawer);
	closeBtn?.addEventListener('click', closeDrawer);
	backdrop?.addEventListener('click', closeDrawer);
	applyBtn?.addEventListener('click', closeDrawer);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') closeDrawer();
	});

	clearBtn?.addEventListener('click', () => {
		const allChip = document.querySelector<HTMLButtonElement>(`${sel.chips}[data-filter="all"]`);
		allChip?.click();
		syncSort('featured');
		if (priceInput) {
			priceInput.value = priceInput.max;
			priceInput.dispatchEvent(new Event('input'));
		}
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
