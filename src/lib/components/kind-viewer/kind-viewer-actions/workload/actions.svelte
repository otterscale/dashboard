<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	import Delete from '$lib/components/kind-viewer/kind-viewer-actions/default/delete.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import Restart from './restart.svelte';
	import Scale from './scale.svelte';

	let {
		schema,
		object,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource
	}: {
		schema: any;
		object: any;
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
	} = $props();

	let actionsOpen = $state(false);

	// DaemonSet doesn't support scaling (no replicas concept)
	const supportsScale = $derived(kind !== 'DaemonSet');
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
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			{#if supportsScale}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Scale
						{cluster}
						{namespace}
						{group}
						{version}
						{kind}
						{resource}
						{object}
						onOpenChangeComplete={() => {
							actionsOpen = false;
						}}
					/>
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Restart
					{cluster}
					{namespace}
					{group}
					{version}
					{kind}
					{resource}
					{object}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
		</DropdownMenu.Group>
		<DropdownMenu.Separator />
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Delete
					{schema}
					{object}
					{cluster}
					{namespace}
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
