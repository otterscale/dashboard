<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	import Delete from '$lib/components/kind-viewer/kind-viewer-actions/default/delete.svelte';
	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import Edit from '$lib/components/kind-viewer/kind-viewer-actions/default/edit.svelte';
	import Log from '$lib/components/kind-viewer/kind-viewer-actions/default/log.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

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
</script>

<DropdownMenu.Root bind:open={actionsOpen}>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<div class="flex justify-end">
				<Button size="icon" variant="ghost" class="shadow-none" aria-label="Edit item" {...props}>
					<Ellipsis size={16} aria-hidden="true" />
				</Button>
			</div>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Item onSelect={(e) => e.preventDefault()}>
				<View {schema} {object} />
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={(e) => e.preventDefault()}>
				<Describe
					{cluster}
					{namespace}
					{group}
					{version}
					{resource}
					{object}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={(e) => e.preventDefault()}>
				<Log
					{cluster}
					{object}
					{kind}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={(e) => e.preventDefault()}>
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
			</DropdownMenu.Item>
			<DropdownMenu.Item onSelect={(e) => e.preventDefault()}>
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
