<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import BotIcon from '@lucide/svelte/icons/bot';
	import BrainCircuitIcon from '@lucide/svelte/icons/brain-circuit';
	import GitBranchIcon from '@lucide/svelte/icons/git-branch';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import LinkIcon from '@lucide/svelte/icons/link';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Row } from '@tanstack/table-core';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import type { LLMInferenceServiceConfigAttribute } from '../kind-viewer-columns/llminferenceserviceconfig';

	let {
		row,
		cluster: _cluster
	}: {
		row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
		cluster: string;
	} = $props();
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
					{@const mode = row.original['Mode'] as string}
					{#if mode}
						<Badge variant="outline">{mode}</Badge>
					{/if}
				</Item.Title>
				<Item.Description>
					<span class="flex items-center gap-1">
						<LayersIcon size={12} />
						{row.original['Namespace']}
					</span>
				</Item.Description>
			</Item.Content>
			<Item.Actions></Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content class="flex flex-1 flex-col gap-2">
		<Item.Root class="items-start p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-muted-foreground text-xs uppercase">Model</Item.Title>
				<span class="flex items-center gap-1">
					<BotIcon size={12} />
					{row.original['Model Name']}
				</span>
			</Item.Content>
		</Item.Root>
		{@const modelUri = row.original['Model URI'] as string | null}
		{#if modelUri}
			<span class="text-muted-foreground flex items-start gap-1 break-all text-xs">
				<LinkIcon size={12} />
				{modelUri}
			</span>
		{:else}
			<span class="text-muted-foreground text-xs">No model URI</span>
		{/if}
	</Card.Content>
	<Card.Footer class="flex flex-wrap items-center gap-2 text-xs">
		{@const raw = row.original['raw'] as unknown as
			| ServingKserveIoV1Alpha2LLMInferenceServiceConfig
			| undefined}
		{@const baseRefs = raw?.spec?.baseRefs ?? []}
		{@const hasTemplate = Boolean(raw?.spec?.template)}
		{@const hasPrefill = Boolean(raw?.spec?.prefill)}
		{@const hasRouter = Boolean(raw?.spec?.router)}
		{@const hasWorker = Boolean(raw?.spec?.worker)}
		{#if baseRefs.length}
			<div class="flex flex-wrap items-center gap-2">
				{#each baseRefs.slice(0, 2) as baseRef, index (index)}
					<Badge variant="outline">
						<GitBranchIcon size={12} />
						{baseRef.name}
					</Badge>
				{/each}
				{#if baseRefs.length > 2}
					<Badge variant="outline">+{baseRefs.length - 2} more</Badge>
				{/if}
			</div>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			{#if hasTemplate}
				<Badge variant="secondary">Template</Badge>
			{/if}
			{#if hasPrefill}
				<Badge variant="secondary">Prefill</Badge>
			{/if}
			{#if hasRouter}
				<Badge variant="secondary">Router</Badge>
			{/if}
			{#if hasWorker}
				<Badge variant="secondary">Worker</Badge>
			{/if}
		</div>
		<span class="text-muted-foreground ml-auto">{row.original['Age']}</span>
	</Card.Footer>
</Card.Root>
