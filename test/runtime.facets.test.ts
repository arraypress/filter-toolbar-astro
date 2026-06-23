// @vitest-environment happy-dom
/**
 * Runtime tests for the multi-select attribute facets added in 1.1.0.
 *
 * Exercises initFilterToolbar()'s facet filtering directly against a
 * happy-dom DOM — builds a grid of cards carrying `data-genre` /
 * `data-format` token lists + facet chips, simulates chip clicks, and
 * asserts which cards end up visible (`style.display`).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initFilterToolbar } from '../src/runtime';

const MARKUP = `
	<div id="product-grid" class="product-grid">
		<article class="product-card" data-category="pack" data-price="10" data-genre="trance"        data-format="presets">A</article>
		<article class="product-card" data-category="pack" data-price="20" data-genre="house"         data-format="midi">B</article>
		<article class="product-card" data-category="pack" data-price="30" data-genre="trance house"  data-format="presets midi">C</article>
	</div>
	<button class="facet-genre"  data-value="trance">Trance</button>
	<button class="facet-genre"  data-value="house">House</button>
	<button class="facet-genre"  data-value="all">All genres</button>
	<button class="facet-format" data-value="presets">Presets</button>
`;

function cards(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>('.product-card'));
}
function visible(): string[] {
	return cards().filter((c) => c.style.display !== 'none').map((c) => c.textContent);
}
function clickFacet(facet: string, value: string): void {
	document.querySelector<HTMLElement>(`.${facet}[data-value="${value}"]`)!.click();
}

const GENRE_FACET = { key: 'genre', dataKey: 'genre', chipSelector: '.facet-genre' };
const FORMAT_FACET = { key: 'format', dataKey: 'format', chipSelector: '.facet-format' };

describe('initFilterToolbar — attributeFacets', () => {
	beforeEach(() => {
		document.body.innerHTML = MARKUP;
	});

	it('shows everything when no facet is selected', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET] });
		expect(visible().sort()).toEqual(['A', 'B', 'C']);
	});

	it('filters by a single facet value, OR-matching the card token list', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET] });
		clickFacet('facet-genre', 'trance');
		// A (trance) and C (trance house) match; B (house) does not.
		expect(visible().sort()).toEqual(['A', 'C']);
	});

	it('OR within a facet when multiple values are selected', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET] });
		clickFacet('facet-genre', 'trance');
		clickFacet('facet-genre', 'house');
		// trance OR house → all three cards.
		expect(visible().sort()).toEqual(['A', 'B', 'C']);
	});

	it('ANDs across different facets', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET, FORMAT_FACET] });
		clickFacet('facet-genre', 'house');
		clickFacet('facet-format', 'presets');
		// house AND presets → only C (house + presets). A is presets-but-not-house, B is house-but-not-presets.
		expect(visible()).toEqual(['C']);
	});

	it('toggling a value off restores it', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET] });
		clickFacet('facet-genre', 'trance');
		expect(visible().sort()).toEqual(['A', 'C']);
		clickFacet('facet-genre', 'trance'); // toggle off
		expect(visible().sort()).toEqual(['A', 'B', 'C']);
	});

	it('a data-value="all" chip clears the facet', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET] });
		clickFacet('facet-genre', 'trance');
		expect(visible().sort()).toEqual(['A', 'C']);
		clickFacet('facet-genre', 'all');
		expect(visible().sort()).toEqual(['A', 'B', 'C']);
	});

	it('sets aria-pressed + active class on the selected chip', () => {
		initFilterToolbar({ pageSize: 50, attributeFacets: [GENRE_FACET] });
		const chip = document.querySelector<HTMLElement>('.facet-genre[data-value="trance"]')!;
		chip.click();
		expect(chip.getAttribute('aria-pressed')).toBe('true');
		expect(chip.classList.contains('active')).toBe(true);
	});

	it('leaves behaviour unchanged when attributeFacets is omitted', () => {
		// Category filter still works on its own.
		document.body.innerHTML = MARKUP +
			'<button class="chip" data-filter="all"></button>';
		initFilterToolbar({ pageSize: 50 });
		expect(visible().sort()).toEqual(['A', 'B', 'C']);
	});
});
