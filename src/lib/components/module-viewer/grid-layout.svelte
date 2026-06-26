<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import SiHelm from '@icons-pack/svelte-simple-icons/icons/SiHelm';
	import TagIcon from '@lucide/svelte/icons/tag';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';

	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Item from '$lib/components/ui/item';

	import Actions from './module-viewer-actions/actions.svelte';
	import type { ModuleAttribute } from './table-layout';

	let {
		row,
		cluster,
		schema,
		validate
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
		schema: Schema;
		validate?: ValidateFunction;
	} = $props();
</script>

<Card.Root>
	<Card.Header>
		<Item.Root class="items-start p-0">
			<Item.Media>
				<Avatar.Root>
					<Avatar.Image src={row.original['icon'] as string} alt="helm" />
					<Avatar.Fallback>
						<SiHelm class="size-4" />
					</Avatar.Fallback>
				</Avatar.Root>
			</Item.Media>
			<Item.Content class="text-left">
				<Item.Title class="font-bold">
					{row.original['Name']}
					<Badge variant="outline">{row.original['Latest Version'] as string}</Badge>
				</Item.Title>
				<Item.Description>
					{@const tags: string[] = row.original['Labels'] as string[]}
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
									+ {tags.length - 3} tags
								</span>
							{/if}
						</div>
					{/if}
				</Item.Description>
			</Item.Content>
			<Item.Actions>
				<Actions {row} {cluster} {schema} {validate} />
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
	<Card.Footer>
		<div class="ml-auto">
			{#if row.original['Installed']}
				<Badge class="relative overflow-visible">
					{row.original['Installed Version']}
					installed
					{#if row.original.canUpdate}
						<span class="pointer-events-none absolute -top-2 -right-2 z-10 flex size-3">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"
							></span>
							<span class="relative inline-flex size-3 rounded-full bg-blue-500"></span>
						</span>
					{/if}
				</Badge>
			{/if}
		</div>
	</Card.Footer>
</Card.Root>
