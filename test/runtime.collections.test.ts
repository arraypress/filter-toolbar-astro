// @vitest-environment happy-dom
/**
 * Genericness contract — the runtime is NOT products-specific.
 *
 * These tests drive initFilterToolbar() against a *blog* collection:
 * a custom `cardSelector` (`.post-card`), a custom grid id
 * (`#post-grid` via `selectors`), facets on non-commerce data
 * (`data-tags`, `data-author`), and NO category chip / price slider /
 * `data-price` anywhere. If anything here regresses, the library has
 * become coupled to products — which it must never be.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initFilterToolbar } from '../src/runtime';

// A blog grid — no products markup, no price, no category.
const BLOG = `
	<div id="post-grid" class="post-grid">
		<article class="post-card" data-order="1" data-title="A" data-tags="astro seo"  data-author="dave">A</article>
		<article class="post-card" data-order="2" data-title="B" data-tags="astro"      data-author="sam">B</article>
		<article class="post-card" data-order="3" data-title="C" data-tags="css"        data-author="dave">C</article>
	</div>
	<button class="facet-tag"    data-value="astro">Astro</button>
	<button class="facet-tag"    data-value="seo">SEO</button>
	<button class="facet-tag"    data-value="css">CSS</button>
	<button class="facet-author" data-value="dave">Dave</button>
	<button class="facet-author" data-value="sam">Sam</button>
`;

function visible(): string[] {
	return Array.from(document.querySelectorAll<HTMLElement>('.post-card'))
		.filter((c) => c.style.display !== 'none')
		.map((c) => c.textContent)
		.sort();
}
function click(facet: string, value: string): void {
	document.querySelector<HTMLElement>(`.${facet}[data-value="${value}"]`)!.click();
}

const TAG_FACET    = { key: 'tag',    dataKey: 'tags',   chipSelector: '.facet-tag' };
const AUTHOR_FACET = { key: 'author', dataKey: 'author', chipSelector: '.facet-author' };

function initBlog() {
	return initFilterToolbar({
		pageSize: 50,
		cardSelector: '.post-card',          // not .product-card
		selectors: { grid: '#post-grid' },    // not #product-grid
		attributeFacets: [TAG_FACET, AUTHOR_FACET],
	});
}

describe('initFilterToolbar — works on a non-products collection (blog)', () => {
	beforeEach(() => {
		document.body.innerHTML = BLOG;
	});

	it('binds against a custom cardSelector + grid id', () => {
		expect(initBlog()).toBe(true);          // bound successfully
		expect(visible()).toEqual(['A', 'B', 'C']);
	});

	it('filters by a tag facet (no category/price involved)', () => {
		initBlog();
		click('facet-tag', 'astro');            // A + B carry astro; C is css
		expect(visible()).toEqual(['A', 'B']);
	});

	it('filters by an author facet', () => {
		initBlog();
		click('facet-author', 'dave');          // A + C are dave
		expect(visible()).toEqual(['A', 'C']);
	});

	it('ANDs a tag facet with an author facet', () => {
		initBlog();
		click('facet-tag', 'astro');            // A, B
		click('facet-author', 'dave');          // A, C
		expect(visible()).toEqual(['A']);       // intersection: astro AND dave
	});

	it('does not throw or filter on a missing price slider / category chip', () => {
		// No #price-max, no .chip[data-filter] in the DOM at all.
		expect(() => initBlog()).not.toThrow();
		click('facet-tag', 'css');
		expect(visible()).toEqual(['C']);       // pure facet filtering, commerce bits inert
	});
});
