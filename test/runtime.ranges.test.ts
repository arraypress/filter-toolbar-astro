// @vitest-environment happy-dom
/**
 * Runtime tests for the numeric range facets added in 1.2.0.
 *
 * Cards carry a single value (`data-bpm="128"`) or a range of their own
 * (`data-bpm="120-128"`); two range inputs select the window. A card shows
 * when its range overlaps the window.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initFilterToolbar } from '../src/runtime';

const MARKUP = `
	<div id="product-grid" class="product-grid">
		<article class="product-card" data-category="pack" data-price="10" data-bpm="122">A</article>
		<article class="product-card" data-category="pack" data-price="10" data-bpm="138">B</article>
		<article class="product-card" data-category="pack" data-price="10" data-bpm="130-140">C</article>
		<article class="product-card" data-category="pack" data-price="10" data-bpm="">D</article>
	</div>
	<input id="bpm-lo" type="range" min="80" max="180" value="80">
	<input id="bpm-hi" type="range" min="80" max="180" value="180">
	<output id="bpm-out"></output>
	<span id="active-filter-count" hidden>0</span>
	<button id="clear-filters">Clear</button>
`;

const BPM = { key: 'bpm', dataKey: 'bpm', minInput: '#bpm-lo', maxInput: '#bpm-hi', output: '#bpm-out' };

function visible(): string[] {
	return Array.from(document.querySelectorAll<HTMLElement>('.product-card'))
		.filter((c) => c.style.display !== 'none')
		.map((c) => c.textContent ?? '')
		.sort();
}
function set(id: string, value: number): void {
	const input = document.getElementById(id) as HTMLInputElement;
	input.value = String(value);
	input.dispatchEvent(new Event('input'));
}
const out = () => document.getElementById('bpm-out')!.textContent;

describe('initFilterToolbar — rangeFacets', () => {
	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		history.replaceState(null, '', '/');
	});

	it('shows every card, including ones with no value, at full width', () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [BPM] });
		expect(visible()).toEqual(['A', 'B', 'C', 'D']);
		expect(out()).toBe('80–180');
	});

	it('matches single values inside the window and ranges that overlap it', () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [BPM] });
		set('bpm-lo', 125);
		set('bpm-hi', 135);
		// B (138) is outside; C (130-140) overlaps; D has no value.
		expect(visible()).toEqual(['C']);
		expect(out()).toBe('125–135');
	});

	it('includes the window edges', () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [BPM] });
		set('bpm-lo', 138);
		set('bpm-hi', 138);
		expect(visible()).toEqual(['B', 'C']);
	});

	it("doesn't let the ends cross", () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [BPM] });
		set('bpm-hi', 120);
		set('bpm-lo', 150);
		expect((document.getElementById('bpm-lo') as HTMLInputElement).value).toBe('120');
	});

	it('counts a narrowed range as one active filter', () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [BPM] });
		set('bpm-lo', 100);
		const badge = document.getElementById('active-filter-count')!;
		expect(badge.textContent).toBe('1');
		expect(badge.hidden).toBe(false);
	});

	it('uses a custom format, told when the range is full', () => {
		const format = (lo: number, hi: number, full: boolean) => (full ? 'Any tempo' : `${lo}–${hi} BPM`);
		initFilterToolbar({ pageSize: 50, rangeFacets: [{ ...BPM, format }] });
		expect(out()).toBe('Any tempo');
		set('bpm-hi', 140);
		expect(out()).toBe('80–140 BPM');
	});

	it('clears back to full width', () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [BPM] });
		set('bpm-lo', 130);
		document.getElementById('clear-filters')!.click();
		expect(visible()).toEqual(['A', 'B', 'C', 'D']);
		expect(out()).toBe('80–180');
	});

	it('reflects and restores the selection in the URL', () => {
		initFilterToolbar({ pageSize: 50, rangeFacets: [{ ...BPM, urlParam: true }] });
		set('bpm-lo', 120);
		set('bpm-hi', 125);
		expect(location.search).toBe('?bpm=120-125');

		document.body.innerHTML = MARKUP;
		initFilterToolbar({ pageSize: 50, rangeFacets: [{ ...BPM, urlParam: true }] });
		expect(visible()).toEqual(['A']);
		expect(out()).toBe('120–125');
	});

	it('combines with attribute facets (AND)', () => {
		document.querySelector('.product-card')!.setAttribute('data-genre', 'house');
		document.body.insertAdjacentHTML('beforeend', '<button class="facet-genre" data-value="house">House</button>');
		initFilterToolbar({
			pageSize: 50,
			rangeFacets: [BPM],
			attributeFacets: [{ key: 'genre', dataKey: 'genre', chipSelector: '.facet-genre' }],
		});
		document.querySelector<HTMLElement>('.facet-genre')!.click();
		set('bpm-lo', 130);
		// A is house but 122; nothing else is house.
		expect(visible()).toEqual([]);
	});
});
