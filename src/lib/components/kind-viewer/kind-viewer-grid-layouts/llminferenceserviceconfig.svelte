<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import BrainCircuitIcon from '@lucide/svelte/icons/brain-circuit';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import Actions from '../kind-viewer-actions/llm-inference-service-config/actions.svelte';
	import type { LLMInferenceServiceConfigAttribute } from '../kind-viewer-columns/llminferenceserviceconfig';

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
		row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate: ValidateFunction;
	} = $props();

	const object = $derived(
		row.original['raw'] as unknown as ServingKserveIoV1Alpha2LLMInferenceServiceConfig
	);
	const rowNamespace = $derived(object?.metadata?.namespace ?? namespace);
</script>

<Card.Root>
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Fallback>
						<BrainCircuitIcon class="size-4" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title class="font-bold">
					{row.original['Name']}
				</Item.Title>
				<Item.Description>
					{row.original['Namespace']}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Actions
					{cluster}
					namespace={rowNamespace}
					{group}
					{version}
					{kind}
					{resource}
					{schema}
					{validate}
					{object}
				/>
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content class="flex flex-1 flex-col gap-2">
		{@const modelName = row.original['Model Name'] as string | null}
		{#if modelName}
			<p>{modelName}</p>
		{/if}
		{@const modelUri = row.original['Model URI'] as string | null}
		{#if modelUri}
			<p>{modelUri}</p>
		{/if}
	</Card.Content>
	<Card.Footer class="flex flex-wrap items-center gap-2 text-xs">
		{@const mode = row.original['Mode'] as string}
		{#if mode}
			<p>{mode}</p>
		{/if}
	</Card.Footer>
</Card.Root>
