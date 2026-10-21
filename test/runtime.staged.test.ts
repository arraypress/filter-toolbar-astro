// @vitest-environment happy-dom
/**
 * Staged selection (1.4.0): with `apply: 'staged'`, changes inside the
 * drawer are held until Apply; closing without Apply reverts them; Clear
 * resets staged + applied, and the sort to `defaultSort`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initFilterToolbar, getFilterToolbar } from '../src/runtime';
import type { FilterToolbarState } from '../src/types';

const MARKUP = `
	<button id="open-filters">Filters</button>
	<span id="active-filter-count" hidden>0</span>
	<select id="sort-select"><option value="featured">F</option><option value="newest">N</option><option value="name">A–Z</option></select>
	<div id="filter-backdrop"></div>
	<aside id="filter-drawer" aria-hidden="true">
		<button id="close-filters">Close</button>
		<button class="facet-genre" data-value="trance">Trance</button>
		<button class="facet-genre" data-value="house">House</button>
		<select id="drawer-sort"><option value="featured">F</option><option value="newest">N</option><option value="name">A–Z</option></select>
		<button id="clear-filters">Reset</button>
		<button id="apply-filters">Show <span id="staged-count"></span> results</button>
	</aside>
	<button class="facet-format" data-value="midi">MIDI</button>
	<span id="results-count"></span>
	<div id="product-grid">
		<article class="product-card" data-order="1" data-date="2026-01-01" data-title="Bravo"   data-genre="trance" data-format="midi">B</article>
		<article class="product-card" data-order="2" data-date="2026-03-01" data-title="Alpha"   data-genre="house"  data-format="wav">A</article>
		<article class="product-card" data-order="3" data-date="2026-02-01" data-title="Charlie" data-genre="trance house" data-format="midi">C</article>
	</div>
`;

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;
const visible = (): string[] =>
	Array.from(document.querySelectorAll<HTMLElement>('.product-card'))
		.filter((c) => c.style.display !== 'none')
		.map((c) => c.textContent ?? '');
const pick = (sel: string, value: string): void => {
	const s = $<HTMLSelectElement>(sel);
	s.value = value;
	s.dispatchEvent(new Event('change'));
};
const FACETS = [
	{ key: 'genre', dataKey: 'genre', chipSelector: '.facet-genre', urlParam: true },
	{ key: 'format', dataKey: 'format', chipSelector: '.facet-format' },
];

describe('apply: "staged"', () => {
	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/');
		initFilterToolbar({ pageSize: 50, apply: 'staged', attributeFacets: FACETS });
		$('#open-filters').click();
	});

	it('holds a facet change inside the drawer until Apply', () => {
		$('.facet-genre[data-value="house"]').click();
		// The control shows the draft…
		expect($('.facet-genre[data-value="house"]').getAttribute('aria-pressed')).toBe('true');
		// …the listing, count, badge and URL don't move yet.
		expect(visible()).toEqual(['B', 'A', 'C']);
		expect($('#results-count').textContent).toBe('3');
		expect($('#active-filter-count').hidden).toBe(true);
		expect(location.search).toBe('');
		// The Apply button previews what it would show.
		expect($('#staged-count').textContent).toBe('2');

		$('#apply-filters').click();
		expect(visible()).toEqual(['A', 'C']);
		expect($('#results-count').textContent).toBe('2');
		expect($('#active-filter-count').textContent).toBe('1');
		expect(location.search).toBe('?genre=house');
		expect($('#filter-drawer').dataset.open).toBe('false');
	});

	it('closing without Apply reverts the staged change (close, backdrop, Escape)', () => {
		for (const close of [
			() => $('#close-filters').click(),
			() => $('#filter-backdrop').click(),
			() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
		]) {
			$('#open-filters').click();
			$('.facet-genre[data-value="trance"]').click();
			pick('#drawer-sort', 'name');
			close();
			expect($('#filter-drawer').dataset.open).toBe('false');
			expect($('.facet-genre[data-value="trance"]').getAttribute('aria-pressed')).toBe('false');
			expect($<HTMLSelectElement>('#drawer-sort').value).toBe('featured');
			expect(visible()).toEqual(['B', 'A', 'C']);
			expect($('#staged-count').textContent).toBe('3');
		}
	});

	it('reverts to the APPLIED selection, not to empty', () => {
		$('.facet-genre[data-value="house"]').click();
		$('#apply-filters').click();
		$('#open-filters').click();
		$('.facet-genre[data-value="house"]').click(); // un-stage it
		$('.facet-genre[data-value="trance"]').click();
		$('#close-filters').click();
		expect($('.facet-genre[data-value="house"]').getAttribute('aria-pressed')).toBe('true');
		expect($('.facet-genre[data-value="trance"]').getAttribute('aria-pressed')).toBe('false');
		expect(visible()).toEqual(['A', 'C']);
	});

	it('stages the drawer sort too, and Apply re-orders', () => {
		pick('#drawer-sort', 'name');
		expect(visible()).toEqual(['B', 'A', 'C']);
		expect($<HTMLSelectElement>('#sort-select').value).toBe('featured');
		$('#apply-filters').click();
		expect(visible()).toEqual(['A', 'B', 'C']);
		expect($<HTMLSelectElement>('#sort-select').value).toBe('name');
	});

	it('controls outside the drawer stay live, without applying what is staged', () => {
		$('.facet-genre[data-value="house"]').click(); // staged
		$('.facet-format[data-value="midi"]').click(); // outside: live
		expect(visible()).toEqual(['B', 'C']);
		pick('#sort-select', 'name'); // outside: live
		expect(visible()).toEqual(['B', 'C']);
		expect($<HTMLSelectElement>('#drawer-sort').value).toBe('name');
		// Apply now adds the staged genre on top of the live format.
		$('#apply-filters').click();
		expect(visible()).toEqual(['C']);
	});

	it('Reset clears staged AND applied at once, keeping the drawer open', () => {
		$('.facet-genre[data-value="house"]').click();
		$('#apply-filters').click();
		$('#open-filters').click();
		$('.facet-genre[data-value="trance"]').click();
		$('#clear-filters').click();
		expect(document.querySelectorAll('.facet-genre[aria-pressed="true"]').length).toBe(0);
		expect(visible()).toEqual(['B', 'A', 'C']);
		expect(location.search).toBe('');
		expect($('#filter-drawer').dataset.open).toBe('true');
		// Nothing left to revert to.
		$('#close-filters').click();
		expect(visible()).toEqual(['B', 'A', 'C']);
	});

	it('the controller applies at once and fires filtertoolbar:change', () => {
		const seen: FilterToolbarState[] = [];
		$('#product-grid').addEventListener('filtertoolbar:change', (e) => seen.push((e as CustomEvent<FilterToolbarState>).detail));
		$('#close-filters').click();
		getFilterToolbar()!.setFacet('genre', ['trance']);
		expect(visible()).toEqual(['B', 'C']);
		expect($('.facet-genre[data-value="trance"]').getAttribute('aria-pressed')).toBe('true');
		expect(seen.at(-1)).toMatchObject({ count: 2, facets: { genre: ['trance'], format: [] }, sort: 'featured' });
		expect(getFilterToolbar()!.state().facets.genre).toEqual(['trance']);
	});
});

describe('apply: "live" (default) is unchanged', () => {
	it('filters on every click; Apply just closes', () => {
		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/');
		initFilterToolbar({ pageSize: 50, attributeFacets: FACETS });
		$('#open-filters').click();
		$('.facet-genre[data-value="house"]').click();
		expect(visible()).toEqual(['A', 'C']);
		expect($('#staged-count').textContent).toBe('2');
		$('#close-filters').click(); // no revert in live mode
		expect(visible()).toEqual(['A', 'C']);
	});

	it('fires filtertoolbar:change once at init', () => {
		document.body.innerHTML = MARKUP;
		const spy = vi.fn();
		document.addEventListener('filtertoolbar:change', spy, { once: true });
		initFilterToolbar({ pageSize: 50 });
		expect(spy).toHaveBeenCalledTimes(1);
	});
});

describe('Clear resets the sort to defaultSort', () => {
	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/');
	});

	it('returns to the configured default, not "featured"', () => {
		initFilterToolbar({ pageSize: 50, defaultSort: 'newest' });
		pick('#sort-select', 'name');
		expect(visible()).toEqual(['A', 'B', 'C']);
		$('#clear-filters').click();
		expect($<HTMLSelectElement>('#sort-select').value).toBe('newest');
		expect($<HTMLSelectElement>('#drawer-sort').value).toBe('newest');
		expect(visible()).toEqual(['A', 'C', 'B']); // by date, newest first
		expect(getFilterToolbar()!.state().sort).toBe('newest');
	});

	it('still means "featured" when no default is set', () => {
		initFilterToolbar({ pageSize: 50 });
		pick('#sort-select', 'name');
		$('#clear-filters').click();
		expect($<HTMLSelectElement>('#sort-select').value).toBe('featured');
		expect(visible()).toEqual(['B', 'A', 'C']);
	});
});
