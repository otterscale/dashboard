<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { ModelOtterscaleIoV1Alpha1ModelService } from '@otterscale/types';

	import Delete from '$lib/components/kind-viewer/kind-viewer-actions/default/delete.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	// import Edit from '$lib/components/kind-viewer/kind-viewer-actions/model-service/edit.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	let {
		schema,
		object,
		cluster,
		group,
		version,
		kind,
		resource
	}: {
		schema: any;
		object: ModelOtterscaleIoV1Alpha1ModelService;
		cluster: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
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
				<View {schema} {object} />
			</DropdownMenu.Item>
			<!-- <DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Edit
					{schema}
					{object}
					{cluster}
					{group}
					{version}
					{kind}
					{resource}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item> -->
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Delete
					{schema}
					{object}
					{cluster}
					{group}
					{version}
					{kind}
					{resource}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
