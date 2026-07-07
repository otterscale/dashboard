<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { BotIcon, EllipsisIcon } from '@lucide/svelte';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';
	import lodash from 'lodash';

	import { Badge } from '$lib/components/ui/badge/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import Actions from '../kind-viewer-actions/modeltemplate/actions.svelte';
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
		schema?: Schema;
		validate?: ValidateFunction;
	} = $props();

	const object = $derived(
		row.original['raw'] as unknown as ServingKserveIoV1Alpha2LLMInferenceServiceConfig
	);
	const rowNamespace = $derived(object?.metadata?.namespace ?? namespace);
</script>

<Card.Root class="bg-card">
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media variant="image" class="bg-muted">
				<BotIcon />
			</Item.Media>
			<Item.Content class="min-w-0 text-left">
				<Item.Title>
					{row.original['Name']}
				</Item.Title>
				<Item.Description>
					{row.original['Namespace']}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				{#if schema && validate}
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
				{:else}
					<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" disabled>
						<EllipsisIcon size={16} aria-hidden="true" />
					</Button>
				{/if}
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content class="flex flex-1 gap-3">
		{@const modelName = row.original['Model Name'] as string | null}
		{@const modelUri = row.original['Model URI'] as string | null}
		{#if modelName}
			<Item.Root class="items-start p-0">
				<Item.Content class="min-w-0 text-left">
					<Item.Title>Model</Item.Title>
					<Item.Description>
						{modelName}
					</Item.Description>
				</Item.Content>
			</Item.Root>
			<Item.Root class="items-start p-0">
				<Item.Content class="min-w-0 text-left">
					<Item.Title>Source</Item.Title>
					<Item.Description>
						{modelUri}
					</Item.Description>
				</Item.Content>
			</Item.Root>
		{/if}
	</Card.Content>
	<Card.Footer class="flex items-center gap-2 ">
		{@const mode = row.original['Mode'] as string}
		{@const containers = lodash.get(row.original.raw, ['spec', 'template', 'containers'])}
		{@const isMiddleWare =
			Array.isArray(containers) &&
			containers
				.map((container) => container?.image ?? '')
				.find((image) => image.includes('/ai-mw/'))}
		{#if mode}
			<Badge>
				{mode}
			</Badge>
		{/if}
		{#if isMiddleWare}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Badge>KV-Cache Management</Badge>
				</Tooltip.Trigger>
				<Tooltip.Content>
					Offload KV cache beyond accelerator memory (CPU/disk) to hold a larger working set for
					multi-turn requests.
				</Tooltip.Content>
			</Tooltip.Root>
		{:else}
			<Tooltip.Root>
				<Tooltip.Trigger>
					<Badge>Intelligent Routing</Badge>
				</Tooltip.Trigger>
				<Tooltip.Content>
					vLLM with prefix-cache + EPP load-aware routing. EPP routes by live XGBoost latency
					predictions instead of utilization heuristics.
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</Card.Footer>
</Card.Root>
