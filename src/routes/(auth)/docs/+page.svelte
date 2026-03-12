<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Schema } from 'ajv';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.url.searchParams.get('cluster') ?? '');
	const group = $derived(page.url.searchParams.get('group') ?? '');
	const version = $derived(page.url.searchParams.get('version') ?? '');
	const kind = $derived(page.url.searchParams.get('kind') ?? '');

	let schema: Schema | undefined = $state(undefined);

	onMount(async () => {
		const response = await resourceClient.schema({
			cluster: cluster!,
			group: group!,
			version: version!,
			kind: kind!
		});
		schema = response.schema;
	});
</script>

<SchemaViewer {schema} />
