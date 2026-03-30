<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import SiHelm from '@icons-pack/svelte-simple-icons/icons/SiHelm';
	import TagIcon from '@lucide/svelte/icons/tag';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import type { Row } from '@tanstack/table-core';
	import lodash from 'lodash';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import Actions from './module-viewer-actions/actions.svelte';
	import type { ModuleAttribute } from './table-layout';

	let {
		row,
		cluster
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
	} = $props();
</script>

<Card.Root class={!row.original.installable ? 'bg-muted' : 'bg-card'}>
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
									+{tags.length - 3} tags
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
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Actions {row} {cluster} />
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
	<Card.Footer class="items-between flex gap-4 text-xs text-gray-500">
		{@const dependsOn = lodash.get(
			row.original.annotations,
			'module.otterscale.io/depends-on',
			''
		) as string}
		{@const dependencies = dependsOn.split(',')}
		<div class="flex items-center gap-2">
			{#if dependsOn}
				{#each dependencies as dependency, index (index)}
					<Badge variant="outline">{dependency}</Badge>
				{/each}
			{/if}
		</div>
		<div class="ml-auto">
			{#if row.original.Installed}
				<Badge>Installed</Badge>
			{/if}
		</div>
	</Card.Footer>
</Card.Root>
