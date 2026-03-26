<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { SiHelm } from '@icons-pack/svelte-simple-icons';
	import { BoxesIcon, TagsIcon } from '@lucide/svelte';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Row } from '@tanstack/table-core';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import Actions from './artifact-viewer-actions/actions.svelte';
	import type { ChartAttribute } from './table-layout';
	import type { ChartType } from './types';

	let {
		row,
		cluster,
		namespace
	}: {
		row: Row<Record<ChartAttribute, JsonValue>>;
		cluster: string;
		namespace: string;
	} = $props();

	const chart = $derived(row.original.chart as ChartType);
	const helmRepository = $derived(
		row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository
	);
</script>

<Card.Root>
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={chart.icon as string} alt="helm" />
					<Avatar.Fallback>
						<SiHelm class="size-4" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title class="font-bold">
					{chart.name ?? chart.repository_name}
					<Badge>{chart.version ?? chart.extra_attrs?.version}</Badge>
				</Item.Title>
				<Item.Description>
					{chart.name ?? chart.repository_name}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Actions {cluster} {namespace} {chart} {helmRepository} />
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content>
		<Item.Root class="col-span-2 items-start p-0">
			<Item.Content class="text-left">
				<Item.Description>
					{chart.description}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</Card.Content>
	<Card.Footer class="flex gap-1 overflow-hidden text-xs text-gray-500">
		<BoxesIcon size={12} />
		{helmRepository?.metadata?.name}
		{@const keywords = chart.keywords ?? []}
		{#each keywords.slice(0, 3) as keyword, index (index)}
			<TagsIcon size={12} />
			{keyword}
		{/each}
	</Card.Footer>
</Card.Root>
