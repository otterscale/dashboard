<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { PlusIcon } from '@lucide/svelte';
	import CreateCronjob from './create-cronjob.svelte';
	import CreateDeployment from './create-deployment.svelte';
	import CreateJob from './create-job.svelte';

	let {
		schema,
		cluster,
		namespace,
		group,
		version,
		kind,
		resource
	}: {
		schema: any;
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
			<Button size="icon" variant="ghost" class="shadow-none" {...props}>
				<PlusIcon size={16} aria-hidden="true" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Group>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<CreateDeployment
					{schema}
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
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<CreateCronjob
					{schema}
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
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<CreateJob
					{schema}
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
