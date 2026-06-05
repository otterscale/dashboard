<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import SiHelm from '@icons-pack/svelte-simple-icons/icons/SiHelm';
	import TagIcon from '@lucide/svelte/icons/tag';
	import TagsIcon from '@lucide/svelte/icons/tags';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';
	import lodash from 'lodash';

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
		schema?: Schema;
		validate?: ValidateFunction;
	} = $props();
</script>

<Card.Root class={!row.original['installable'] ? 'bg-muted' : 'bg-card'}>
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
					{row.original['Chart Name']}
					<Badge variant="outline">{row.original['LatestVersion'] as string}</Badge>
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
									+{tags.length - 3} tags
								</span>
							{/if}
						</div>
					{:else}
						{@const type = row.original['Type'] as string}
						<span class="flex items-center gap-1">
							<TagIcon size={12} />
							{type}
						</span>
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
	<Card.Footer class="items-between flex gap-4 text-xs text-gray-500">
		{@const dependsOn = lodash.get(
			row.original['annotations'],
			'module.otterscale.io/depends-on',
			''
		) as string}
		{@const dependencies = dependsOn.split(',').filter(Boolean)}
		{@const installedModules = (row.original['installedModules'] ?? []) as string[]}
		{@const prerequisites = dependencies.filter(
			(dependency) => !installedModules.includes(dependency)
		)}
		<div class="flex items-center gap-2">
			{#if dependsOn}
				{#each prerequisites.slice(0, 1) as prerequisite, index (index)}
					<Badge variant="destructive">{prerequisite}</Badge>
				{/each}
				{#if prerequisites.length > 1}
					<Badge variant="destructive">+{prerequisites.length - 1} more</Badge>
				{/if}
			{/if}
		</div>
		<div class="ml-auto">
			{#if row.original['Installed']}
				{@const installedVer = row.original['installedVersion'] as string}
				{@const latestVer = row.original['LatestVersion'] as string}
				{@const hasUpdate = installedVer && latestVer && installedVer !== latestVer}
				<Badge
					variant={hasUpdate ? 'outline' : 'default'}
					class={hasUpdate
						? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
						: ''}
				>
					v{installedVer || '—'}
				</Badge>
			{/if}
		</div>
	</Card.Footer>
</Card.Root>
