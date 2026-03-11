<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient } from '@connectrpc/connect';
	import { type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Schema } from 'ajv';
	import { getContext, onMount } from 'svelte';
	import { stringify } from 'yaml';

	import { page } from '$app/state';
	import {
		filterRequiredSchema,
		getInitialValues
	} from '$lib/components/dynamic-form/utils.svelte';
	import SchemaViewer from '$lib/components/schema-viewer/schema-viewer.svelte';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const cluster = $derived(page.url.searchParams.get('cluster') ?? '');
	const group = $derived(page.url.searchParams.get('group') ?? '');
	const version = $derived(page.url.searchParams.get('version') ?? '');
	const kind = $derived(page.url.searchParams.get('kind') ?? '');

	let schema: Schema | undefined = $state(undefined);

	let initialValues: JsonValue | undefined = $state(undefined);
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

<div class="flex gap-4">
	{#if schema}
		<SchemaViewer {schema} />
		{#await getInitialValues(filterRequiredSchema(schema)) then}
			<pre>{stringify(initialValues, null, 2)}</pre>
		{/await}
	{/if}
</div>
