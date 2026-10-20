// @vitest-environment happy-dom
/**
 * Accessibility tests for the runtime (1.3.0): the filter drawer keeps
 * `inert` in lockstep with `aria-hidden`, moves + traps focus while open
 * and returns it on close; chips carry the ARIA state their role allows
 * (`aria-pressed` on a plain button, `aria-selected` only on roles that
 * permit it).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initFilterToolbar } from '../src/runtime';

const MARKUP = `
	<button id="before">Before</button>
	<button id="open-filters" aria-expanded="false">Filters</button>
	<button id="other-opener">Refine</button>
	<div id="filter-backdrop"></div>
	<aside id="filter-drawer" role="dialog" aria-modal="true" aria-hidden="true">
		<button id="close-filters">Close</button>
		<select id="drawer-sort"><option value="featured">Featured</option></select>
		<button class="chip" data-filter="all">All</button>
		<button class="chip" data-filter="pack" aria-selected="false">Packs</button>
		<button class="facet-genre" data-value="trance">Trance</button>
		<button id="hidden-btn" hidden>Hidden</button>
		<button id="clear-filters">Clear</button>
		<button id="apply-filters">Done</button>
	</aside>
	<div id="product-grid">
		<article class="product-card" data-category="pack" data-genre="trance">A</article>
		<article class="product-card" data-category="kit" data-genre="house">B</article>
	</div>
`;

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;
const drawer = (): HTMLElement => $('#filter-drawer');
const key = (k: string, shiftKey = false): KeyboardEvent => {
	const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
	(document.activeElement ?? document.body).dispatchEvent(e);
	return e;
};

describe('filter drawer — inert, focus, Escape', () => {
	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		initFilterToolbar({ pageSize: 50, attributeFacets: [{ key: 'genre', dataKey: 'genre', chipSelector: '.facet-genre' }] });
	});

	it('starts closed: aria-hidden AND inert', () => {
		expect(drawer().getAttribute('aria-hidden')).toBe('true');
		expect(drawer().hasAttribute('inert')).toBe(true);
		expect(drawer().dataset.open).toBe('false');
	});

	it('opening drops inert with aria-hidden and moves focus inside', () => {
		$('#open-filters').focus();
		$('#open-filters').click();
		expect(drawer().getAttribute('aria-hidden')).toBe('false');
		expect(drawer().hasAttribute('inert')).toBe(false);
		expect($('#open-filters').getAttribute('aria-expanded')).toBe('true');
		expect(document.activeElement).toBe($('#close-filters'));
	});

	it('closing restores inert and returns focus to the opener', () => {
		$('#open-filters').focus();
		$('#open-filters').click();
		$('#close-filters').click();
		expect(drawer().getAttribute('aria-hidden')).toBe('true');
		expect(drawer().hasAttribute('inert')).toBe(true);
		expect($('#open-filters').getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe($('#open-filters'));
	});

	it('returns focus to whichever control opened it', () => {
		$('#other-opener').focus();
		$('#open-filters').click(); // e.g. a sticky "Refine" pill proxying the toolbar button
		$('#apply-filters').click();
		expect(document.activeElement).toBe($('#other-opener'));
	});

	it('Escape closes the open drawer', () => {
		$('#open-filters').focus();
		$('#open-filters').click();
		key('Escape');
		expect(drawer().dataset.open).toBe('false');
		expect(drawer().hasAttribute('inert')).toBe(true);
		expect(document.activeElement).toBe($('#open-filters'));
	});

	it('Escape while closed does nothing (no focus theft)', () => {
		$('#before').focus();
		key('Escape');
		expect(document.activeElement).toBe($('#before'));
	});

	it('traps Tab inside the open drawer, skipping hidden controls', () => {
		$('#open-filters').click();
		$('#apply-filters').focus();
		const fwd = key('Tab');
		expect(fwd.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe($('#close-filters'));
		const back = key('Tab', true);
		expect(back.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe($('#apply-filters'));
	});

	it('lets Tab move normally between middle controls', () => {
		$('#open-filters').click();
		$('#close-filters').focus();
		expect(key('Tab').defaultPrevented).toBe(false);
	});

	it('pulls stray focus back into the drawer on Tab', () => {
		$('#open-filters').click();
		$('#before').focus();
		key('Tab');
		expect(drawer().contains(document.activeElement)).toBe(true);
	});

	it('does not trap Tab while closed', () => {
		$('#before').focus();
		expect(key('Tab').defaultPrevented).toBe(false);
	});

	it('unbinds its key handler once the drawer is swapped out (View Transitions)', () => {
		$('#open-filters').click();
		document.body.innerHTML = '<button id="x">X</button><button id="y">Y</button>';
		$('#y').focus();
		expect(key('Tab').defaultPrevented).toBe(false);
	});
});

describe('chip ARIA state', () => {
	beforeEach(() => {
		document.body.innerHTML = MARKUP;
	});

	it('plain-button category chips use aria-pressed, never aria-selected', () => {
		initFilterToolbar({ pageSize: 50 });
		const all = $('.chip[data-filter="all"]');
		const pack = $('.chip[data-filter="pack"]');
		// The stale server-rendered aria-selected is replaced at init.
		expect(pack.hasAttribute('aria-selected')).toBe(false);
		expect(pack.getAttribute('aria-pressed')).toBe('false');
		pack.click();
		expect(pack.getAttribute('aria-pressed')).toBe('true');
		expect(pack.classList.contains('active')).toBe(true);
		expect(all.getAttribute('aria-pressed')).toBe('false');
		expect(all.hasAttribute('aria-selected')).toBe(false);
	});

	it('chips with role="tab" keep aria-selected (valid for that role)', () => {
		document.querySelectorAll('.chip').forEach((c) => c.setAttribute('role', 'tab'));
		$('.chip[data-filter="all"]').classList.add('active');
		initFilterToolbar({ pageSize: 50 });
		const pack = $('.chip[data-filter="pack"]');
		pack.click();
		expect(pack.getAttribute('aria-selected')).toBe('true');
		expect($('.chip[data-filter="all"]').getAttribute('aria-selected')).toBe('false');
		expect(pack.hasAttribute('aria-pressed')).toBe(false);
	});

	it('a .chip without data-filter (e.g. a link) gets no ARIA state', () => {
		document.body.insertAdjacentHTML('beforeend', '<a class="chip" href="/x">Link</a>');
		initFilterToolbar({ pageSize: 50 });
		$('.chip[data-filter="pack"]').click();
		const link = $('a.chip');
		expect(link.hasAttribute('aria-pressed')).toBe(false);
		expect(link.hasAttribute('aria-selected')).toBe(false);
	});

	it('facet chips with role="option" get aria-selected, plain ones aria-pressed', () => {
		document.body.insertAdjacentHTML('beforeend', '<div role="listbox" aria-multiselectable="true"><span class="facet-fmt" role="option" data-value="midi">MIDI</span></div>');
		initFilterToolbar({
			pageSize: 50,
			attributeFacets: [
				{ key: 'genre', dataKey: 'genre', chipSelector: '.facet-genre' },
				{ key: 'fmt', dataKey: 'fmt', chipSelector: '.facet-fmt' },
			],
		});
		$('.facet-genre').click();
		$('.facet-fmt').click();
		expect($('.facet-genre').getAttribute('aria-pressed')).toBe('true');
		expect($('.facet-fmt').getAttribute('aria-selected')).toBe('true');
		expect($('.facet-fmt').hasAttribute('aria-pressed')).toBe(false);
		$('#clear-filters').click();
		expect($('.facet-genre').getAttribute('aria-pressed')).toBe('false');
		expect($('.facet-fmt').getAttribute('aria-selected')).toBe('false');
	});
});
