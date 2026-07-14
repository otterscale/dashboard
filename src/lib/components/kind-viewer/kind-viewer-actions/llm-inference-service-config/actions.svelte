<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { ServingKserveIoV1Alpha2LLMInferenceServiceConfig } from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import type { ValidateFunction } from 'ajv';
	import lodash from 'lodash';

	import { page } from '$app/state';
	import Delete from '$lib/components/kind-viewer/kind-viewer-actions/default/delete.svelte';
	import Edit from '$lib/components/kind-viewer/kind-viewer-actions/default/edit.svelte';
	import View from '$lib/components/kind-viewer/kind-viewer-actions/default/view.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	import Copy from './copy.svelte';
	import Deploy from './deploy.svelte';

	let {
		cluster,
		namespace,
		group,
		version,
		kind,
		resource,
		schema,
		validate,
		object
	}: {
		cluster: string;
		namespace: string;
		group: string;
		version: string;
		kind: string;
		resource: string;
		schema: Schema;
		validate: ValidateFunction;
		object: ServingKserveIoV1Alpha2LLMInferenceServiceConfig;
	} = $props();

	let actionsOpen = $state(false);

	const targetNamespace = page.data.namespace;
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
		{@const containers = lodash.get(object, ['spec', 'template', 'containers'])}
		{@const isMiddleWare =
			Array.isArray(containers) &&
			containers
				.map((container) => container?.image ?? '')
				.find((image) => image.includes('/ai-mw/'))}
		<DropdownMenu.Group>
			<DropdownMenu.Label>Inspect</DropdownMenu.Label>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<View {schema} {object} />
			</DropdownMenu.Item>
			<DropdownMenu.Separator />
			<DropdownMenu.Label>Manage</DropdownMenu.Label>
			<DropdownMenu.Item
				onSelect={(e) => {
					e.preventDefault();
				}}
			>
				<Deploy
					{cluster}
					namespace={targetNamespace}
					{schema}
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
				<Edit
					{cluster}
					{namespace}
					{group}
					{version}
					{kind}
					{resource}
					{schema}
					{validate}
					{object}
					onOpenChangeComplete={() => {
						actionsOpen = false;
					}}
				/>
			</DropdownMenu.Item>
			{#if !isMiddleWare}
				<DropdownMenu.Item
					onSelect={(e) => {
						e.preventDefault();
					}}
				>
					<Copy
						{cluster}
						namespace={targetNamespace}
						{group}
						{version}
						{kind}
						{resource}
						{schema}
						{validate}
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
				<Delete
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
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
