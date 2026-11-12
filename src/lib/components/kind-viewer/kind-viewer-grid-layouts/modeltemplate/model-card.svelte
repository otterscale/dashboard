<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import BotIcon from '@lucide/svelte/icons/bot';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';

	import Actions from '$lib/components/kind-viewer/kind-viewer-actions/modeltemplate/actions.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import { describeEntry } from './catalog';

	/**
	 * One card per model entry: the row is the entry, the card shows what the
	 * entry declares, and the actions pick a deployment template on top of it.
	 */
	let {
		row,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema,
		validate
	}: {
		row: Row<Record<string, JsonValue>>;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema?: Schema;
		validate?: ValidateFunction;
	} = $props();

	const object = $derived(
		row.original['raw'] as unknown as ServingKserveIoV1Alpha2LLMInferenceServiceConfig
	);
	const entry = $derived(describeEntry(object));
</script>

<Card.Root class="bg-card">
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media variant="image" class="bg-muted">
				<BotIcon />
			</Item.Media>
			<Item.Content class="min-w-0 text-left">
				<Item.Title class="truncate">
					{entry.modelName}
				</Item.Title>
				{#if entry.vendor}
					<Item.Description class="truncate">{entry.vendor}</Item.Description>
				{/if}
			</Item.Content>
			<Item.Actions>
				{#if schema && validate}
					<Actions
						{cluster}
						namespace={entry.namespace || namespace}
						{group}
						{version}
						{kind}
						{resource}
						{schema}
						{validate}
						{object}
					/>
				{:else}
					<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" disabled>
						<EllipsisIcon size={16} aria-hidden="true" />
					</Button>
				{/if}
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	{#if entry.description}
		<Card.Content class="flex-1">
			<p class="line-clamp-4 text-left text-sm text-muted-foreground">{entry.description}</p>
		</Card.Content>
	{/if}
</Card.Root>
