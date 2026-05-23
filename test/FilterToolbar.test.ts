import { describe, it, expect, beforeAll } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import FilterToolbarRaw from '../src/FilterToolbar.astro';
import type { FilterToolbarProps } from '../src/types';

const FilterToolbar = FilterToolbarRaw as Parameters<AstroContainer['renderToString']>[0];

let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

async function render(props: FilterToolbarProps = {}): Promise<string> {
	return container.renderToString(FilterToolbar, {
		props: props as unknown as Record<string, unknown>,
	});
}

function getAttr(html: string, idValue: string, name: string): string | null {
	const idRe = new RegExp(`<[^>]*id="${idValue}"[^>]*>`);
	const tag = idRe.exec(html)?.[0] ?? '';
	const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
	return m ? m[1] : null;
}

describe('<FilterToolbar>', () => {
	it('renders the Filters trigger with the correct id by default', async () => {
		const html = await render();
		expect(html).toMatch(/id="open-filters"/);
	});

	it('omits the Filters trigger when showFiltersTrigger=false', async () => {
		const html = await render({ showFiltersTrigger: false });
		expect(html).not.toMatch(/id="open-filters"/);
	});

	it('renders the active-filter badge hidden by default', async () => {
		const html = await render();
		const idTag = /<span[^>]*id="active-filter-count"[^>]*>/.exec(html)?.[0];
		expect(idTag).toBeTruthy();
		expect(idTag).toContain('hidden');
	});

	it('shows the results count when provided', async () => {
		const html = await render({ resultsCount: 42 });
		const tag = /<span[^>]*id="results-count"[^>]*>([^<]*)<\/span>/.exec(html);
		expect(tag?.[1]).toBe('42');
	});

	it('uses the default sort options when none provided', async () => {
		const html = await render();
		expect(html).toContain('value="featured"');
		expect(html).toContain('value="newest"');
		expect(html).toContain('value="price-asc"');
		expect(html).toContain('value="price-desc"');
		expect(html).toContain('value="name"');
	});

	it('honours custom sort options', async () => {
		const html = await render({
			sortOptions: [
				{ value: 'featured', label: 'Picks' },
				{ value: 'newest', label: 'Latest' },
			],
		});
		expect(html).toContain('Picks');
		expect(html).toContain('Latest');
		expect(html).not.toContain('value="price-asc"');
	});

	it('sort select has the configured aria-label', async () => {
		const html = await render({ sortAriaLabel: 'Order tracks' });
		expect(getAttr(html, 'sort-select', 'aria-label')).toBe('Order tracks');
	});

	it('renders grid + list view buttons by default', async () => {
		const html = await render();
		expect(html).toMatch(/id="view-grid"/);
		expect(html).toMatch(/id="view-list"/);
	});

	it('omits the view toggle when showViewToggle=false', async () => {
		const html = await render({ showViewToggle: false });
		expect(html).not.toMatch(/id="view-grid"/);
		expect(html).not.toMatch(/id="view-list"/);
	});

	it('grid button starts active', async () => {
		const html = await render();
		const tag = /<button[^>]*id="view-grid"[^>]*>/.exec(html)?.[0];
		expect(tag).toContain('class="fb-toolbar-view-btn active"');
	});

	it('custom filtersLabel + resultsLabel render', async () => {
		const html = await render({ filtersLabel: 'Refine', resultsLabel: 'tracks' });
		expect(html).toContain('Refine');
		expect(html).toContain('tracks');
	});
});
