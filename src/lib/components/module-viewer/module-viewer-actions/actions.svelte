<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { Row } from '@tanstack/table-core';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import type { ModuleAttribute } from '../table-layout';
	import Install from './install.svelte';
	import InstallRookCephCluster from './install-rook-ceph-cluster.svelte';
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
			<div class="flex justify-end">
				<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" {...props}>
					<Ellipsis size={16} aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {row} />
			</DropdownMenu.Item>
			{#if row.original.installable && row.original['Chart Name'] === 'otterscale-rook-ceph-cluster'}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<InstallRookCephCluster
						{row}
						{cluster}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			{:else if row.original.installable}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Install
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
