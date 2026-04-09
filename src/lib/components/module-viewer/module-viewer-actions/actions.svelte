<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { Row } from '@tanstack/table-core';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import type { ModuleAttribute } from '../table-layout';
	import InstallFromHarbor from './install-from-harbor.svelte';
	import InstallFromIndex from './install-from-index.svelte';
	import { getSetUp, type SetUpType } from './setup/index.ts';
	import View from './view.svelte';

	let {
		row,
		cluster
	}: {
		row: Row<Record<ModuleAttribute, JsonValue>>;
		cluster: string;
	} = $props();

	let actionsOpen = $state(false);
</script>

<DropdownMenu.Root bind:open={actionsOpen}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button size="icon-sm" variant="ghost" class="shadow-none" aria-label="Actions" {...props}>
				<Ellipsis size={16} aria-hidden="true" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-full">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {row} />
			</DropdownMenu.Item>

			{#if row.original.installable}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					{#if row.original.sourceType === 'harbor'}
						<InstallFromHarbor
							{row}
							{cluster}
							onOpenChangeComplete={() => {
								actionsOpen = false;
							}}
						/>
					{:else}
						<InstallFromIndex
							{row}
							{cluster}
							onOpenChangeComplete={() => {
								actionsOpen = false;
							}}
						/>
					{/if}
				</DropdownMenu.Item>
				{@const SetUp: SetUpType = getSetUp(row.original['Chart Name'] as string, row.original.sourceType as string)}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<SetUp
						{row}
						{cluster}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			{/if}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
