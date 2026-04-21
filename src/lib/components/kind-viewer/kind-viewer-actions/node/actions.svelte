<script lang="ts">
	import { GpuIcon } from '@lucide/svelte';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { Schema } from 'ajv';

	import Describe from '$lib/components/kind-viewer/kind-viewer-actions/default/describe.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Item from '$lib/components/ui/item';

	import GPU from './gpu.svelte';
	import GpuAllocation from './gpu-allocation.svelte';

	let {
		cluster,
		namespace,
		group,
		version,
		resource,
		schema,
		object
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		resource: string;
		schema: Schema;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
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
	<DropdownMenu.Content align="end" class="w-full">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<GpuAllocation
					{cluster}
					{object}
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
				<View {schema} {object} />
			</DropdownMenu.Item>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Describe {cluster} {namespace} {group} {version} {resource} {object} />
			</DropdownMenu.Item>
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger class="w-full">
					<Item.Root class="p-0 text-xs" size="sm">
						<Item.Media>
							<GpuIcon />
						</Item.Media>
						<Item.Content>
							<Item.Title>GPU</Item.Title>
						</Item.Content>
					</Item.Root>
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					<GPU {cluster} {group} {version} {resource} {object} />
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
