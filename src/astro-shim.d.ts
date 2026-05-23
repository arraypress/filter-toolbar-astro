declare module '*.astro' {
	const component: (_props: Record<string, unknown>) => unknown;
	export default component;
}
