<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import SiHelm from '@icons-pack/svelte-simple-icons/icons/SiHelm';
	import BookmarkIcon from '@lucide/svelte/icons/bookmark';
	import BoxesIcon from '@lucide/svelte/icons/boxes';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import type { Row } from '@tanstack/table-core';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';
	import type { ArtifactType } from '$lib/server/harbor';

	import Actions from './artifact-viewer-actions/actions.svelte';
	import type { ArtifactAttribute } from './table-layout';

	let {
		row,
		cluster,
		namespace
	}: {
		row: Row<Record<ArtifactAttribute, JsonValue>>;
		cluster: string;
		namespace: string;
	} = $props();

	const latestChartArtifact = $derived(row.original.chartArtifact as unknown as ArtifactType);
	const helmRepository = $derived(
		row.original.helmRepository as SourceToolkitFluxcdIoV1HelmRepository
	);

	const extraAttributes = $derived(latestChartArtifact.extra_attrs ?? {});
</script>

<Card.Root>
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={extraAttributes.icon as string} alt="helm" />
					<Avatar.Fallback>
						<SiHelm class="size-4" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title class="font-bold">
					{extraAttributes.name}
					<Badge>{extraAttributes.version}</Badge>
				</Item.Title>
				<Item.Description>
					{latestChartArtifact.repository_name}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Actions {cluster} {namespace} chartArtifact={latestChartArtifact} {helmRepository} />
			</Item.Actions>
		</Item.Root>
	</Card.Header>
	<Card.Content>
		<Item.Root class="col-span-2 items-start p-0">
			<Item.Content class="text-left">
				<Item.Description>
					{extraAttributes.description}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</Card.Content>
	<Card.Footer class="flex gap-1 overflow-hidden text-xs text-gray-500">
		<BoxesIcon size={12} />
		{helmRepository?.metadata?.name}
		{@const labels = latestChartArtifact.labels ?? []}
		{@const tags = latestChartArtifact.tags ?? []}
		{#each labels as label, index (index)}
			<BookmarkIcon size={12} />
			{label.name}
		{/each}
		{#each tags as tag, index (index)}
			<TagsIcon size={12} />
			{tag.name}
		{/each}
	</Card.Footer>
</Card.Root>
