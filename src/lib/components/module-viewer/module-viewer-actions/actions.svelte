<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { Schema } from '@sjsf/form';
	import type { Row } from '@tanstack/table-core';
	import type { ValidateFunction } from 'ajv';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import type { ModuleAttribute } from '../table-layout';
	import Install from './install.svelte';
	import Uninstall from './uninstall.svelte';
	import Upgrade from './upgrade.svelte';
	import View from './view.svelte';

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

	let actionsOpen = $state(false);
	const isInstalled = $derived(row.original['Installed'] === true);
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

			{#if isInstalled}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Upgrade
						{row}
						{cluster}
						{schema}
						{validate}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Uninstall
						{cluster}
						{row}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			{:else}
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
