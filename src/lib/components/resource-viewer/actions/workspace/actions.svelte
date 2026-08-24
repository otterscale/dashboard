<script lang="ts">
	import { EllipsisIcon } from '@lucide/svelte';
	import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import Edit from './edit.svelte';
	import View from './view.svelte';

	let {
		role,
		cluster,
		group,
		version,
		kind,
		resource,
		schema,
		object
	}: {
		role: string;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		object?: any;
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<div class="flex justify-end">
				<Button size="icon" variant="ghost" class="shadow-none" aria-label="Actions" {...props}>
					<EllipsisIcon aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-full">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {object} />
			</DropdownMenu.Item>
			<!-- <DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Edit
					{cluster}
					{namespace}
					{group}
					{version}
					{kind}
					{resource}
					{schema}
					{object}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item> -->
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
