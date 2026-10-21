// @vitest-environment happy-dom
/**
 * Text search (1.4.0): a debounced input whose words must all appear in the
 * card's chosen data attributes; URL-synced as ?q=, ANDed with the facets,
 * counted through the results-count live region.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initFilterToolbar, getFilterToolbar } from '../src/runtime';

const MARKUP = `
	<form id="f" action="/search"><input id="q" type="search" name="q" aria-label="Search"></form>
	<p role="status"><span id="results-count"></span> articles</p>
	<span id="active-filter-count" hidden>0</span>
	<button class="facet-tag" data-value="seo">SEO</button>
	<button id="clear-filters">Clear</button>
	<div id="product-grid">
		<article class="post" data-title="Writing for the web" data-excerpt="Short sentences win." data-tag="seo craft">A</article>
		<article class="post" data-title="Café culture"        data-excerpt="Where writers meet."  data-tag="city">B</article>
		<article class="post" data-title="Search basics"       data-excerpt="Titles and links."    data-tag="seo">C</article>
	</div>
`;

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;
const visible = (): string[] =>
	Array.from(document.querySelectorAll<HTMLElement>('.post'))
		.filter((c) => c.style.display !== 'none')
		.map((c) => c.textContent ?? '');
const type = (text: string): void => {
	$<HTMLInputElement>('#q').value = text;
	$('#q').dispatchEvent(new Event('input', { bubbles: true }));
};
const init = (extra: Record<string, unknown> = {}): void => {
	initFilterToolbar({
		pageSize: 50,
		cardSelector: '.post',
		search: { input: '#q', dataKeys: ['title', 'excerpt', 'tag'] },
		attributeFacets: [{ key: 'tag', dataKey: 'tag', chipSelector: '.facet-tag' }],
		...extra,
	});
};

describe('search', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/');
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('filters after the debounce, not on every keystroke', () => {
		init();
		type('writ');
		expect(visible()).toEqual(['A', 'B', 'C']);
		vi.advanceTimersByTime(199);
		expect(visible()).toEqual(['A', 'B', 'C']);
		vi.advanceTimersByTime(1);
		// "Writing…" (title) and "…writers meet." (excerpt)
		expect(visible()).toEqual(['A', 'B']);
	});

	it('needs every word, in any order, ignoring case and accents', () => {
		init();
		type('CAFE  culture');
		vi.runAllTimers();
		expect(visible()).toEqual(['B']);
		type('links search');
		vi.runAllTimers();
		expect(visible()).toEqual(['C']);
	});

	it('only searches the chosen data attributes', () => {
		document.body.innerHTML = MARKUP;
		init({ search: { input: '#q' } }); // default: title only
		type('writers');
		vi.runAllTimers();
		expect(visible()).toEqual([]);
	});

	it('ANDs with the other facets', () => {
		init();
		$('.facet-tag').click(); // seo → A, C
		type('web');
		vi.runAllTimers();
		expect(visible()).toEqual(['A']);
	});

	it('updates the live region count (only when it changes)', () => {
		init();
		const count = $('#results-count');
		expect(count.textContent).toBe('3');
		type('seo');
		vi.runAllTimers();
		expect(count.textContent).toBe('2');
		const node = count.firstChild;
		type('seo '); // same query once trimmed: no rewrite, no re-announcement
		vi.runAllTimers();
		expect(count.firstChild).toBe(node);
	});

	it('syncs ?q= and restores it on load', () => {
		init();
		type('search basics');
		vi.runAllTimers();
		expect(new URLSearchParams(location.search).get('q')).toBe('search basics');
		type('');
		vi.runAllTimers();
		expect(location.search).toBe('');

		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/?q=caf%C3%A9');
		init();
		expect($<HTMLInputElement>('#q').value).toBe('café');
		expect(visible()).toEqual(['B']);
	});

	it('honours a custom param, or none', () => {
		init({ search: { input: '#q', key: 'search' } });
		type('cafe');
		vi.runAllTimers();
		expect(location.search).toBe('?search=cafe');

		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/');
		init({ search: { input: '#q', urlParam: false } });
		type('cafe');
		vi.runAllTimers();
		expect(location.search).toBe('');
	});

	it('Enter filters at once and does not submit the form', () => {
		init();
		const submitted = vi.fn();
		$('#f').addEventListener('submit', submitted);
		$<HTMLInputElement>('#q').value = 'café';
		const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		$('#q').dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
		expect(visible()).toEqual(['B']);
		const s = new Event('submit', { bubbles: true, cancelable: true });
		$('#f').dispatchEvent(s);
		expect(s.defaultPrevented).toBe(true);
	});

	it('is not counted in the filter badge; Clear empties it', () => {
		init();
		type('cafe');
		vi.runAllTimers();
		expect($('#active-filter-count').hidden).toBe(true);
		$('#clear-filters').click();
		expect($<HTMLInputElement>('#q').value).toBe('');
		expect(visible()).toEqual(['A', 'B', 'C']);
	});

	it('Clear cancels a pending keystroke', () => {
		init();
		type('cafe');
		$('#clear-filters').click();
		vi.runAllTimers();
		expect(visible()).toEqual(['A', 'B', 'C']);
	});

	it('setQuery() applies at once and updates the input', () => {
		init();
		getFilterToolbar('#product-grid')!.setQuery('  basics ');
		expect(visible()).toEqual(['C']);
		expect($<HTMLInputElement>('#q').value).toBe('basics');
		expect(getFilterToolbar()!.state().query).toBe('basics');
	});
});
