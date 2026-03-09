<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ResourceViewer } from '$lib/components/resource-viewer/index.js';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: page.url.searchParams.get('kind') ?? 'Resource',
			url: resolve('/(auth)/[cluster]/[namespace]', {
				cluster: page.params.cluster!,
				namespace: page.params.namespace!
			})
		},
		{
			title: page.url.searchParams.get('kind') ?? 'Resource',
			url: resolve('/(auth)/[cluster]/[namespace]/[name]', {
				cluster: page.params.cluster!,
				namespace: page.params.namespace!,
				name: page.params.name!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(page.params.namespace ?? '');
	const name = $derived(page.params.name ?? '');
	const group = $derived(page.url.searchParams.get('group') ?? '');
	const version = $derived(page.url.searchParams.get('version') ?? '');
	const kind = $derived(page.url.searchParams.get('kind') ?? '');
	const resource = $derived(page.url.searchParams.get('resource') ?? '');
</script>

{#key cluster + namespace + name + group + version + kind + resource}
	<ResourceViewer {cluster} {namespace} {name} {group} {version} {kind} {resource} />
{/key}
