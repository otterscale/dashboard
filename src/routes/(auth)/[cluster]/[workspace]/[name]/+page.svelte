<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import { ResourceViewer } from '$lib/components/resource-viewer/index.js';
	import { breadcrumbs } from '$lib/stores';

	$effect(() => {
		// Set breadcrumbs navigation
		breadcrumbs.set([
			{
				title: page.url.searchParams.get('kind') ?? 'Resource',
				url: (resolve('/(auth)/[cluster]/[workspace]', {
					cluster: page.params.cluster!,
					workspace: page.params.workspace!
				}) + page.url.search) as ResolvedPathname
			},
			{
				title: page.params.name!,
				url: resolve('/(auth)/[cluster]/[workspace]/[name]', {
					cluster: page.params.cluster!,
					workspace: page.params.workspace!,
					name: page.params.name!
				})
			}
		]);
	});

	const namespaced = $derived(page.url.searchParams.get('namespaced') !== 'false');

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(namespaced ? (page.data.namespace ?? '') : '');
	const name = $derived(page.params.name ?? '');
	const group = $derived(page.url.searchParams.get('group') ?? '');
	const version = $derived(page.url.searchParams.get('version') ?? '');
	const kind = $derived(page.url.searchParams.get('kind') ?? '');
	const resource = $derived(page.url.searchParams.get('resource') ?? '');
</script>

{#key page.url.href}
	<ResourceViewer {cluster} {namespace} {name} {group} {version} {kind} {resource} />
{/key}
