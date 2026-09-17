<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import SiHelm from '@icons-pack/svelte-simple-icons/icons/SiHelm';
	import BadgeAlertIcon from '@lucide/svelte/icons/badge-alert';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import TagIcon from '@lucide/svelte/icons/tag';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import type { Row } from '@tanstack/table-core';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as HoverCard from '$lib/components/ui/hover-card/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Separator } from '$lib/components/ui/separator';

	import Actions from './chart-viewer-actions/actions.svelte';
	import type { ChartAttribute } from './table-layout';
	import type { ChartVariant } from './variants';

	let {
		row,
		chartVariant,
		cluster,
		namespace
	}: {
		row: Row<Record<ChartAttribute, JsonValue>>;
		chartVariant: ChartVariant;
		cluster: string;
		namespace: string;
	} = $props();

	const tierDescriptions: Record<string, string> = {
		official: 'Provided and maintained by Phison.',
		certified: 'Provided by a certified ISV partner.'
	};
</script>

<Card.Root>
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={row.original.icon as string} alt="helm" />
					<Avatar.Fallback>
						<SiHelm class="size-4" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title class="font-bold">
					{row.original['Chart Name']}
					<Badge variant="outline">{row.original.Version}</Badge>
				</Item.Title>
				<Item.Description>
					{row.original['Helm Repository']}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Actions {row} {chartVariant} {cluster} {namespace} />
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content class="flex flex-1">
		<Item.Root class="col-span-2 items-start p-0">
			<Item.Content class="text-left">
				<Item.Description>
					{row.original['Description']}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</Card.Content>
	<Card.Footer class="text-xs text-gray-500">
		{@const tags: string[] = row.original.Labels as string[]}
		{#if tags.length}
			<div class="flex h-full gap-2 overflow-hidden">
				{#each tags.slice(0, 3) as tag, index (index)}
					<span class="flex items-center gap-1">
						<TagIcon size={12} />
						{tag}
					</span>
				{/each}
				{#if tags.length > 3}
					<span class="flex items-center gap-1">
						<TagsIcon size={12} />
						more
					</span>
				{/if}
			</div>
		{:else}
			{@const type = row.original.Type as string}
			<span class="flex items-center gap-1">
				<TagIcon size={12} />
				{type}
			</span>
		{/if}
		{#if row.original.Tier}
			{@const tier = row.original.Tier as string}
			{@const incompatibility = row.original.Incompatibility as string | null}
			{@const official = tier === 'official'}
			<HoverCard.Root>
				<HoverCard.Trigger class="ml-auto flex w-9 justify-center">
					{#if official && incompatibility}
						<BadgeAlertIcon size={16} class="text-destructive" />
					{:else if official}
						<BadgeCheckIcon size={16} />
					{:else if incompatibility}
						<ShieldAlertIcon size={16} class="text-destructive" />
					{:else}
						<ShieldCheckIcon size={16} />
					{/if}
				</HoverCard.Trigger>
				<HoverCard.Content class="w-72 space-y-2 text-xs">
					<p class="text-sm font-medium capitalize">
						{tier}{incompatibility ? ' · Incompatible' : ''}
					</p>
					<Separator />
					<p class="text-muted-foreground">{incompatibility ?? tierDescriptions[tier]}</p>
				</HoverCard.Content>
			</HoverCard.Root>
		{/if}
	</Card.Footer>
</Card.Root>
